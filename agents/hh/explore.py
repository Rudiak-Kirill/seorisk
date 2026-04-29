"""
Разведочный скрипт — дампит ответы HH API в папку output/.
Запуск: python explore.py
"""

import json
import os
from pathlib import Path

import httpx

BASE_URL = "https://api.hh.ru"
HEADERS = {"User-Agent": "seorisk-hh-agent/1.0 (rudyak.kirill@gmail.com)"}
OUTPUT = Path(__file__).parent / "output"

SEARCH_PARAMS = {
    "text": "Python разработчик",
    "area": 1,          # Москва
    "per_page": 5,
    "experience": "between1And3",
    "employment": "full",
}


def dump(name: str, data: dict) -> None:
    OUTPUT.mkdir(exist_ok=True)
    path = OUTPUT / f"{name}.json"
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  → {path}")


def main() -> None:
    with httpx.Client(base_url=BASE_URL, headers=HEADERS, timeout=10) as client:

        # 1. Поиск вакансий
        print("GET /vacancies ...")
        r = client.get("/vacancies", params=SEARCH_PARAMS)
        r.raise_for_status()
        search = r.json()
        dump("vacancies_search", search)

        items = search.get("items", [])
        print(f"  найдено: {search.get('found')}, на странице: {len(items)}")

        if not items:
            print("Вакансий не найдено — попробуй изменить SEARCH_PARAMS")
            return

        # 2. Полная карточка первой вакансии
        first_id = items[0]["id"]
        print(f"\nGET /vacancies/{first_id} ...")
        r = client.get(f"/vacancies/{first_id}")
        r.raise_for_status()
        dump("vacancy_detail", r.json())

        # 3. Краткий отчёт по полям
        detail = r.json()
        print("\n--- Поля карточки ---")
        for key, val in detail.items():
            preview = str(val)[:80].replace("\n", " ")
            print(f"  {key}: {preview}")


if __name__ == "__main__":
    main()
