"""
Разведочный скрипт — дампит вакансии из RSS + парсинг страниц.
Запуск: python explore.py
"""

import json
import re
import time
from pathlib import Path
from xml.etree import ElementTree as ET

import httpx
from bs4 import BeautifulSoup

OUTPUT = Path(__file__).parent / "output"
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}

SEARCH_PARAMS = {
    "text": "Python разработчик",
    "area": 1,       # Москва
    "per_page": 5,
}


def fetch_rss(params: dict) -> list[dict]:
    r = httpx.get("https://hh.ru/search/vacancy/rss", params=params, headers=HEADERS, follow_redirects=True)
    r.raise_for_status()
    root = ET.fromstring(r.content)
    items = []
    for item in root.findall(".//item"):
        desc_html = item.findtext("description") or ""
        desc_text = re.sub(r"<[^>]+>", " ", desc_html).strip()
        salary_match = re.search(r"доход[а-я\s]*:\s*(.+?)(?:\s*$)", desc_text, re.I)
        items.append({
            "title": item.findtext("title"),
            "vacancy_id": (item.findtext("link") or "").rstrip("/").split("/")[-1],
            "url": item.findtext("link"),
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

    experience = re.search(r"опыт[:\s]+([^.]+)", meta_desc, re.I)
    employment = re.search(r"занятость[:\s]+([^.]+)", meta_desc, re.I)

    return {
        "vacancy_id": vacancy_id,
        "url": url,
        "employer": employer,
        "description": description,
        "key_skills": skills,
        "experience": experience.group(1).strip() if experience else None,
        "employment": employment.group(1).strip() if employment else None,
        "meta_description": meta_desc,
    }


def main() -> None:
    OUTPUT.mkdir(exist_ok=True)

    print("1. Получаем RSS...")
    items = fetch_rss(SEARCH_PARAMS)
    (OUTPUT / "rss_items.json").write_text(
        json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"   Вакансий: {len(items)}")

    print("\n2. Парсим первые 3 страницы вакансий...")
    results = []
    for item in items[:3]:
        vid = item["vacancy_id"]
        print(f"   /vacancy/{vid} ...", end=" ")
        try:
            detail = parse_vacancy_page(vid)
            detail.update({"title": item["title"], "salary_text": item["salary_text"], "pub_date": item["pub_date"]})
            results.append(detail)
            print(f"skills: {detail['key_skills']}")
        except Exception as e:
            print(f"ОШИБКА: {e}")
        time.sleep(0.5)

    (OUTPUT / "vacancies_parsed.json").write_text(
        json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"\nГотово. Результат: output/vacancies_parsed.json")


if __name__ == "__main__":
    main()
