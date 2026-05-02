import json
import logging
import os
import re
from contextlib import asynccontextmanager
from pathlib import Path

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import config  # noqa: F401
from collector import run as collector_run
from database import get_session, init_db
from models import Negotiation, SearchProfile, UserProfile, Vacancy, VacancyMatch
from responder import generate_letter
from scorer import run as scorer_run

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

STATIC_DIR = Path(__file__).parent / "static"


def _collect_interval_hours() -> float:
    raw = os.getenv("HH_COLLECT_INTERVAL_HOURS", "2")
    try:
        interval = float(raw.replace(",", "."))
    except ValueError:
        log.warning("Invalid HH_COLLECT_INTERVAL_HOURS=%r, using 2h", raw)
        return 2
    return max(interval, 0)


def _create_scheduler() -> BackgroundScheduler | None:
    interval_hours = _collect_interval_hours()
    if interval_hours <= 0:
        log.info("Scheduler disabled: HH_COLLECT_INTERVAL_HOURS=%s", interval_hours)
        return None

    scheduler = BackgroundScheduler()
    scheduler.add_job(
        collector_run,
        "interval",
        hours=interval_hours,
        id="collector",
        coalesce=True,
        max_instances=1,
        replace_existing=True,
    )
    log.info("Scheduler configured: collector every %sh", interval_hours)
    return scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    scheduler = _create_scheduler()
    app.state.scheduler = scheduler
    if scheduler:
        scheduler.start()
    yield
    if scheduler:
        scheduler.shutdown()


