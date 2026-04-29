# Схема БД (SQLite)

← [README](./README.md) | [Агенты](./agents.md) | [API](./api.md)

---

## search_profiles

| Поле | Тип | Описание |
|---|---|---|
| id | INTEGER PK | |
| keywords | TEXT | Ключевые слова для поиска |
| area | INTEGER | Регион (HH area_id) |
| salary_from | INTEGER | Зарплата от |
| experience | TEXT | `noExperience` / `between1And3` / … |
| employment | TEXT | `full` / `part` / … |
| active | BOOLEAN | Включён ли профиль |

## user_profile

| Поле | Тип | Описание |
|---|---|---|
| id | INTEGER PK | |
| position | TEXT | Желаемая должность |
| skills | TEXT | Навыки (через запятую) |
| experience_summary | TEXT | Краткое резюме опыта |
| salary_expected | INTEGER | Ожидаемая зарплата |
| stop_words | TEXT | Стоп-слова для скорера |
| cover_letter_tone | TEXT | Тон письма (`formal` / `friendly`) |

## vacancies

| Поле | Тип | Описание |
|---|---|---|
| id | INTEGER PK | |
| vacancy_id | TEXT UNIQUE | ID вакансии на HH |
| title | TEXT | |
| employer | TEXT | |
| salary | TEXT | |
| description | TEXT | |
| key_skills | TEXT | JSON-массив |
| response_letter_required | BOOLEAN | |
| has_test | BOOLEAN | |
| vacancy_type | TEXT | |
| raw_json | TEXT | Полный ответ HH API |
| score | INTEGER | 0–100, выставляет Scorer |
| score_reason | TEXT | Пояснение от Claude |
| status | TEXT | `new` / `scored` / `skipped` / `applied` / `hidden` |
| created_at | DATETIME | |

## negotiations

| Поле | Тип | Описание |
|---|---|---|
| id | INTEGER PK | |
| vacancy_id | TEXT | FK → vacancies.vacancy_id |
| resume_id | TEXT | Из .env |
| cover_letter | TEXT | Итоговое письмо |
| status | TEXT | Статус от HH API |
| hh_negotiation_id | TEXT | ID отклика на HH |
| chat_history | TEXT | JSON: история сообщений |
| created_at | DATETIME | |
