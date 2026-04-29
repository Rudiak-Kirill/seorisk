import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

import config  # noqa: F401
from models import Base

DB_PATH = os.getenv("DB_PATH", str(Path(__file__).parent / "hh_agent.db"))
engine = create_engine(f"sqlite:///{DB_PATH}", echo=False)


def init_db() -> None:
    Base.metadata.create_all(engine)


def get_session() -> Session:
    return Session(engine)
