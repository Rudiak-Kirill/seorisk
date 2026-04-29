# Интеграции

← [README](./README.md) | [Агенты](./agents.md) | [БД](./database.md) | [API](./api.md)

---

## HH.ru API

**Документация:** https://github.com/hhru/api  
**Базовый URL:** `https://api.hh.ru`  
**Авторизация:** Bearer-токен в заголовке `Authorization: Bearer {HH_TOKEN}`

### Используемые эндпоинты

| Эндпоинт | Метод | Агент | Назначение |
|---|---|---|---|
| `/vacancies` | GET | Collector | Поиск вакансий по параметрам |
| `/vacancies/{id}` | GET | Collector | Полная карточка вакансии |
| `/negotiations` | POST | Responder | Отправить отклик |
| `/negotiations/{id}/messages` | GET | Responder | Получить сообщения чата |
| `/negotiations/{id}/messages` | POST | Responder | Отправить сообщение |

### Параметры поиска вакансий (`GET /vacancies`)

| Параметр | Тип | Источник |
|---|---|---|
| `text` | string | `search_profiles.keywords` |
| `area` | integer | `search_profiles.area` |
| `salary` | integer | `search_profiles.salary_from` |
| `experience` | string | `search_profiles.experience` |
| `employment` | string | `search_profiles.employment` |
| `per_page` | integer | фиксировано: 50 |

### Получение токена

Токен получается вручную через OAuth2 Authorization Code Flow на [dev.hh.ru](https://dev.hh.ru).  
Срок действия — 14 дней. Обновление через `refresh_token` (хранится в `.env`).

```
HH_TOKEN=...
HH_REFRESH_TOKEN=...
```

> Автообновление токена при 401-ответе — ответственность `collector.py`.

---

## Claude API (Anthropic)

**SDK:** `anthropic` (Python)  
**Модель:** `claude-sonnet-4-5-20251001`

### Используется агентами

| Агент | Промпт | Ожидаемый формат ответа |
|---|---|---|
| Scorer | Описание вакансии + `user_profile` | JSON: `{ score, reason, recommended }` |
| Responder | Вакансия + профиль + тон | Текст письма |
| Чат | История сообщений + контекст | Текст сообщения |

### Ключ

```
ANTHROPIC_API_KEY=...
```
