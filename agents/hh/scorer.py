"""
Scores collected vacancies against one or all resume profiles.
Run manually: python scorer.py
"""

import json
import logging
import os

from openai import OpenAI

import config  # noqa: F401
from database import get_session, init_db
from models import UserProfile, Vacancy, VacancyMatch

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
SCORE_THRESHOLD = 50

SYSTEM_PROMPT = """Ты карьерный ассистент. Оцени вакансию на соответствие профилю соискателя.

Профиль соискателя:
{profile}

Верни JSON строго в таком формате без markdown:
{{"score": <0-100>, "reason": "<1-2 предложения почему>", "recommended": <true|false>}}

Критерии:
- 80-100: отличное совпадение по стеку, опыту и зарплате
- 60-79: хорошее совпадение с небольшими расхождениями
- 40-59: частичное совпадение
- 0-39: слабое совпадение или есть стоп-слова"""


def build_profile_text(profile: UserProfile) -> str:
    lines = [
        f"Название резюме: {profile.name or profile.position}",
        f"Должность: {profile.position}",
        f"Навыки: {profile.skills}",
        f"Опыт: {profile.experience_summary}",
    ]
    if profile.salary_expected:
        lines.append(f"Ожидаемая зарплата: {profile.salary_expected} ₽")
    if profile.stop_words:
        lines.append(f"Стоп-слова: {profile.stop_words}")
    return "\n".join(lines)


def build_vacancy_text(vacancy: Vacancy) -> str:
    skills = json.loads(vacancy.key_skills) if vacancy.key_skills else []
    lines = [
        f"Название: {vacancy.title}",
        f"Компания: {vacancy.employer or '-'}",
        f"Зарплата: {vacancy.salary_text or 'не указана'}",
        f"Опыт: {vacancy.experience or '-'}",
        f"Занятость: {vacancy.employment or '-'}",
        f"Навыки: {', '.join(skills) if skills else '-'}",
        "",
        "Описание:",
        (vacancy.description or "")[:3000],
    ]
    return "\n".join(lines)


def enrich_profile_text(profile: UserProfile, profile_text: str) -> str:
    lines = [profile_text]
    if profile.work_format:
        lines.append(f"Формат работы: {profile.work_format}")
    if profile.employment_type:
        lines.append(f"Тип занятости: {profile.employment_type}")
    if profile.location:
        lines.append(f"Локация: {profile.location}")
    if profile.travel_readiness:
        lines.append(f"Командировки: {profile.travel_readiness}")
    if profile.about:
        lines.append(f"О кандидате: {profile.about}")
    return "\n".join(lines)


def score_vacancy(client: OpenAI, vacancy: Vacancy, profile_text: str) -> tuple[int, str]:
    response = client.chat.completions.create(
        model=MODEL,
        max_tokens=256,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT.format(profile=profile_text)},
            {"role": "user", "content": build_vacancy_text(vacancy)},
        ],
    )
    raw = response.choices[0].message.content.strip()

    try:
        data = json.loads(raw)
        return int(data["score"]), str(data["reason"])
    except Exception:
        import re

        match = re.search(r"\{.*\}", raw, re.DOTALL)
        if match:
            data = json.loads(match.group())
            return int(data["score"]), str(data["reason"])
        raise ValueError(f"Не удалось распарсить ответ LLM: {raw[:200]}")


def run(profile_id: int | None = None) -> None:
    init_db()

    with get_session() as session:
        q = session.query(UserProfile)
        if profile_id:
            q = q.filter(UserProfile.id == profile_id)
        profiles = q.order_by(UserProfile.id).all()

    if not profiles:
        log.error("No resume profiles")
        return

    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

    for profile in profiles:
        profile_text = enrich_profile_text(profile, build_profile_text(profile))

        with get_session() as session:
            matches = (
                session.query(VacancyMatch)
                .filter_by(profile_id=profile.id, status="new")
                .all()
            )

        log.info("Vacancies to score for profile %s: %s", profile.id, len(matches))

        for match in matches:
            with get_session() as session:
                vacancy = session.query(Vacancy).filter_by(vacancy_id=match.vacancy_id).first()
            if not vacancy:
                continue

            try:
                score, reason = score_vacancy(client, vacancy, profile_text)
            except Exception as e:
                log.warning("  %s: scoring error: %s", match.vacancy_id, e)
                continue

            new_status = "scored" if score >= SCORE_THRESHOLD else "skipped"

            with get_session() as session:
                m = session.get(VacancyMatch, match.id)
                m.score = score
                m.score_reason = reason
                m.status = new_status
                session.commit()

            log.info("  %s -> score=%s [%s]", match.vacancy_id, score, new_status)

    log.info("Scorer finished")


if __name__ == "__main__":
    run()
