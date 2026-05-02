"""
Generates a cover letter for a vacancy and a selected resume profile.
Called from API: POST /api/prepare
"""

import json
import logging
import os
import re

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

SYSTEM_PROMPT = """Ты карьерный ассистент для точечных откликов на вакансии.
Нужно написать живое, конкретное сопроводительное письмо на русском языке на основе резюме и текста вакансии.

Резюме кандидата:
{profile}

Правила:
- Тон: {tone}
- Длина: 120-180 слов, 3 коротких абзаца
- Начать без "Здравствуйте" и без темы письма
- Писать от первого лица
- Упомянуть вакансию и компанию, если компания известна
- Связать 2-4 требования вакансии с конкретным опытом из резюме
- Не обещать того, чего нет в резюме
- Не копировать текст вакансии дословно
- Не использовать канцелярит и пустые фразы: "ответственный", "стрессоустойчивый", "быстро обучаюсь", "идеально подхожу"
- Не указывать зарплату, телефон, email и подпись
- Вернуть только готовый текст письма"""


def build_profile_text(profile: UserProfile) -> str:
    lines = [
        f"Название резюме: {_clean_text(profile.name or profile.position)}",
        f"Целевая должность: {_clean_text(profile.position)}",
        f"Навыки: {_clean_text(profile.skills)}",
        f"Опыт: {_truncate(_clean_text(profile.experience_summary), 3500)}",
    ]
    if profile.salary_expected:
        lines.append(f"Ожидаемая зарплата: {profile.salary_expected} ₽")
    return "\n".join(lines)


