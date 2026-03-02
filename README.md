# SEO Risk Check (SaaS Starter)

Витрина на шаблоне **Next.js SaaS Starter** + Python‑движок проверок в `api/check.py`.

## Страницы

- `/` — витрина инструментов.
- `/tools/ssr-check` — форма проверки URL и карточки результата.
- `POST /api/ssr-check` — прокси на `PY_ENGINE_URL`.

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
2. Сделай deploy (push в `main`).

Python‑функции остаются в `api/` и не меняются.
