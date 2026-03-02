## SEO Risk Checker (Lite)

Минимальный сервис разовой проверки URL: браузер + Googlebot + YandexBot.

### Возможности
- 3 прогона (browser, Googlebot, Yandexbot)
- Метрики: `http_code`, `text_len`, `links_count`, `has_h1`, `has_title`
- Итог: `verdict` = `ok` или `mismatch`, список `reasons`
- Лимит: 1 URL на IP в сутки (best-effort, in-memory `/tmp`)
- Исключение из лимита: `zakupki44fz.ru`

### Структура
```
seorisk/
  index.html
  api/
    check.py
```

### API
`GET /api/check.py?url=...`

Ответ:
```json
{
  "ok": true,
  "url": "https://example.com",
  "checked_at": "2026-03-02T10:00:00Z",
  "verdict": "ok",
  "reasons": [],
  "checks": {
    "browser": {"http_code": 200, "text_len": 1234, "links_count": 10, "has_h1": true, "has_title": true, "access_state": "ok"},
    "yandex": {"http_code": 200, "text_len": 1200, "links_count": 9, "has_h1": true, "has_title": true, "access_state": "ok"},
    "google": {"http_code": 200, "text_len": 1210, "links_count": 10, "has_h1": true, "has_title": true, "access_state": "ok"}
  }
}
```

### Запуск локально
Открой `index.html`, API требует среду Vercel/Python serverless.

### Ограничения
- Лимит IP реализован через `/tmp` и не устойчив к рестартам.
- Нет JavaScript рендера, только HTTP HTML.

### Дальше (по желанию)
- Подключить Vercel KV/Upstash для строгого лимита.
- Добавить кэш результатов на 24 часа.
- Добавить простой фронтовый отчёт вместо raw JSON.