app = FastAPI(title="HH Agent", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
def index():
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/vacancies")
def get_vacancies(status: str = "", limit: int = 50, offset: int = 0, profile_id: int | None = None):
    with get_session() as s:
        profile_id = profile_id or _default_profile_id(s)
        if not profile_id:
            return {"total": 0, "items": []}
        profile = s.get(UserProfile, profile_id)

        q = (
            s.query(Vacancy, VacancyMatch)
            .join(VacancyMatch, VacancyMatch.vacancy_id == Vacancy.vacancy_id)
            .filter(VacancyMatch.profile_id == profile_id)
        )
        if status:
            q = q.filter(VacancyMatch.status == status)
        total = q.count()
        rows = (
            q.order_by(VacancyMatch.score.desc().nulls_last(), VacancyMatch.created_at.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )
        return {"total": total, "items": [_vacancy_dict(v, m, profile) for v, m in rows]}


@app.post("/api/vacancies/collect")
def trigger_collect(body: dict | None = None):
    try:
        collector_run((body or {}).get("profile_id"))
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/api/jobs")
def get_jobs():
    scheduler = getattr(app.state, "scheduler", None)
    collector = scheduler.get_job("collector") if scheduler else None
    interval_hours = _collect_interval_hours()
    return {
        "collector": {
            "enabled": bool(collector),
            "interval_hours": interval_hours,
            "next_run_at": collector.next_run_time.isoformat() if collector and collector.next_run_time else None,
        }
    }


@app.post("/api/vacancies/score")
def trigger_score(body: dict | None = None):
    try:
        scorer_run((body or {}).get("profile_id"))
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(500, str(e))


@app.patch("/api/vacancies/{vacancy_id}/hide")
def hide_vacancy(vacancy_id: str, profile_id: int | None = None):
    return _set_status(vacancy_id, "hidden", profile_id)


@app.patch("/api/vacancies/{vacancy_id}/applied")
def mark_applied(vacancy_id: str, profile_id: int | None = None):
    return _set_status(vacancy_id, "applied", profile_id)


@app.post("/api/prepare")
def prepare_letter(body: dict):
    vacancy_id = body.get("vacancy_id")
    if not vacancy_id:
        raise HTTPException(400, "vacancy_id required")
    try:
        return generate_letter(vacancy_id, body.get("profile_id"))
    except ValueError as e:
        raise HTTPException(404, str(e))
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/api/negotiations")
def get_negotiations(profile_id: int | None = None):
    with get_session() as s:
        profile_id = profile_id or _default_profile_id(s)
        if not profile_id:
            return []

        items = (
            s.query(Negotiation)
            .filter(Negotiation.profile_id == profile_id)
            .order_by(Negotiation.created_at.desc())
            .all()
        )
        result = []
        for n in items:
            v = s.query(Vacancy).filter_by(vacancy_id=n.vacancy_id).first()
            result.append({
                "id": n.id,
                "profile_id": n.profile_id,
                "vacancy_id": n.vacancy_id,
                "title": v.title if v else n.vacancy_id,
                "employer": v.employer if v else None,
                "url": v.url if v else None,
                "cover_letter": n.cover_letter,
                "status": n.status,
                "created_at": str(n.created_at),
            })
        return result


@app.get("/api/settings")
def get_settings():
    with get_session() as s:
        profiles = s.query(UserProfile).order_by(UserProfile.id).all()
        search_profiles = s.query(SearchProfile).order_by(SearchProfile.id).all()
        active = profiles[0] if profiles else None
        return {
            "profiles": [_profile_dict(p) for p in profiles],
            "profile": _profile_dict(active) if active else None,
            "search_profiles": [_search_profile_dict(p) for p in search_profiles],
        }


class ProfileIn(BaseModel):
    id: int | None = None
    name: str | None = None
    position: str
    skills: str
    experience_summary: str
    salary_expected: int | None = None
    stop_words: str | None = None
    cover_letter_tone: str = "formal"
    contact_phone: str | None = None
    contact_email: str | None = None
    location: str | None = None
    citizenship: str | None = None
    work_format: str | None = None
    employment_type: str | None = None
    travel_readiness: str | None = None
    education: str | None = None
    courses: str | None = None
    languages: str | None = None
    about: str | None = None


@app.put("/api/settings/profile")
def update_profile(body: ProfileIn):
    with get_session() as s:
        data = body.model_dump()
        profile_id = data.pop("id", None)
        profile = s.get(UserProfile, profile_id) if profile_id else None
        if profile:
            for k, v in data.items():
                setattr(profile, k, v)
        else:
            profile = UserProfile(**data)
            s.add(profile)
            s.flush()
        _ensure_search_profiles(s, profile)
        s.commit()
        s.refresh(profile)
        return {"status": "ok", "profile": _profile_dict(profile)}


@app.delete("/api/settings/profile/{profile_id}")
def delete_profile(profile_id: int):
    with get_session() as s:
        if s.query(UserProfile).count() <= 1:
            raise HTTPException(400, "Нельзя удалить последнее резюме")
        profile = s.get(UserProfile, profile_id)
        if not profile:
            raise HTTPException(404, "Резюме не найдено")
        s.query(SearchProfile).filter_by(profile_id=profile_id).delete()
        s.query(VacancyMatch).filter_by(profile_id=profile_id).delete()
        s.query(Negotiation).filter_by(profile_id=profile_id).delete()
        s.delete(profile)
        s.commit()
    return {"status": "ok"}


class SearchProfileIn(BaseModel):
    profile_id: int | None = None
    keywords: str
    area: int = 1


class RawResumeIn(BaseModel):
    text: str


@app.post("/api/settings/search-profiles")
def add_search_profile(body: SearchProfileIn):
    with get_session() as s:
        data = body.model_dump()
        data["profile_id"] = data["profile_id"] or _default_profile_id(s)
        if not data["profile_id"]:
            raise HTTPException(400, "Сначала добавьте резюме")
        existing = (
            s.query(SearchProfile)
            .filter(
                SearchProfile.profile_id == data["profile_id"],
                SearchProfile.area == data["area"],
                SearchProfile.keywords == data["keywords"],
            )
            .first()
        )
        if existing:
            return {"status": "ok", "id": existing.id}
        s.add(SearchProfile(**data))
        s.commit()
    return {"status": "ok"}


@app.delete("/api/settings/search-profiles/{profile_id}")
def delete_search_profile(profile_id: int):
    with get_session() as s:
        p = s.get(SearchProfile, profile_id)
        if not p:
            raise HTTPException(404, "Профиль поиска не найден")
        s.delete(p)
        s.commit()
    return {"status": "ok"}


@app.post("/api/settings/profile/import-text")
def import_text_resume(body: RawResumeIn):
    from openai import OpenAI

    text = body.text.strip()
    if len(text) < 200:
        raise HTTPException(400, "Передайте полный текст резюме")

    try:
        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        response = client.chat.completions.create(
            model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
            max_tokens=1400,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Extract fields from a raw HH.ru resume text and return strict JSON without markdown. "
                        "Do not invent facts. Return empty string or null for missing fields. "
                        "Schema: "
                        '{"name":"","position":"","skills":"","experience_summary":"","salary_expected":null,'
                        '"contact_phone":"","contact_email":"","location":"","citizenship":"",'
                        '"work_format":"","employment_type":"","travel_readiness":"","education":"",'
                        '"courses":"","languages":"","about":"","stop_words":""}. '
                        "experience_summary must be concise but meaningful: key jobs, roles, results, stack. "
                        "skills must be a semicolon-separated string. salary_expected must be a number in RUB."
                    ),
                },
                {"role": "user", "content": text[:12000]},
            ],
        )
        raw = response.choices[0].message.content.strip()
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        data = json.loads(match.group() if match else raw)
    except Exception as e:
        log.warning("LLM resume import failed, using local parser: %s", e)
        data = _parse_resume_text(text)

    return {"status": "ok", "profile": data}


