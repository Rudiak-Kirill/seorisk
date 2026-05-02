"""
Local browser helper for preparing HH.ru applications.

It opens a real browser session, uses the saved HH login, opens a vacancy,
clicks the response flow, inserts a generated cover letter, and stops before
the final submit button.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path
from typing import Any

from database import init_db
from responder import generate_letter

DEFAULT_PROFILE_DIR = Path(__file__).parent / ".browser" / "hh"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Prepare HH.ru application in a real browser")
    subparsers = parser.add_subparsers(dest="command", required=True)

    prepare = subparsers.add_parser("prepare_apply", help="Open vacancy and prepare response draft")
    prepare.add_argument("--vacancy-id", required=True, help="HH vacancy id from local DB")
    prepare.add_argument("--profile-id", type=int, required=True, help="Local resume profile id")
    prepare.add_argument(
        "--browser-profile-dir",
        default=str(DEFAULT_PROFILE_DIR),
        help="Persistent Playwright browser profile directory",
    )
    prepare.add_argument("--hh-resume-title", default="", help="Visible HH resume title to select, if needed")
    prepare.add_argument("--headless", action="store_true", help="Run browser in headless mode")
    prepare.add_argument("--slow-mo", type=int, default=80, help="Playwright slow_mo in milliseconds")
    return parser.parse_args()


def click_first(page: Any, patterns: list[str], timeout: int = 3000) -> bool:
    for pattern in patterns:
        locator = page.get_by_text(re.compile(pattern, re.I)).first
        if click_locator(locator, timeout=timeout):
            return True
    return False


def click_locator(locator: Any, timeout: int = 3000) -> bool:
    try:
        locator.wait_for(state="visible", timeout=timeout)
        locator.click(timeout=timeout)
        return True
    except Exception:
        return False


def ensure_logged_in(page: Any) -> None:
    page.goto("https://hh.ru/applicant/resumes", wait_until="domcontentloaded")
    page.wait_for_timeout(1200)

    login_visible = page.get_by_text(re.compile(r"Войти|Вход|Зарегистрироваться", re.I)).first
    try:
        if login_visible.is_visible(timeout=1500):
            print("HH просит вход. Войдите в открытом браузере, затем нажмите Enter здесь.")
            input()
            page.goto("https://hh.ru/applicant/resumes", wait_until="domcontentloaded")
    except Exception:
        return


def open_response_flow(page: Any) -> None:
    clicked = click_first(
        page,
        [
            r"^Откликнуться$",
            r"Откликнуться сейчас",
            r"Отправить отклик",
            r"Откликнуться на вакансию",
        ],
        timeout=6000,
    )
    if not clicked:
        print("Не нашёл кнопку отклика. Проверьте страницу вручную: возможно, уже есть отклик или HH показал проверку.")
        return

    page.wait_for_timeout(1200)


def select_resume_if_needed(page: Any, hh_resume_title: str) -> None:
    if not hh_resume_title:
        return

    locator = page.get_by_text(hh_resume_title, exact=False).first
    if click_locator(locator, timeout=2500):
        page.wait_for_timeout(600)
        return

    print(f"Не смог выбрать резюме по названию: {hh_resume_title!r}. Выберите резюме вручную.")


def reveal_cover_letter_field(page: Any) -> None:
    click_first(
        page,
        [
            r"Сопроводительное письмо",
            r"Добавить письмо",
            r"Добавить сопроводительное",
            r"Написать письмо",
        ],
        timeout=1500,
    )
    page.wait_for_timeout(500)


def fill_cover_letter(page: Any, cover_letter: str) -> bool:
    reveal_cover_letter_field(page)

    candidates = [
        page.locator("textarea").last,
        page.locator("[contenteditable='true']").last,
        page.get_by_role("textbox").last,
    ]
    for locator in candidates:
        try:
            locator.wait_for(state="visible", timeout=2500)
            locator.fill(cover_letter, timeout=5000)
            return True
        except Exception:
            continue

    print("Не нашёл поле сопроводительного письма. Текст письма ниже, вставьте вручную:\n")
    print(cover_letter)
    return False


def prepare_apply(args: argparse.Namespace) -> int:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("Playwright не установлен. Выполните: python -m pip install -r requirements-browser.txt")
        return 2

    init_db()
    letter = generate_letter(args.vacancy_id, args.profile_id)
    vacancy_url = letter["url"] or f"https://hh.ru/vacancy/{args.vacancy_id}"
    cover_letter = letter["cover_letter"]

    browser_profile_dir = Path(args.browser_profile_dir)
    browser_profile_dir.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as playwright:
        context = playwright.chromium.launch_persistent_context(
            user_data_dir=str(browser_profile_dir),
            headless=args.headless,
            slow_mo=args.slow_mo,
            viewport={"width": 1440, "height": 1000},
        )
        page = context.pages[0] if context.pages else context.new_page()

        ensure_logged_in(page)
        page.goto(vacancy_url, wait_until="domcontentloaded")
        page.wait_for_timeout(1200)

        open_response_flow(page)
        select_resume_if_needed(page, args.hh_resume_title)
        filled = fill_cover_letter(page, cover_letter)

        print("\nЧерновик отклика подготовлен.")
        print("Проверьте резюме, письмо и условия на странице HH.")
        print("Финальную кнопку отправки нажмите вручную в браузере.")
        if not filled:
            print("Поле письма не было заполнено автоматически.")

        input("После проверки/отправки нажмите Enter, чтобы закрыть браузер...")
        context.close()

    return 0


def main() -> int:
    args = parse_args()
    if args.command == "prepare_apply":
        return prepare_apply(args)
    return 1


if __name__ == "__main__":
    sys.exit(main())
