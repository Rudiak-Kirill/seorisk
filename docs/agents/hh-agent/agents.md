# Агенты

← [README](./README.md) | [БД](./database.md) | [API](./api.md)

---

## Collector

**Триггер:** APScheduler, каждые 2 часа.

1. Читает профили поиска из `search_profiles`.
2. Запрашивает `GET /vacancies` HH API с параметрами профиля.
3. Для каждой вакансии — `GET /vacancies/{id}` за полной карточкой.
4. Upsert в таблицу `vacancies` по `vacancy_id`.
5. **Пропускает** вакансии с `has_test=true` или `vacancy_type=direct`.

---

## Scorer

**Триггер:** запускается после Collector или вручную через `POST /api/score`.

1. Выбирает вакансии со статусом `new`.
2. Отправляет в Claude: описание вакансии + `user_profile` из БД.
3. Claude возвращает:
   ```json
   { "score": 0-100, "reason": "...", "recommended": true }
   ```
4. Обновляет поля `score`, `score_reason` в `vacancies`.
5. `score >= 50` → статус `scored`; `score < 50` → статус `skipped`.

---

## Responder

**Триггер:** пользователь нажимает «Откликнуться» в интерфейсе.

1. Получает вакансию по `id`, подтягивает `user_profile`.
2. Генерирует сопроводительное письмо через Claude (учитывает `response_letter_required`, навыки, тон из настроек).
3. Показывает письмо пользователю для редактирования.
4. После подтверждения — `POST /negotiations` в HH API.
5. Записывает отклик в `negotiations`.

### Чат по отклику

- Получение сообщений: `GET /negotiations/{id}/messages`
- Отправка ответа: `POST /negotiations/{id}/messages`
- Пользователь добавляет контекст → Claude формирует ответ → пользователь подтверждает.
