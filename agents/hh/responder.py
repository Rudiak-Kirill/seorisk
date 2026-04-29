"""
Responder — генерирует сопроводительное письмо через OpenAI.
Вызывается из API: POST /api/prepare
"""

import json
import logging
import os

from openai import OpenAI

import config  # noqa: F401
from database import get_session
from models import Negotiation, UserProfile, Vacancy

log = logging.getLogger(__name__)

MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

TONES = {
    "formal": "деловой, профессиональный, без панибратства",
    "friendly": "дружелюбный, живой, но уважительный",
}

SYSTEM_PROMPT = """Ты — карьерный ассистент. Напиши сопроводительное письмо для отклика на вакансию.

Профиль соискателя:
{profile}

Требования к письму:
- Тон: {tone}
- Длина: 3-4 абзаца, не больше 300 слов
- Структура: почему интересна вакансия → релевантный опыт → конкретный навык из вакансии → призыв к действию
- Не копировать описание вакансии дословно
- Не использовать шаблонные фразы («я идеальный кандидат», «мечтаю работать у вас»)
- Писать от первого лица, на русском языке
- Вернуть только текст письма, без заголовков и подписи"""


def build_profile_text(profile: UserProfile) -> str:
    lines = [
        f"Должность: {profile.position}",
        f"Навыки: {profile.skills}",
        f"Опыт: {profile.experience_summary}",
    ]
    if profile.salary_expected:
        lines.append(f"Ожидаемая зарплата: {profile.salary_expected} ₽")
    return "\n".join(lines)


def build_vacancy_prompt(vacancy: Vacancy) -> str:
    skills = json.loads(vacancy.key_skills) if vacancy.key_skills else []
    lines = [
        f"Вакансия: {vacancy.title}",
        f"Компания: {vacancy.employer or '—'}",
        f"Зарплата: {vacancy.salary_text or 'не указана'}",
        f"Навыки: {', '.join(skills) if skills else '—'}",
        "",
        "Описание:",
        (vacancy.description or "")[:2000],
    ]
    return "\n".join(lines)


def generate_letter(vacancy_id: str) -> dict:
    """
    Генерирует сопроводительное письмо для вакансии.
    Возвращает: { vacancy_id, title, url, cover_letter }
    """
    with get_session() as session:
        vacancy = session.query(Vacancy).filter_by(vacancy_id=vacancy_id).first()
        profile = session.query(UserProfile).first()

    if not vacancy:
        raise ValueError(f"Вакансия {vacancy_id} не найдена")
    if not profile:
        raise ValueError("Профиль соискателя не заполнен")

    tone_desc = TONES.get(profile.cover_letter_tone, TONES["formal"])
    profile_text = build_profile_text(profile)

    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    response = client.chat.completions.create(
        model=MODEL,
        max_tokens=600,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT.format(profile=profile_text, tone=tone_desc)},
            {"role": "user", "content": build_vacancy_prompt(vacancy)},
        ],
    )
    cover_letter = response.choices[0].message.content.strip()

    with get_session() as session:
        negotiation = Negotiation(vacancy_id=vacancy_id, cover_letter=cover_letter, status="draft")
        session.add(negotiation)
        session.commit()
        session.refresh(negotiation)
        negotiation_id = negotiation.id

    log.info(f"Письмо сгенерировано для {vacancy_id}, negotiation_id={negotiation_id}")

    return {
        "negotiation_id": negotiation_id,
        "vacancy_id": vacancy_id,
        "title": vacancy.title,
        "url": vacancy.url,
        "cover_letter": cover_letter,
    }


if __name__ == "__main__":
    import sys, io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    # Берём первую вакансию со статусом scored для теста
    with get_session() as s:
        v = s.query(Vacancy).filter_by(status="scored").first()

    if not v:
        print("Нет вакансий со статусом scored")
    else:
        print(f"Генерирую письмо для: {v.title} ({v.vacancy_id})\n")
        result = generate_letter(v.vacancy_id)
        print("=== Письмо ===")
        print(result["cover_letter"])