def _parse_resume_text(text: str) -> dict:
    def first(pattern: str) -> str:
        match = re.search(pattern, text, re.IGNORECASE | re.MULTILINE)
        return " ".join(match.group(1).split()) if match else ""

    def section(start: str, stops: list[str]) -> str:
        pattern = re.escape(start) + r"\s*(.*?)(?:" + "|".join(re.escape(s) for s in stops) + r"|\Z)"
        match = re.search(pattern, text, re.IGNORECASE | re.MULTILINE | re.DOTALL)
        return " ".join(match.group(1).split()) if match else ""

    lines = [line.strip() for line in text.splitlines() if line.strip()]
    name = ""
    for line in lines[:8]:
        if not line.lower().startswith("резюме обновлено") and not re.search(r"\d|@|\+", line):
            name = line
            break

    position = first(r"Желаемая должность и зарплата\s+(.+?)(?:\n\s*\d|\n\s*[\d\s]+\s*₽|\n\s*Специализации:)")
    if not position:
        position = first(r"^\s*([A-Za-zА-Яа-яЁё /&\-]+(?:SEO|Python|Lead|Developer|Manager)[^\n]*)")

    salary_raw = first(r"([\d\s]{5,})\s*₽")
    salary_expected = int(re.sub(r"\D", "", salary_raw)) if salary_raw else None

    skills = section("Навыки", ["Опыт вождения", "Дополнительная информация", "Обо мне"])
    skills = re.sub(r"^Знание языков\s*Русский\s+—\s+Родной\s*Навыки\s*", "", skills).strip()

    about = section("Обо мне", ["Рекомендации", "Ключевые навыки"])
    experience = section("Опыт работы", ["Образование", "Повышение квалификации", "Навыки"])
    education = section("Образование", ["Повышение квалификации", "Навыки", "Опыт вождения"])
    courses = section("Повышение квалификации, курсы", ["Навыки", "Опыт вождения", "Дополнительная информация"])

    return {
        "name": name,
        "position": position,
        "skills": skills,
        "experience_summary": experience[:4000],
        "salary_expected": salary_expected,
        "contact_phone": first(r"(\+\d[\d\s()\-]+)"),
        "contact_email": first(r"([A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,})"),
        "location": first(r"Проживает:\s*(.+)"),
        "citizenship": first(r"Гражданство:\s*(.+)"),
        "work_format": first(r"Формат работы:\s*(.+)") or ("удалённо" if re.search(r"готов работать удал[её]нно", text, re.I) else ""),
        "employment_type": first(r"Тип занятости:\s*(.+)"),
        "travel_readiness": first(r"(Готов работать.+?командировкам)"),
        "education": education,
        "courses": courses,
        "languages": first(r"Знание языков\s*(.+?)(?:Навыки|Опыт вождения|$)"),
        "about": about,
        "stop_words": "",
    }

def _default_profile_id(session) -> int | None:
    return session.query(UserProfile.id).order_by(UserProfile.id).limit(1).scalar()


def _ensure_search_profiles(session, profile: UserProfile) -> None:
    existing = {
        row.keywords.strip().lower()
        for row in session.query(SearchProfile).filter_by(profile_id=profile.id).all()
        if row.keywords
    }
    if existing:
        return

    for keyword in _suggest_search_keywords(profile):
        normalized = keyword.strip()
        if not normalized or normalized.lower() in existing:
            continue
        session.add(SearchProfile(profile_id=profile.id, keywords=normalized, area=1, active=True))
        existing.add(normalized.lower())


def _suggest_search_keywords(profile: UserProfile) -> list[str]:
    title_source = " ".join([profile.position or "", profile.name or ""])
    source = " ".join([title_source, profile.skills or "", profile.about or ""])
    title_l = title_source.lower()
    source_l = source.lower()
    suggestions: list[str] = []

    position = (profile.position or "").strip()
    if position:
        suggestions.append(position)
        suggestions.extend([part.strip() for part in re.split(r"[/|,]", position) if part.strip()])

    if "seo" in title_l:
        suggestions.extend(["SEO", "Technical SEO", "SEO Lead"])
    if "growth" in title_l:
        suggestions.extend(["SEO Growth", "Growth Lead"])

    rules = [
        ("automation", ["AI Automation", "Automation Specialist"]),
        ("ai", ["AI Automation", "AI Specialist"]),
        ("agent", ["AI Agents"]),
        ("llm", ["LLM", "AI Automation"]),
        ("n8n", ["n8n"]),
        ("python", ["Python", "Python Backend"]),
        ("systems", ["Systems Specialist", "Systems Analyst"]),
        ("crm", ["CRM", "CRM integration"]),
        ("api", ["API integration"]),
        ("product", ["Product Manager"]),
    ]
    for token, keywords in rules:
        if token in source_l:
            suggestions.extend(keywords)

    result: list[str] = []
    seen: set[str] = set()
    for item in suggestions:
        item = re.sub(r"\s+", " ", item).strip()
        if len(item) < 2 or item.lower() in seen:
            continue
        result.append(item)
        seen.add(item.lower())
        if len(result) >= 6:
            break
    return result


