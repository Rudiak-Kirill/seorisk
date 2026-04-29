from pathlib import Path

from dotenv import load_dotenv

# В Docker переменные приходят через environment: в docker-compose.
# Локально ищем .env рядом с файлом или в secrets/ корневого репо.
_here = Path(__file__).parent
_candidates = [_here / ".env"]
if len(_here.parents) > 2:
    _candidates.append(_here.parents[2] / "secrets" / "hh-agent.env")
for _p in _candidates:
    if _p.exists():
        load_dotenv(_p)
        break
