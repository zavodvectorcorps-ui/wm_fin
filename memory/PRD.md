# WM Finance - Product Requirements Document

## Описание проекта
WM Finance — веб-приложение финансового учёта для польского бизнеса по производству и продаже теплиц, саун и купелей.

## Технический стек
- **Frontend:** React + Shadcn/UI + Tailwind CSS
- **Backend:** FastAPI (Python) — модульная архитектура
- **БД:** MongoDB
- **Интеграции:** Claude Sonnet 4.5 (AI), Telegram Bot, Google Sheets, Adesk API

## Архитектура (v2.3.0)
```
/app/backend/routes/
├── auth.py            # Вход, регистрация, управление пользователями
├── accounts.py        # CRUD счетов
├── categories.py      # CRUD категорий
├── contractors.py     # CRUD контрагентов
├── transactions.py    # CRUD операций
├── planned_payments.py # Плановые платежи
├── projects.py        # Проекты + правила автоматизации
├── documents.py       # Документы: загрузка, экспорт
├── analytics.py       # P&L, Cash Flow, Баланс, Расходы, Рентабельность
├── expense_plan.py    # План расходов
├── bank_import.py     # Импорт PDF выписок (парсинг PKO BP)
├── cash_import.py     # Импорт наличных из Google Sheets (NEW)
├── adesk.py           # Миграция из Adesk (архивная)
├── integrations.py    # Telegram настройки
├── ai.py              # AI-ассистент (Claude Sonnet 4.5)
├── bot.py             # Telegram бот
├── notifications.py   # Уведомления
├── faq.py             # FAQ

/app/frontend/src/
├── components/
│   ├── BankImportModal.jsx    # Модальное окно импорта PDF (+ авто-сохранение PDF в документы)
│   ├── CashImportModal.jsx    # Импорт наличных из Google Sheets (NEW)
│   ├── DescriptionAutocomplete.jsx
│   └── Layout.jsx             # Навигация (реструктурирована)
├── pages/
│   ├── DashboardPage.jsx      # Рабочий стол (мульти-выбор счетов)
│   ├── TransactionsPage.jsx   # Операции (сводка за период)
│   ├── ImportPage.jsx         # Импорт выписок (PDF + наличные)
│   └── ...
```

## Реализованные функции
- [x] Аутентификация с ролями
- [x] Мультивалютность (PLN, EUR, USD)
- [x] Управление счетами, категориями, направлениями, контрагентами
- [x] CRUD операций + CSV импорт
- [x] Плановые платежи
- [x] Документы (загрузка, привязка, экспорт ZIP)
- [x] Аналитика: P&L, Cash Flow, Баланс, Расходы, Рентабельность
- [x] AI-ассистент (Claude Sonnet 4.5)
- [x] Telegram Bot
- [x] Google Sheets автобэкап
- [x] Миграция из Adesk (архив)
- [x] FAQ, Тёмная/светлая тема
- [x] План расходов — CRUD, быстрое добавление, копирование, продление, экспорт CSV
- [x] Импорт PDF выписок — парсинг PKO BP, группировка, inline-ревью, дедупликация
- [x] Inline-редактирование при импорте — Direction/Category/Comment в строке таблицы
- [x] Мульти-выбор счетов на дашборде — checkbox для каждого счёта
- [x] Сводка за период — доходы/расходы/баланс на странице Операций
- [x] **Навигация реструктурирована** — Импорт выписок и Автоправила перенесены в раздел "Документы"
- [x] **Авто-сохранение PDF** — При импорте банковской выписки PDF автоматически сохраняется в Документы
- [x] **Импорт наличных из Google Sheets** — Загрузка данных из публичной Google Таблицы с выбором периода, inline-редактированием направления, дедупликацией, сохранением URL таблиц в настройках

## Ключевые API endpoints
- `POST /api/cash-import/fetch` — Загрузка и парсинг публичной Google Таблицы
- `POST /api/cash-import/confirm` — Подтверждение импорта наличных операций
- `GET /api/cash-import/settings` — Получение сохранённых URL таблиц
- `PUT /api/cash-import/settings` — Сохранение URL таблиц
- `POST /api/bank-import/parse` — Парсинг PDF выписки
- `POST /api/bank-import/confirm` — Подтверждение импорта банковских операций
- `POST /api/documents/upload` — Загрузка документа

## Предстоящие задачи

### P1 — Следующие
- [ ] Вебхуки и уведомления (отложено пользователем)
- [ ] Добавить вторую Google Таблицу для направления "Сауны"

### P2 — Бэклог
- [ ] Google Drive интеграция
- [ ] AI еженедельные дайджесты
- [ ] CORS мониторинг для кастомного домена
- [ ] Рефакторинг BankImportModal.jsx на подкомпоненты

## Учётные данные
- **Superadmin:** admin / 220066mm

---
*Последнее обновление: 28.03.2026*