def build_vacancy_prompt(vacancy: Vacancy) -> str:
    skills = json.loads(vacancy.key_skills) if vacancy.key_skills else []
    lines = [
        f"Вакансия: {_clean_text(vacancy.title)}",
        f"Компания: {_clean_text(vacancy.employer or '-')}",
        f"Зарплата: {_clean_text(vacancy.salary_text or 'не указана')}",
        f"Опыт: {_clean_text(vacancy.experience or '-')}",
        f"Занятость: {_clean_text(vacancy.employment or '-')}",
        f"Навыки: {_clean_text(', '.join(skills) if skills else '-')}",
        "",
        "Описание:",
        _truncate(_clean_text(vacancy.description or ""), 6000),
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
    if profile.about:
        lines.append(f"О кандидате: {profile.about}")
    return "\n".join(lines)


def _clean_text(value: str | None) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def _truncate(value: str, limit: int) -> str:
    if len(value) <= limit:
        return value
    return value[:limit].rsplit(" ", 1)[0] + "..."


def _split_items(value: str | None) -> list[str]:
    items = re.split(r"[,;•\n]+", value or "")
    result = []
    seen = set()
    for item in items:
        item = _clean_text(item)
        if len(item) < 2:
            continue
        key = item.lower()
        if key in seen:
            continue
        result.append(item)
        seen.add(key)
    return result


def _human_list(items: list[str], limit: int = 4) -> str:
    cleaned = [_clean_text(item) for item in items if _clean_text(item)]
    return ", ".join(cleaned[:limit])


def _vacancy_focus(vacancy: Vacancy) -> str:
    skills = json.loads(vacancy.key_skills) if vacancy.key_skills else []
    if skills:
        return _human_list(skills, 4)

    words = re.findall(r"[A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё+-]{3,}", vacancy.title or "")
    stop = {"специалист", "разработчик", "менеджер", "senior", "middle", "junior"}
    focus = []
    for word in words:
        if word.lower() not in stop:
            focus.append(word)
    return _human_list(focus, 4) or "практические задачи роли"


def _relevant_profile_summary(profile: UserProfile, vacancy: Vacancy) -> str:
    skills = _overlap_skills(profile, vacancy)
    focus = skills + _split_items(_vacancy_focus(vacancy))
    keywords = [item.lower() for item in focus if len(item) > 2]
    text = " ".join([
        profile.experience_summary or "",
        profile.about or "",
    ])
    normalized = re.sub(r"\s*[—-]\s*", ". ", text)
    parts = [
        _clean_text(part)
        for part in re.split(r"(?<=[.!?])\s+|\n+", normalized)
        if len(_clean_text(part)) >= 35
    ]

    selected = []
    for part in parts:
        low = part.lower()
        if any(keyword in low for keyword in keywords):
            selected.append(part)
        if len(selected) >= 2:
            break

    if not selected:
        selected = parts[:2]

    summary = " ".join(selected)
    return _truncate(summary, 420)


def _profile_capabilities(profile: UserProfile) -> str:
    preferred = ["AI", "LLM", "ChatGPT", "Автоматизация", "API", "n8n", "Python", "данные", "интеграции"]
    text = " ".join([profile.skills or "", profile.experience_summary or "", profile.about or ""]).lower()
    result = []
    for item in preferred:
        if item.lower() in text:
            result.append(item)
    return _human_list(result, 4) or _human_list(_split_items(profile.skills), 3)


def _overlap_skills(profile: UserProfile, vacancy: Vacancy) -> list[str]:
    profile_skills = _split_items(profile.skills)
    vacancy_skills = json.loads(vacancy.key_skills) if vacancy.key_skills else []
    haystack = " ".join([
        vacancy.title or "",
        vacancy.description or "",
        " ".join(vacancy_skills),
    ]).lower()

    matched = []
    for skill in profile_skills:
        if skill.lower() in haystack:
            matched.append(skill)
        if len(matched) >= 5:
            break
    return matched


def generate_fallback_letter(vacancy: Vacancy, profile: UserProfile) -> str:
    company = _clean_text(vacancy.employer) or "вашей компании"
    title = _clean_text(vacancy.title) or "эту вакансию"
    position = _clean_text(profile.position)
    skills = _overlap_skills(profile, vacancy)
    skills_text = _human_list(skills, 4)
    focus = _vacancy_focus(vacancy)
    experience = _relevant_profile_summary(profile, vacancy)
    capabilities = _profile_capabilities(profile)
    has_direct_overlap = bool(skills_text)

    if has_direct_overlap:
        intro = (
            f"Откликаюсь на вакансию «{title}» в {company}. "
            f"Вижу, что в роли важны {focus}; это близко моему опыту в роли {position}."
        )
        experience_paragraph = f"Из релевантного опыта: {experience}"
    else:
        intro = (
            f"Откликаюсь на вакансию «{title}» в {company}. "
            f"Вижу, что в роли важны {focus}; прямой опыт в этих задачах не буду преувеличивать, "
            f"но мне близко направление AI-инструментов и прикладной автоматизации."
        )
        experience_paragraph = (
            f"Моя сильная база — {capabilities}: внедрение AI-инструментов, работа с данными, "
            f"проектирование процессов и доведение решений до практического результата."
        )

    paragraphs = [intro, experience_paragraph]

    if has_direct_overlap:
        paragraphs.append(
            f"По требованиям вижу практическое пересечение: {skills_text}. "
            f"Смогу быстро разобраться в текущем процессе, предложить понятный план работы и довести задачи до результата."
        )
    else:
        paragraphs.append(
            f"Смогу быстро разобраться в процессе, аккуратно протестировать подходы, собрать понятный пайплайн работы "
            f"и показать результат на небольшом практическом задании."
        )

    paragraphs.append("Буду рад коротко обсудить задачи роли и понять, какой результат для вас сейчас приоритетен.")
    return "\n\n".join(paragraphs)


def generate_letter(vacancy_id: str, profile_id: int | None = None) -> dict:
    with get_session() as session:
        vacancy = session.query(Vacancy).filter_by(vacancy_id=vacancy_id).first()
        q = session.query(UserProfile)
        if profile_id:
            q = q.filter(UserProfile.id == profile_id)
        profile = q.order_by(UserProfile.id).first()

    if not vacancy:
        raise ValueError(f"Вакансия {vacancy_id} не найдена")
    if not profile:
        raise ValueError("Профиль соискателя не заполнен")

    tone_desc = TONES.get(profile.cover_letter_tone, TONES["formal"])
    profile_text = enrich_profile_text(profile, build_profile_text(profile))

    try:
        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        response = client.chat.completions.create(
            model=MODEL,
            temperature=0.35,
            max_tokens=700,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT.format(profile=profile_text, tone=tone_desc)},
                {"role": "user", "content": build_vacancy_prompt(vacancy)},
            ],
        )
        cover_letter = response.choices[0].message.content.strip()
    except Exception as e:
        log.warning("LLM cover letter generation failed, using fallback: %s", e)
        cover_letter = generate_fallback_letter(vacancy, profile)

    with get_session() as session:
        negotiation = Negotiation(
            profile_id=profile.id,
            vacancy_id=vacancy_id,
            cover_letter=cover_letter,
            status="draft",
        )
        session.add(negotiation)
        session.commit()
        session.refresh(negotiation)
        negotiation_id = negotiation.id

    log.info("Cover letter generated for %s, profile_id=%s", vacancy_id, profile.id)

    return {
        "negotiation_id": negotiation_id,
        "profile_id": profile.id,
        "vacancy_id": vacancy_id,
        "title": vacancy.title,
        "url": vacancy.url,
        "cover_letter": cover_letter,
    }


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    with get_session() as s:
        v = s.query(Vacancy).first()
    if not v:
        print("Нет вакансий")
    else:
        print(generate_letter(v.vacancy_id)["cover_letter"])
