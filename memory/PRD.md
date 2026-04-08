# WM Finance - Product Requirements Document

## Описание проекта
WM Finance — веб-приложение финансового учёта для польского бизнеса по производству и продаже теплиц, саун и купелей.

## Технический стек
- **Frontend:** React + Shadcn/UI + Tailwind CSS
- **Backend:** FastAPI (Python) — модульная архитектура
- **БД:** MongoDB
- **Интеграции:** Claude Sonnet 4.5 (AI), Telegram Bot + Telegram Cash Bot, Google Sheets, Adesk API, NBP API (EUR/PLN)

## Архитектура (v2.5.0)
```
/app/backend/routes/
├── auth.py              # Вход, регистрация
├── accounts.py          # CRUD счетов
├── categories.py        # CRUD категорий
├── contractors.py       # CRUD контрагентов
├── transactions.py      # CRUD операций
├── planned_payments.py  # Плановые платежи
├── projects.py          # Проекты + правила автоматизации
├── documents.py         # Документы: папки, загрузка, обработка, экспорт
├── analytics.py         # Аналитика
├── expense_plan.py      # План расходов
├── bank_import.py       # Импорт PDF выписок (PKO BP)
├── cash_import.py       # Импорт наличных из Google Sheets
├── telegram_webhook.py  # Telegram Cash Bot (webhook)
├── bot.py               # Telegram Bot API (legacy)
├── integrations.py      # Telegram/GSheets настройки
├── exchange_rate.py     # Курс EUR/PLN (NBP API)
├── ai.py                # AI-ассистент

/app/frontend/src/
├── components/
│   ├── BankImportModal.jsx
│   ├── CashImportModal.jsx
│   ├── Layout.jsx
│   └── ...
├── pages/
│   ├── DashboardPage.jsx
│   ├── TransactionsPage.jsx
│   ├── DocumentsPage.jsx    # Папки, календарь, обработка
│   ├── IntegrationsPage.jsx  # Авто-бэкап статус
│   └── ...
```

## Реализованные функции
- [x] Аутентификация с ролями
- [x] Мультивалютность (PLN, EUR, USD)
- [x] Управление счетами, категориями, направлениями, контрагентами
- [x] CRUD операций + CSV импорт
- [x] Плановые платежи, Документы, Аналитика
- [x] AI-ассистент (Claude Sonnet 4.5)
- [x] Telegram Bot (сводки)
- [x] Google Sheets автобэкап (ежедневный в 02:00)
- [x] План расходов — CRUD, экспорт CSV
- [x] Импорт PDF выписок — парсинг PKO BP, inline-ревью
- [x] Inline-редактирование при импорте + комментарии
- [x] Мульти-выбор счетов на дашборде
- [x] Сводка за период на странице Операций
- [x] Навигация: Импорт и Автоправила в разделе "Документы"
- [x] Авто-сохранение PDF в документы при импорте
- [x] Импорт наличных из Google Sheets (выбор периода, дедупликация, настройки)
- [x] **Telegram Cash Bot** — запись наличных операций из Telegram
- [x] **Бэкап наличных** — отдельный лист "Наличные" в Google Sheets
- [x] **Сводка по счетам** — все Telegram сводки показывают балансы по каждому счёту
- [x] **Telegram: needs_review** — все операции из бота помечаются needs_review=True
- [x] **Документы: обработка без привязки** — кнопка "Обработать" для документов без привязки к операции (статус "Обработан")
- [x] **Документы: папки** — создание папок, перемещение документов, фильтрация по папке
- [x] **Документы: календарь** — выбор периода через календарь вместо текстового ввода
- [x] **Авто-бэкап Google Sheets** — ежедневный бэкап в 02:00, отображение последнего бэкапа в настройках

## Ключевые API
- `POST /api/telegram/webhook` — Telegram webhook (публичный)
- `POST /api/telegram/setup-webhook` — Регистрация вебхука
- `GET /api/exchange-rate/current` — Курс NBP
- `POST /api/cash-import/fetch` — Загрузка Google Таблицы
- `POST /api/backup/google-sheets` — Ручной бэкап
- `GET /api/backup/status` — Статус бэкапа (auto_backup_enabled, last_backup_at)
- `GET /api/documents/folders` — Список папок
- `POST /api/documents/folders` — Создание папки
- `DELETE /api/documents/folders/{id}` — Удаление папки
- `POST /api/documents/{id}/process` — Обработка документа без привязки
- `POST /api/documents/{id}/move` — Перемещение в папку

## Исправления (08.04.2026)
- [x] Сводка переводов на странице Операций: при фильтре по счёту переводы теперь считаются как доход (входящие) / расход (исходящие) с учётом кросс-валютных конвертаций (`to_amount_base`)
- [x] Визуальная колонка направления: переводы показывают +/- и цветовую индикацию (зелёный "↓ Приход" / красный "↑ Расход") при фильтре по конкретному счёту; кросс-валютные переводы показывают сумму в валюте целевого счёта
- [x] Аудит Аналитики: все эндпоинты проверены — переводы корректно учитываются per-account и исключены из глобального PnL; убраны фантомные записи валют при глобальном просмотре
- [x] Dark theme кнопки: обновлены CSS переменные `--border`/`--input` (lightness 15.9% → 26%) + добавлен `bg-card text-foreground` к SelectTrigger на страницах аналитики (CashFlow, PnL, Profitability, ExpenseAnalysis)

## Предстоящие задачи

### P1 — Следующие
- [ ] Добавить вторую Google Таблицу для направления "Сауны"
- [ ] Вебхуки и уведомления (отложено пользователем)

### P2 — Бэклог
- [ ] Google Drive интеграция
- [ ] AI еженедельные дайджесты
- [ ] Рефакторинг BankImportModal.jsx

## Учётные данные
- **Superadmin:** admin / 220066mm

---
*Последнее обновление: 29.03.2026*
