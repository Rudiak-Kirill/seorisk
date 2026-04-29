# HH-Agent — Автоматизация откликов на HH.ru

**URL:** `seorisk.ru/agents/hh`  
**Стек:** Python 3.11, FastAPI, SQLite (SQLAlchemy), APScheduler, httpx, Claude API (`claude-sonnet-4-5-20251001`)

## Как работает

1. **Collector** собирает вакансии по расписанию (каждые 2 ч) → [agents.md](./agents.md#collector)
2. **Scorer** оценивает вакансии через Claude API → [agents.md](./agents.md#scorer)
3. **Responder** генерирует и отправляет отклик по запросу пользователя → [agents.md](./agents.md#responder)

## Структура проекта

```
agents/hh/
├── main.py          # FastAPI + APScheduler
├── collector.py
├── scorer.py
├── responder.py
├── models.py        # SQLAlchemy ORM
├── static/
│   └── index.html   # весь фронтенд
└── .env
```

## Зависимости (.env)

```
HH_TOKEN=...
ANTHROPIC_API_KEY=...
RESUME_ID=...
```

## Ссылки

- [Агенты](./agents.md)
- [Интеграции](./integrations.md)
- [Схема БД](./database.md)
- [API-контракт](./api.md)
