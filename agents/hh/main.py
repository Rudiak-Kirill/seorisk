import json
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import config  # noqa: F401
from collector import run as collector_run
from database import get_session, init_db
from models import Negotiation, SearchProfile, UserProfile, Vacancy
from responder import generate_letter
from scorer import run as scorer_run

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

STATIC_DIR = Path(__file__).parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    scheduler = BackgroundScheduler()
    scheduler.add_job(collector_run, "interval", hours=2, id="collector")
    scheduler.start()
    log.info("Scheduler started — collector every 2h")
    yield
    scheduler.shutdown()


app = FastAPI(title="HH Agent", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
def index():
    return FileResponse(STATIC_DIR / "index.html")


# --- Вакансии ---

@app.get("/api/vacancies")
def get_vacancies(status: str = "", limit: int = 50, offset: int = 0):
    with get_session() as s:
        q = s.query(Vacancy)
        if status:
            q = q.filter(Vacancy.status == status)
        total = q.count()
        items = q.order_by(Vacancy.score.desc().nulls_last(), Vacancy.created_at.desc()).offset(offset).limit(limit).all()
        return {
            "total": total,
            "items": [_vacancy_dict(v) for v in items],
        }


@app.post("/api/vacancies/collect")
def trigger_collect():
    try:
        collector_run()
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/api/vacancies/score")
def trigger_score():
    try:
        scorer_run()
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(500, str(e))


@app.patch("/api/vacancies/{vacancy_id}/hide")
def hide_vacancy(vacancy_id: str):
    return _set_status(vacancy_id, "hidden")


@app.patch("/api/vacancies/{vacancy_id}/applied")
def mark_applied(vacancy_id: str):
    return _set_status(vacancy_id, "applied")


# --- Отклики ---

@app.post("/api/prepare")
def prepare_letter(body: dict):
    vacancy_id = body.get("vacancy_id")
    if not vacancy_id:
        raise HTTPException(400, "vacancy_id required")
    try:
        return generate_letter(vacancy_id)
    except ValueError as e:
        raise HTTPException(404, str(e))
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/api/negotiations")
def get_negotiations():
    with get_session() as s:
        items = s.query(Negotiation).order_by(Negotiation.created_at.desc()).all()
        result = []
        for n in items:
            v = s.query(Vacancy).filter_by(vacancy_id=n.vacancy_id).first()
            result.append({
                "id": n.id,
                "vacancy_id": n.vacancy_id,
                "title": v.title if v else n.vacancy_id,
                "employer": v.employer if v else None,
                "url": v.url if v else None,
                "cover_letter": n.cover_letter,
                "status": n.status,
                "created_at": str(n.created_at),
            })
        return result


# --- Настройки ---

@app.get("/api/settings")
def get_settings():
    with get_session() as s:
        profile = s.query(UserProfile).first()
        search_profiles = s.query(SearchProfile).all()
        return {
            "profile": _profile_dict(profile) if profile else None,
            "search_profiles": [_search_profile_dict(p) for p in search_profiles],
        }


class ProfileIn(BaseModel):
    position: str
    skills: str
    experience_summary: str
    salary_expected: int | None = None
    stop_words: str | None = None
    cover_letter_tone: str = "formal"


@app.put("/api/settings/profile")
def update_profile(body: ProfileIn):
    with get_session() as s:
        profile = s.query(UserProfile).first()
        if profile:
            for k, v in body.model_dump().items():
                setattr(profile, k, v)
        else:
            profile = UserProfile(**body.model_dump())
            s.add(profile)
        s.commit()
    return {"status": "ok"}


class SearchProfileIn(BaseModel):
    keywords: str
    area: int = 1


@app.post("/api/settings/search-profiles")
def add_search_profile(body: SearchProfileIn):
    with get_session() as s:
        s.add(SearchProfile(**body.model_dump()))
        s.commit()
    return {"status": "ok"}


@app.delete("/api/settings/search-profiles/{profile_id}")
def delete_search_profile(profile_id: int):
    with get_session() as s:
        p = s.get(SearchProfile, profile_id)
        if not p:
            raise HTTPException(404, "Профиль не найден")
        s.delete(p)
        s.commit()
    return {"status": "ok"}


# --- PDF импорт ---

@app.post("/api/settings/profile/import-pdf")
async def import_pdf(file: UploadFile):
    import io
    import pdfplumber
    from openai import OpenAI

    content = await file.read()
    text = ""
    with pdfplumber.open(io.BytesIO(content)) as pdf:
        for page in pdf.pages:
            text += (page.extract_text() or "") + "\n"

    if not text.strip():
        raise HTTPException(400, "Не удалось извлечь текст из PDF")

    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    response = client.chat.completions.create(
        model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        max_tokens=512,
        messages=[
            {
                "role": "system",
                "content": (
                    "Извлеки данные из резюме и верни JSON без markdown:\n"
                    '{"position":"...","skills":"skill1, skill2, ...","experience_summary":"2-3 предложения","salary_expected":null}'
                ),
            },
            {"role": "user", "content": text[:4000]},
        ],
    )
    raw = response.choices[0].message.content.strip()
    try:
        import re
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        data = json.loads(match.group() if match else raw)
    except Exception:
        raise HTTPException(500, f"Не удалось распарсить ответ: {raw[:200]}")

    return {"status": "ok", "profile": data}


# --- Helpers ---

def _set_status(vacancy_id: str, status: str):
    with get_session() as s:
        v = s.query(Vacancy).filter_by(vacancy_id=vacancy_id).first()
        if not v:
            raise HTTPException(404, "Вакансия не найдена")
        v.status = status
        s.commit()
    return {"status": "ok"}


def _vacancy_dict(v: Vacancy) -> dict:
    return {
        "id": v.id,
        "vacancy_id": v.vacancy_id,
        "url": v.url,
        "title": v.title,
        "employer": v.employer,
        "salary_text": v.salary_text,
        "experience": v.experience,
        "employment": v.employment,
        "key_skills": json.loads(v.key_skills) if v.key_skills else [],
        "score": v.score,
        "score_reason": v.score_reason,
        "status": v.status,
        "created_at": str(v.created_at),
    }


def _profile_dict(p: UserProfile) -> dict:
    return {
        "id": p.id,
        "position": p.position,
        "skills": p.skills,
        "experience_summary": p.experience_summary,
        "salary_expected": p.salary_expected,
        "stop_words": p.stop_words,
        "cover_letter_tone": p.cover_letter_tone,
    }


def _search_profile_dict(p: SearchProfile) -> dict:
    return {"id": p.id, "keywords": p.keywords, "area": p.area, "active": p.active}
