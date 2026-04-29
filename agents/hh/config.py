from pathlib import Path

from dotenv import load_dotenv

_here = Path(__file__).parent
_env_paths = [
    _here / ".env",
    _here.parents[2] / "secrets" / "hh-agent.env",
]

for _p in _env_paths:
    if _p.exists():
        load_dotenv(_p)
        break
