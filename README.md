# SEO Risk Check (Next.js + Python)

Витрина на Next.js (App Router + Tailwind) и Python-движок проверки в `api/check.py`.

## Как устроено

- `/` — витрина инструментов.
- `/tools/ssr-check` — форма проверки URL и карточки результата.
- `POST /api/ssr-check` — Next route handler, проксирует запросы на `PY_ENGINE_URL`.
- `api/check.py`, `api/check_debug.py` — Python engine (логика не меняется).

## Переменные окружения

Создайте `.env.local`:

```
PY_ENGINE_URL=https://seorisk.vercel.app/api/check.py
```

Можно указывать любой URL, который принимает `?url=...` и возвращает JSON.

## Локальный запуск

```
npm install
npm run dev
```

Открой `http://localhost:3000`.

## Деплой на Vercel

1. Добавь `PY_ENGINE_URL` в Environment Variables проекта.
2. Задеплой (push в `main`).

Примечание: `api/*.py` остаются Python-функциями Vercel и не зависят от Next.
