# WM Finance - Архитектура Backend

## Текущая структура (монолит)

```
/app/backend/
├── server.py          # ~3850 строк - все в одном файле
├── .env               # Конфигурация
├── requirements.txt
├── google_service_account.json
├── uploads/           # Загруженные документы
├── models/           # СОЗДАНО - Pydantic модели
│   └── __init__.py
├── routes/           # СОЗДАНО - FastAPI роуты (частично)
│   ├── __init__.py
│   └── auth.py
└── services/         # СОЗДАНО - Сервисы
    ├── __init__.py
    └── database.py
```

## Целевая структура (модульная)

```
/app/backend/
├── main.py                    # Точка входа, CORS, startup events
├── config.py                  # Конфигурация приложения
├── models/
│   ├── __init__.py
│   ├── user.py               # UserCreate, UserLogin, User, AdminUser*
│   ├── account.py            # Account, AccountCreate
│   ├── category.py           # Category, CategoryCreate
│   ├── direction.py          # BusinessDirection, DirectionCreate
│   ├── contractor.py         # Contractor, ContractorCreate
│   ├── transaction.py        # Transaction, TransactionCreate
│   ├── planned_payment.py    # PlannedPayment, PlannedPaymentCreate
│   ├── project.py            # Project, ProjectCreate
│   ├── document.py           # Document, DocumentLinkRequest
│   ├── integration.py        # IntegrationSettings, Adesk*, Telegram*
│   └── notification.py       # Notification
├── routes/
│   ├── __init__.py
│   ├── auth.py               # /auth/*
│   ├── admin.py              # /admin/* (users management)
│   ├── accounts.py           # /accounts/*
│   ├── categories.py         # /categories/*
│   ├── directions.py         # /directions/*
│   ├── contractors.py        # /contractors/*
│   ├── transactions.py       # /transactions/*
│   ├── planned_payments.py   # /planned-payments/*
│   ├── projects.py           # /projects/*
│   ├── documents.py          # /documents/*
│   ├── analytics.py          # /analytics/*
│   ├── import_data.py        # /import/*
│   ├── integrations.py       # /settings/integrations/*
│   ├── adesk.py              # /adesk/*
│   ├── telegram.py           # /telegram/*, /bot/*
│   ├── ai.py                 # /ai/*
│   ├── backup.py             # /backup/*
│   └── notifications.py      # /notifications/*
├── services/
│   ├── __init__.py
│   ├── database.py           # MongoDB connection
│   ├── auth.py               # JWT, password hashing
│   ├── analytics.py          # Расчёты аналитики
│   ├── backup.py             # Google Sheets backup
│   ├── telegram.py           # Telegram bot integration
│   ├── ai_assistant.py       # Claude AI integration
│   └── scheduler.py          # APScheduler jobs
└── utils/
    ├── __init__.py
    └── helpers.py            # Общие хелперы
```

## Секции server.py для миграции

| Строки | Секция | Целевой файл |
|--------|--------|--------------|
| 47-385 | Models | models/*.py |
| 386-456 | Auth helpers + routes | routes/auth.py |
| 457-503 | Seed data | services/seed.py |
| 504-598 | Admin user management | routes/admin.py |
| 600-633 | Accounts routes | routes/accounts.py |
| 634-673 | Categories routes | routes/categories.py |
| 674-707 | Directions routes | routes/directions.py |
| 708-769 | Contractors routes | routes/contractors.py |
| 770-972 | Transactions routes | routes/transactions.py |
| 973-1076 | Planned payments | routes/planned_payments.py |
| 1077-1155 | Projects routes | routes/projects.py |
| 1156-1186 | Auto rules | routes/auto_rules.py |
| 1187-1366 | Analytics routes | routes/analytics.py |
| 1367-1545 | Import routes | routes/import_data.py |
| 1546-1678 | Telegram bot API | routes/telegram.py |
| 1679-1801 | AI Assistant | routes/ai.py |
| 1802-2119 | Documents routes | routes/documents.py |
| 2120-2200 | Notifications | routes/notifications.py |
| 2201-2625 | Analytics P&L/Balance | routes/analytics.py |
| 2626-2635 | Health check | main.py |
| 2636-2929 | Telegram enhanced | routes/telegram.py |
| 2930-3425 | Adesk migration | routes/adesk.py |
| 3426-3719 | Google Sheets backup | services/backup.py |
| 3720-3852 | Scheduler | services/scheduler.py |

## План миграции

### Этап 1 (Выполнено)
- [x] Создать структуру папок
- [x] Создать models/__init__.py со всеми моделями
- [x] Создать services/database.py
- [x] Создать routes/auth.py (готов, но не подключен)

### Этап 2 (Следующий)
- [ ] Перенести routes/admin.py
- [ ] Перенести routes/accounts.py
- [ ] Перенести routes/categories.py
- [ ] Подключить новые роуты к main.py
- [ ] Протестировать

### Этап 3
- [ ] Перенести routes/transactions.py
- [ ] Перенести routes/analytics.py
- [ ] Перенести services/backup.py
- [ ] Перенести services/scheduler.py

### Этап 4
- [ ] Перенести остальные роуты
- [ ] Удалить старый server.py
- [ ] Переименовать main.py в server.py (для совместимости)

## Важные зависимости

- `get_current_user` используется во всех защищённых роутах
- `db` (MongoDB) используется везде
- `seed_user_data` вызывается при создании пользователя
- APScheduler должен запускаться при старте приложения

## Команда для запуска

```bash
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

---

*Создано: 24.02.2026*
