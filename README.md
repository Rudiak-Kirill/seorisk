# SEO Risk Check

SaaS/инструмент для проверки SEO-рисков. Проект использует Next.js и Python-движок проверок в `api/check.py`.

Репозиторий ведётся как самостоятельный внешний ресурс внутри рабочей области `cursor-repos`.

## Ссылки

- GitHub: https://github.com/Rudiak-Kirill/seorisk
- Рабочая область: [cursor-repos](../)
- Документация агентов: [cursor-repos/docs/agents](https://github.com/Rudiak-Kirill/cursor-repos/tree/main/docs/agents)
- Связанный проект: [rudiak-kirill-site](../rudiak-kirill-site/)

## Страницы

- `/` — витрина инструментов.
- `/tools/ssr-check` — форма проверки URL и карточки результата.
- `POST /api/ssr-check` — прокси на `PY_ENGINE_URL`.

## Переменные окружения

Создать `.env.local`:

```env
PY_ENGINE_URL=https://seorisk.vercel.app/api/check.py
```

Можно указать любой URL, который принимает `?url=...` и возвращает JSON.

## Локальный запуск

```bash
npm install
npm run dev
```

Открыть `http://localhost:3000`.

## Деплой на Vercel

1. Добавить `PY_ENGINE_URL` в Environment Variables проекта.
2. Сделать deploy через push в `main`.

Python-функции остаются в `api/`.
