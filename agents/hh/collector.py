"""
Collector — собирает вакансии из RSS HH.ru и парсит страницы.
Запуск вручную: python collector.py
"""

import json
import logging
import re
import time
from xml.etree import ElementTree as ET

import httpx
from bs4 import BeautifulSoup
from sqlalchemy.dialects.sqlite import insert

from database import get_session, init_db
from models import SearchProfile, Vacancy

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
REQUEST_DELAY = 0.5  # сек между запросами страниц


def fetch_rss(keywords: str, area: int) -> list[dict]:
    params = {"text": keywords, "area": area, "per_page": 20}
    r = httpx.get("https://hh.ru/search/vacancy/rss", params=params, headers=HEADERS, follow_redirects=True, timeout=10)
    r.raise_for_status()
    root = ET.fromstring(r.content)

    items = []
    for item in root.findall(".//item"):
        desc_html = item.findtext("description") or ""
        desc_text = re.sub(r"<[^>]+>", " ", desc_html).strip()
        salary_match = re.search(r"доход[а-я\s]*:\s*(.+?)(?:\s*$)", desc_text, re.I)
        items.append({
            "title": item.findtext("title") or "",
            "vacancy_id": (item.findtext("link") or "").rstrip("/").split("/")[-1],
            "url": item.findtext("link") or "",
            "salary_text": salary_match.group(1).strip() if salary_match else None,
            "pub_date": item.findtext("pubDate"),
        })
    return items


def parse_vacancy_page(vacancy_id: str) -> dict:
    url = f"https://hh.ru/vacancy/{vacancy_id}"
    r = httpx.get(url, headers=HEADERS, follow_redirects=True, timeout=10)
    r.raise_for_status()
    soup = BeautifulSoup(r.content, "html.parser")

    description_el = soup.find("div", {"data-qa": "vacancy-description"})
    description = description_el.get_text(separator="\n", strip=True) if description_el else None

    skills = [el.get_text(strip=True) for el in soup.find_all(attrs={"data-qa": "skills-element"})]

    employer_el = soup.find("a", {"data-qa": "vacancy-company-name"})
    employer = employer_el.get_text(strip=True) if employer_el else None

    meta_desc = ""
    meta_el = soup.find("meta", {"name": "description"})
    if meta_el:
        meta_desc = meta_el.get("content", "")

    experience_match = re.search(r"опыт[:\s]+([^.]+)", meta_desc, re.I)
    employment_match = re.search(r"занятость[:\s]+([^.]+)", meta_desc, re.I)

    return {
        "employer": employer,
        "description": description,
        "key_skills": json.dumps(skills, ensure_ascii=False) if skills else None,
        "experience": experience_match.group(1).strip() if experience_match else None,
        "employment": employment_match.group(1).strip() if employment_match else None,
    }


def already_seen(session, vacancy_ids: list[str]) -> set[str]:
    rows = session.query(Vacancy.vacancy_id).filter(Vacancy.vacancy_id.in_(vacancy_ids)).all()
    return {r.vacancy_id for r in rows}


def run() -> None:
    init_db()

    with get_session() as session:
        profiles = session.query(SearchProfile).filter_by(active=True).all()

    if not profiles:
        log.warning("Нет активных профилей поиска. Добавь через /api/settings/search-profiles")
        return

    total_new = 0

    with httpx.Client(headers=HEADERS, follow_redirects=True, timeout=10) as client:
        for profile in profiles:
            log.info(f"Профиль: '{profile.keywords}' area={profile.area}")

            try:
                rss_items = fetch_rss(profile.keywords, profile.area)
            except Exception as e:
                log.error(f"RSS ошибка: {e}")
                continue

            log.info(f"  RSS: {len(rss_items)} вакансий")

            vacancy_ids = [item["vacancy_id"] for item in rss_items if item["vacancy_id"]]

            with get_session() as session:
                seen = already_seen(session, vacancy_ids)

            new_items = [item for item in rss_items if item["vacancy_id"] not in seen]
            log.info(f"  Новых: {len(new_items)}")

            for item in new_items:
                vid = item["vacancy_id"]
                try:
                    detail = parse_vacancy_page(vid)
                    time.sleep(REQUEST_DELAY)
                except Exception as e:
                    log.warning(f"  Пропускаю {vid}: {e}")
                    continue

                row = {**item, **detail, "status": "new"}

                with get_session() as session:
                    stmt = insert(Vacancy).values(**row).on_conflict_do_nothing(index_elements=["vacancy_id"])
                    session.execute(stmt)
                    session.commit()

                log.info(f"  + {vid} «{item['title']}»")
                total_new += 1

    log.info(f"Collector завершён. Добавлено вакансий: {total_new}")


if __name__ == "__main__":
    run()
