# API-контракт

← [README](./README.md) | [Агенты](./agents.md) | [БД](./database.md)

---

## Вакансии

| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/vacancies` | Список вакансий; параметры: `status`, `limit`, `offset` |
| POST | `/api/vacancies/collect` | Запустить Collector вручную |
| POST | `/api/vacancies/score` | Запустить Scorer вручную |
| PATCH | `/api/vacancies/{id}/hide` | Перевести в статус `hidden` |

## Отклики

| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/negotiations` | Список откликов со статусами |
| POST | `/api/apply` | Сгенерировать письмо (Responder, шаг 1) |
| POST | `/api/apply/confirm` | Подтвердить и отправить отклик в HH |

**`POST /api/apply`**
```json
// request
{ "vacancy_id": "12345" }

// response
{ "cover_letter": "...", "vacancy_title": "..." }
```

**`POST /api/apply/confirm`**
```json
// request
{ "vacancy_id": "12345", "cover_letter": "..." }

// response
{ "negotiation_id": "...", "status": "ok" }
```

## Чат

| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/chat/{negotiation_id}` | История сообщений |
| POST | `/api/chat/{negotiation_id}` | Сгенерировать ответ через Claude |
| POST | `/api/chat/{negotiation_id}/send` | Отправить сообщение в HH |

## Настройки

| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/settings` | Профиль соискателя + профили поиска |
| PUT | `/api/settings/profile` | Обновить `user_profile` |
| POST | `/api/settings/search-profiles` | Добавить профиль поиска |
| DELETE | `/api/settings/search-profiles/{id}` | Удалить профиль поиска |

## Статический фронтенд

`GET /` — отдаёт `static/index.html` (весь интерфейс).
