"""
Scores collected vacancies against one or all resume profiles.
Run manually: python scorer.py
"""

import json
import logging
import os
import re

from openai import OpenAI

import config  # noqa: F401
from database import get_session, init_db
from models import UserProfile, Vacancy, VacancyMatch

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
SCORE_THRESHOLD = 50
RESCORABLE_STATUSES = ("new", "scored", "skipped")

SYSTEM_PROMPT = """Ты карьерный ассистент. Проверь локальную оценку вакансии и дай короткий итог для соискателя.

Профиль соискателя:
{profile}

Верни JSON строго в таком формате без markdown:
{{"score_adjustment": <-10..10>, "reason": "<1-2 предложения с главным плюсом и главным риском>", "recommended": <true|false>}}

Не завышай оценку, если есть стоп-слова, неподходящий формат работы, зарплата ниже ожиданий или заметный разрыв по роли."""


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


def clean_text(value: str | None) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def split_items(value: str | None) -> list[str]:
    result = []
    seen = set()
    for item in re.split(r"[,;•\n]+", value or ""):
        item = clean_text(item)
        if len(item) < 2:
            continue
        key = item.lower()
        if key not in seen:
            result.append(item)
            seen.add(key)
    return result


def vacancy_haystack(vacancy: Vacancy) -> str:
    skills = json.loads(vacancy.key_skills) if vacancy.key_skills else []
    return " ".join([
        vacancy.title or "",
        vacancy.employer or "",
        vacancy.salary_text or "",
        vacancy.experience or "",
        vacancy.employment or "",
        " ".join(skills),
        vacancy.description or "",
    ]).lower()


def parse_salary_floor(value: str | None) -> int | None:
    if not value:
        return None
    text = value.lower().replace("\xa0", " ")
    numbers = [int(re.sub(r"\D", "", item)) for item in re.findall(r"\d[\d\s]{2,}", text)]
    numbers = [item for item in numbers if item > 1000]
    if not numbers:
        return None
    if "до" in text and "от" not in text:
        return None
    return min(numbers)


def detect_work_format(vacancy: Vacancy) -> str:
    text = vacancy_haystack(vacancy)
    if any(token in text for token in ["удален", "удалён", "remote", "дистанц", "home office"]):
        return "remote"
    if any(token in text for token in ["гибрид", "hybrid"]):
        return "hybrid"
    if any(token in text for token in ["офис", "office", "на месте"]):
        return "office"
    return "unknown"


def score_vacancy_local(vacancy: Vacancy, profile: UserProfile) -> dict:
    haystack = vacancy_haystack(vacancy)
    profile_skills = split_items(profile.skills)
    stop_words = split_items(profile.stop_words)
    vacancy_skills = json.loads(vacancy.key_skills) if vacancy.key_skills else []

    matched_skills = [skill for skill in profile_skills if skill.lower() in haystack]
    stop_hits = [word for word in stop_words if word.lower() in haystack]

    skill_score = min(35, round(len(matched_skills) * 35 / max(6, min(len(profile_skills), 12)))) if profile_skills else 0

    title_text = f"{vacancy.title or ''} {vacancy.description or ''}".lower()
    target_tokens = [token for token in re.findall(r"[a-zа-яё+#.]{3,}", (profile.position or "").lower()) if token not in {"lead", "senior", "middle"}]
    title_hits = [token for token in target_tokens if token in title_text]
    role_score = min(20, round(len(title_hits) * 20 / max(2, min(len(target_tokens), 5)))) if target_tokens else 8

    salary_floor = parse_salary_floor(vacancy.salary_text)
    if not profile.salary_expected:
        salary_score = 10
        salary_note = "ожидания по зарплате не указаны"
    elif salary_floor is None:
        salary_score = 6
        salary_note = "зарплата в вакансии не указана"
    elif salary_floor >= profile.salary_expected:
        salary_score = 15
        salary_note = "зарплата соответствует ожиданиям"
    elif salary_floor >= profile.salary_expected * 0.8:
        salary_score = 9
        salary_note = "зарплата немного ниже ожиданий"
    else:
        salary_score = 2
        salary_note = "зарплата существенно ниже ожиданий"

    expected_format = (profile.work_format or "").lower()
    work_format = detect_work_format(vacancy)
    if "удал" in expected_format:
        format_score = 15 if work_format == "remote" else 8 if work_format in {"hybrid", "unknown"} else 1
    else:
        format_score = 10 if work_format != "unknown" else 7

    expected_employment = (profile.employment_type or "").lower()
    vacancy_employment = (vacancy.employment or "").lower()
    if not expected_employment or not vacancy_employment:
        employment_score = 6
    elif any(token in vacancy_employment and token in expected_employment for token in ["полная", "частичная", "проект"]):
        employment_score = 10
    else:
        employment_score = 4

    experience_score = 5
    exp = (vacancy.experience or "").lower()
    if "не требуется" in exp or "1–3" in exp or "1-3" in exp:
        experience_score = 7
    elif "3–6" in exp or "3-6" in exp or "более 6" in exp:
        experience_score = 10

    base_score = skill_score + role_score + salary_score + format_score + employment_score + experience_score
    penalty = min(35, len(stop_hits) * 12)
    final_score = max(0, min(100, base_score - penalty))

    positives = []
    risks = []
    if matched_skills:
        positives.append(f"совпали навыки: {', '.join(matched_skills[:5])}")
    if role_score >= 12:
        positives.append("роль близка целевой позиции")
    if format_score >= 12:
        positives.append("подходит формат работы")
    if salary_score >= 12:
        positives.append(salary_note)

    if stop_hits:
        risks.append(f"стоп-слова: {', '.join(stop_hits[:4])}")
    if salary_score <= 6:
        risks.append(salary_note)
    if format_score <= 4:
        risks.append("формат работы может не подойти")
    if skill_score < 12:
        risks.append("мало прямых совпадений по навыкам")
    if not vacancy_skills:
        risks.append("HH не отдал список ключевых навыков")

    reason = "; ".join((positives[:2] or ["частичное совпадение с профилем"]) + (risks[:2] or []))
    return {
        "score": final_score,
        "reason": reason,
        "recommended": final_score >= SCORE_THRESHOLD,
        "components": {
            "skills": skill_score,
            "role": role_score,
            "salary": salary_score,
            "work_format": format_score,
            "employment": employment_score,
            "experience": experience_score,
            "stop_words_penalty": penalty,
        },
        "matched_skills": matched_skills[:10],
        "stop_words": stop_hits[:10],
        "risks": risks,
        "positives": positives,
        "salary_floor": salary_floor,
        "work_format": work_format,
    }


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


