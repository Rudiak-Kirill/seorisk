import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy import text
from sqlalchemy.orm import Session

import config  # noqa: F401
from models import Base

DB_PATH = os.getenv("DB_PATH", str(Path(__file__).parent / "hh_agent.db"))
engine = create_engine(f"sqlite:///{DB_PATH}", echo=False)


def init_db() -> None:
    Base.metadata.create_all(engine)
    migrate_db()


def migrate_db() -> None:
    with engine.begin() as conn:
        columns = _columns(conn, "user_profile")
        if "name" not in columns:
            conn.execute(text("ALTER TABLE user_profile ADD COLUMN name TEXT"))
        for column in [
            "contact_phone",
            "contact_email",
            "location",
            "citizenship",
            "work_format",
            "employment_type",
            "travel_readiness",
            "education",
            "courses",
            "languages",
            "about",
        ]:
            if column not in columns:
                conn.execute(text(f"ALTER TABLE user_profile ADD COLUMN {column} TEXT"))

        columns = _columns(conn, "search_profiles")
        if "profile_id" not in columns:
            conn.execute(text("ALTER TABLE search_profiles ADD COLUMN profile_id INTEGER"))

        columns = _columns(conn, "negotiations")
        if "profile_id" not in columns:
            conn.execute(text("ALTER TABLE negotiations ADD COLUMN profile_id INTEGER"))

        columns = _columns(conn, "vacancies")
        if "applicants_count" not in columns:
            conn.execute(text("ALTER TABLE vacancies ADD COLUMN applicants_count INTEGER"))

        columns = _columns(conn, "vacancy_matches")
        if "search_profile_id" not in columns:
            conn.execute(text("ALTER TABLE vacancy_matches ADD COLUMN search_profile_id INTEGER"))
        if "search_keywords" not in columns:
            conn.execute(text("ALTER TABLE vacancy_matches ADD COLUMN search_keywords TEXT"))

        profile_id = conn.execute(text("SELECT id FROM user_profile ORDER BY id LIMIT 1")).scalar()
        if profile_id is not None:
            conn.execute(
                text("UPDATE user_profile SET name = COALESCE(name, position) WHERE id = :profile_id"),
                {"profile_id": profile_id},
            )
            conn.execute(
                text("UPDATE search_profiles SET profile_id = :profile_id WHERE profile_id IS NULL"),
                {"profile_id": profile_id},
            )
            conn.execute(
                text("UPDATE negotiations SET profile_id = :profile_id WHERE profile_id IS NULL"),
                {"profile_id": profile_id},
            )
            conn.execute(
                text(
                    """
                    INSERT OR IGNORE INTO vacancy_matches
                        (profile_id, vacancy_id, score, score_reason, status, created_at)
                    SELECT :profile_id, vacancy_id, score, score_reason, status, created_at
                    FROM vacancies
                    """
                ),
                {"profile_id": profile_id},
            )


def _columns(conn, table: str) -> set[str]:
    return {row[1] for row in conn.execute(text(f"PRAGMA table_info({table})")).fetchall()}


def get_session() -> Session:
    return Session(engine)
