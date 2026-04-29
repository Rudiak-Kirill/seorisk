"""
Scorer — оценивает вакансии через Claude API.
Запуск вручную: python scorer.py
"""

import json
import logging
import os

from openai import OpenAI

import config  # загружает .env  # noqa: F401
from database import get_session, init_db
from models import UserProfile, Vacancy

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
SCORE_THRESHOLD = 50

SYSTEM_PROMPT = """Ты — карьерный ассистент. Оцени вакансию на соответствие профилю соискателя.

Профиль соискателя:
{profile}

Верни JSON строго в таком формате (без markdown, без пояснений вокруг):
{{"score": <0-100>, "reason": "<1-2 предложения почему>", "recommended": <true|false>}}

Критерии оценки:
- 80-100: отличное совпадение по стеку, опыту и зарплате
- 60-79: хорошее совпадение с небольшими расхождениями
- 40-59: частичное совпадение, стоит рассмотреть
- 0-39: слабое совпадение или есть стоп-слова"""


def build_profile_text(profile: UserProfile) -> str:
    lines = [
        f"Должность: {profile.position}",
        f"Навыки: {profile.skills}",
        f"Опыт: {profile.experience_summary}",
    ]
    if profile.salary_expected:
        lines.append(f"Ожидаемая зарплата: {profile.salary_expected} ₽")
    if profile.stop_words:
        lines.append(f"Стоп-слова (снижают оценку): {profile.stop_words}")
    return "\n".join(lines)


def build_vacancy_text(vacancy: Vacancy) -> str:
    skills = json.loads(vacancy.key_skills) if vacancy.key_skills else []
    lines = [
        f"Название: {vacancy.title}",
        f"Компания: {vacancy.employer or '—'}",
        f"Зарплата: {vacancy.salary_text or 'не указана'}",
        f"Опыт: {vacancy.experience or '—'}",
        f"Занятость: {vacancy.employment or '—'}",
        f"Навыки: {', '.join(skills) if skills else '—'}",
        "",
        "Описание:",
        (vacancy.description or "")[:3000],
    ]
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
        # Повторная попытка если Claude добавил markdown
        import re
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        if match:
            data = json.loads(match.group())
            return int(data["score"]), str(data["reason"])
        raise ValueError(f"Не удалось распарсить ответ Claude: {raw[:200]}")


def run() -> None:
    init_db()

    with get_session() as session:
        profile = session.query(UserProfile).first()

    if not profile:
        log.error("Нет профиля соискателя. Добавь через /api/settings/profile")
        return

    profile_text = build_profile_text(profile)
    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

    with get_session() as session:
        vacancies = session.query(Vacancy).filter_by(status="new").all()

    log.info(f"Вакансий для оценки: {len(vacancies)}")

    for vacancy in vacancies:
        try:
            score, reason = score_vacancy(client, vacancy, profile_text)
        except Exception as e:
            log.warning(f"  {vacancy.vacancy_id}: ошибка — {e}")
            continue

        new_status = "scored" if score >= SCORE_THRESHOLD else "skipped"

        with get_session() as session:
            v = session.get(Vacancy, vacancy.id)
            v.score = score
            v.score_reason = reason
            v.status = new_status
            session.commit()

        log.info(f"  {vacancy.vacancy_id} «{vacancy.title}» → score={score} [{new_status}]")

    log.info("Scorer завершён.")


if __name__ == "__main__":
    run()