def _set_status(vacancy_id: str, status: str, profile_id: int | None = None):
    with get_session() as s:
        profile_id = profile_id or _default_profile_id(s)
        match = s.query(VacancyMatch).filter_by(profile_id=profile_id, vacancy_id=vacancy_id).first()
        if not match:
            raise HTTPException(404, "Вакансия не найдена для выбранного резюме")
        match.status = status
        s.commit()
    return {"status": "ok"}


def _vacancy_dict(v: Vacancy, match: VacancyMatch | None = None, profile: UserProfile | None = None) -> dict:
    work_format = _work_format(v)
    return {
        "id": v.id,
        "profile_id": match.profile_id if match else None,
        "resume_name": (profile.name or profile.position) if profile else None,
        "search_profile_id": match.search_profile_id if match else None,
        "search_keywords": match.search_keywords if match else None,
        "vacancy_id": v.vacancy_id,
        "url": v.url,
        "title": v.title,
        "employer": v.employer,
        "salary_text": v.salary_text,
        "description": v.description,
        "experience": v.experience,
        "employment": v.employment,
        "work_format": work_format,
        "pub_date": v.pub_date,
        "applicants_count": v.applicants_count,
        "key_skills": json.loads(v.key_skills) if v.key_skills else [],
        "score": match.score if match else v.score,
        "score_reason": match.score_reason if match else v.score_reason,
        "score_details": json.loads(match.score_details) if match and match.score_details else None,
        "status": match.status if match else v.status,
        "flags": _vacancy_flags(v),
        "created_at": str(match.created_at if match else v.created_at),
    }


def _vacancy_flags(v: Vacancy) -> dict:
    work_format = _work_format(v)
    salary = (v.salary_text or "").strip().lower()
    employment = (v.employment or "").strip().lower()
    skills = " ".join(json.loads(v.key_skills) if v.key_skills else [])
    haystack = " ".join([
        v.title or "",
        v.employer or "",
        employment,
        v.experience or "",
        skills,
        v.description or "",
    ]).lower()

    has_salary = bool(salary and salary not in {"не указан", "не указана", "зп не указана"})
    is_remote = work_format == "удалённо"
    is_part_time = (
        any(token in employment for token in ["частич", "проект", "разовое задание"]) or
        any(token in haystack for token in ["частичная занятость", "неполный день", "part-time", "part time"])
    )

    return {"has_salary": has_salary, "remote": is_remote, "part_time": is_part_time}


def _work_format(v: Vacancy) -> str:
    haystack = " ".join([
        v.title or "",
        v.employer or "",
        v.employment or "",
        v.description or "",
    ]).lower()

    remote_tokens = ["удален", "удалён", "remote", "дистанц", "home office"]
    hybrid_tokens = ["гибрид", "hybrid"]
    office_tokens = ["офис", "office", "на месте"]

    if any(token in haystack for token in remote_tokens):
        return "удалённо"
    if any(token in haystack for token in hybrid_tokens):
        return "гибрид"
    if any(token in haystack for token in office_tokens):
        return "офис"
    return "не указан"


def _profile_dict(p: UserProfile) -> dict:
    return {
        "id": p.id,
        "name": p.name or p.position,
        "position": p.position,
        "skills": p.skills,
        "experience_summary": p.experience_summary,
        "salary_expected": p.salary_expected,
        "stop_words": p.stop_words,
        "cover_letter_tone": p.cover_letter_tone,
        "contact_phone": p.contact_phone,
        "contact_email": p.contact_email,
        "location": p.location,
        "citizenship": p.citizenship,
        "work_format": p.work_format,
        "employment_type": p.employment_type,
        "travel_readiness": p.travel_readiness,
        "education": p.education,
        "courses": p.courses,
        "languages": p.languages,
        "about": p.about,
    }


def _search_profile_dict(p: SearchProfile) -> dict:
    return {
        "id": p.id,
        "profile_id": p.profile_id,
        "keywords": p.keywords,
        "area": p.area,
        "active": p.active,
    }