def score_vacancy_llm(client: OpenAI, vacancy: Vacancy, profile_text: str, local_result: dict) -> tuple[int, str]:
    response = client.chat.completions.create(
        model=MODEL,
        temperature=0.1,
        max_tokens=320,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT.format(profile=profile_text)},
            {
                "role": "user",
                "content": "\n\n".join([
                    "Локальная оценка:",
                    json.dumps(local_result, ensure_ascii=False),
                    "Вакансия:",
                    build_vacancy_text(vacancy),
                ]),
            },
        ],
    )
    raw = response.choices[0].message.content.strip()

    try:
        data = json.loads(raw)
        adjustment = max(-10, min(10, int(data.get("score_adjustment", 0))))
        score = max(0, min(100, int(local_result["score"]) + adjustment))
        return score, str(data.get("reason") or local_result["reason"])
    except Exception:
        import re

        match = re.search(r"\{.*\}", raw, re.DOTALL)
        if match:
            data = json.loads(match.group())
            adjustment = max(-10, min(10, int(data.get("score_adjustment", 0))))
            score = max(0, min(100, int(local_result["score"]) + adjustment))
            return score, str(data.get("reason") or local_result["reason"])
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

    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY")) if os.getenv("OPENAI_API_KEY") else None

    for profile in profiles:
        profile_text = enrich_profile_text(profile, build_profile_text(profile))

        with get_session() as session:
            matches = (
                session.query(VacancyMatch)
                .filter(VacancyMatch.profile_id == profile.id, VacancyMatch.status.in_(RESCORABLE_STATUSES))
                .all()
            )

        log.info("Vacancies to score for profile %s: %s", profile.id, len(matches))

        for match in matches:
            with get_session() as session:
                vacancy = session.query(Vacancy).filter_by(vacancy_id=match.vacancy_id).first()
            if not vacancy:
                continue

            local_result = score_vacancy_local(vacancy, profile)
            score = int(local_result["score"])
            reason = str(local_result["reason"])

            if client:
                try:
                    score, reason = score_vacancy_llm(client, vacancy, profile_text, local_result)
                except Exception as e:
                    log.warning("  %s: LLM scoring failed, using local score: %s", match.vacancy_id, e)
                    client = None

            new_status = "scored" if score >= SCORE_THRESHOLD else "skipped"

            with get_session() as session:
                m = session.get(VacancyMatch, match.id)
                m.score = score
                m.score_reason = reason
                m.score_details = json.dumps(local_result, ensure_ascii=False)
                m.status = new_status
                session.commit()

            log.info("  %s -> score=%s [%s]", match.vacancy_id, score, new_status)

    log.info("Scorer finished")


if __name__ == "__main__":
    run()
