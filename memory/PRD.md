# WM Finance - Product Requirements Document

## Описание проекта
WM Finance — веб-приложение финансового учёта для польского бизнеса по производству и продаже теплиц, саун и купелей.

## Технический стек
- **Frontend:** React + Shadcn/UI + Tailwind CSS
- **Backend:** FastAPI (Python) — модульная архитектура
- **БД:** MongoDB
- **Интеграции:** Claude Sonnet 4.5 (AI), Telegram Bot + Telegram Cash Bot, Google Sheets, Adesk API

## Архитектура (v2.4.0)
```
/app/backend/routes/
├── auth.py              # Вход, регистрация
├── accounts.py          # CRUD счетов
├── categories.py        # CRUD категорий
├── contractors.py       # CRUD контрагентов
├── transactions.py      # CRUD операций
├── planned_payments.py  # Плановые платежи
├── projects.py          # Проекты + правила автоматизации
├── documents.py         # Документы: загрузка, экспорт
├── analytics.py         # Аналитика
├── expense_plan.py      # План расходов
├── bank_import.py       # Импорт PDF выписок (PKO BP)
├── cash_import.py       # Импорт наличных из Google Sheets
├── telegram_webhook.py  # Telegram Cash Bot (webhook)
├── bot.py               # Telegram Bot API (legacy)
├── integrations.py      # Telegram/GSheets настройки
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
│   ├── ImportPage.jsx
│   ├── IntegrationsPage.jsx  # + Telegram Касса секция
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
- [x] Google Sheets автобэкап
- [x] План расходов — CRUD, экспорт CSV
- [x] Импорт PDF выписок — парсинг PKO BP, inline-ревью
- [x] Inline-редактирование при импорте + комментарии
- [x] Мульти-выбор счетов на дашборде
- [x] Сводка за период на странице Операций
- [x] Навигация: Импорт и Автоправила в разделе "Документы"
- [x] Авто-сохранение PDF в документы при импорте
- [x] Импорт наличных из Google Sheets (выбор периода, дедупликация, настройки)
- [x] **Telegram Cash Bot** — запись наличных операций из Telegram:
  - /start → выбор направления (inline-кнопки)
  - Отправка "1000 Антон зп" → расход, "+5000 продажа" → приход
  - Запись на Cash PL с выбранным направлением
  - /balance, /last, /direction, /help команды
  - Несколько пользователей
  - Авто-подстановка категории по правилам
  - UI настройки webhook в IntegrationsPage

## Ключевые API endpoints
- `POST /api/telegram/webhook` — Telegram webhook (публичный)
- `POST /api/telegram/setup-webhook` — Регистрация вебхука
- `GET /api/telegram/webhook-info` — Статус вебхука
- `GET /api/telegram/bot-users` — Подключённые пользователи
- `POST /api/cash-import/fetch` — Загрузка Google Таблицы
- `POST /api/cash-import/confirm` — Подтверждение импорта наличных

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
*Последнее обновление: 28.03.2026*
