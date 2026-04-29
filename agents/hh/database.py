import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from models import Base

# Ищем .env рядом с агентом, затем в корневом secrets/
_here = Path(__file__).parent
_env_paths = [
    _here / ".env",
    _here.parents[3] / "secrets" / "hh-agent.env",
]
for _p in _env_paths:
    if _p.exists():
        load_dotenv(_p)
        break

DB_PATH = os.getenv("DB_PATH", str(Path(__file__).parent / "hh_agent.db"))
engine = create_engine(f"sqlite:///{DB_PATH}", echo=False)


def init_db() -> None:
    Base.metadata.create_all(engine)


def get_session() -> Session:
    return Session(engine)
