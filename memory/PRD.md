# WM Finance - Product Requirements Document

## Описание проекта
WM Finance — веб-приложение финансового учёта для польского бизнеса по производству и продаже теплиц, саун и купелей.

## Технический стек
- **Frontend:** React + Shadcn/UI + Tailwind CSS
- **Backend:** FastAPI (Python) — модульная архитектура
- **БД:** MongoDB
- **Интеграции:** Claude Sonnet 4.5 (AI), Telegram Bot, Google Sheets, Adesk API

## Архитектура (v2.2.0)
```
/app/backend/routes/
├── auth.py            # Вход, регистрация, управление пользователями
├── accounts.py        # CRUD счетов
├── categories.py      # CRUD категорий
├── contractors.py     # CRUD контрагентов
├── transactions.py    # CRUD операций, фильтр needs_review, description suggestions, toggle review
├── planned_payments.py # Плановые платежи
├── projects.py        # Проекты + правила автоматизации
├── documents.py       # Документы: загрузка, экспорт
├── analytics.py       # P&L, Cash Flow, Баланс, Расходы, Рентабельность
├── expense_plan.py    # План расходов (CRUD, копирование, продление, экспорт CSV)
├── bank_import.py     # Импорт PDF выписок (парсинг, группировка, авто-маппинг, правила категорий, комментарии)
├── adesk.py           # Миграция из Adesk (архивная)
├── integrations.py    # Telegram настройки
├── ai.py              # AI-ассистент (Claude Sonnet 4.5)
├── bot.py             # Telegram бот
├── notifications.py   # Уведомления
├── faq.py             # FAQ

/app/frontend/src/
├── components/
│   ├── BankImportModal.jsx    # Модальное окно импорта PDF (inline-редактирование, комментарии)
│   ├── DescriptionAutocomplete.jsx  # Автокомплит описаний операций
│   └── Layout.jsx             # Навигация
├── pages/
│   ├── DashboardPage.jsx      # Рабочий стол (мульти-выбор счетов, period selector fix)
│   ├── TransactionsPage.jsx   # Операции (сводка за период, Transfer button fix)
│   ├── ImportPage.jsx         # Импорт выписок (CSV/PDF)
│   ├── ExpensePlanPage.jsx    # План расходов
│   └── ...
```

## Реализованные функции
- [x] Аутентификация с ролями
- [x] Мультивалютность (PLN, EUR, USD)
- [x] Управление счетами, категориями, направлениями, контрагентами
- [x] CRUD операций + CSV импорт
- [x] Плановые платежи
- [x] Документы (загрузка, привязка к операциям, экспорт ZIP)
- [x] Аналитика: P&L, Cash Flow, Баланс, Расходы, Рентабельность
- [x] AI-ассистент (Claude Sonnet 4.5)
- [x] Telegram Bot
- [x] Google Sheets автобэкап
- [x] Миграция из Adesk (архив)
- [x] FAQ, Тёмная/светлая тема
- [x] **План расходов** — CRUD, быстрое добавление, копирование, продление, экспорт CSV
- [x] **Импорт PDF выписок** — парсинг PKO BP, группировка однотипных, inline-ревью, дедупликация
- [x] **Отметка "Под вопросом"** — needs_review flag при импорте и на странице операций
- [x] **Авто-создание контрагентов** из банковской выписки
- [x] **Правила контрагент→категория** — автоматическое подставление категории при повторном импорте
- [x] **Автокомплит описаний** — подсказки из истории операций при ручном вводе
- [x] **Inline-редактирование при импорте** — Direction/Category/Comment прямо в строке таблицы без кнопки-карандаша
- [x] **Мульти-выбор счетов на дашборде** — checkbox для каждого счёта, общий баланс пересчитывается
- [x] **Сводка за период** — на странице Операций сверху показываются доходы/расходы/баланс/кол-во
- [x] **Dark mode фиксы** — period selector на дашборде, кнопка Перевод на странице операций

## Коллекции MongoDB
- `transactions` — операции (+ поля `needs_review: bool`, `comment: str`)
- `contractors` — контрагенты (авто-создание из импорта)
- `contractor_category_rules` — маппинг контрагент→категория (user_id, contractor_name_upper, category_id)
- `expense_plans`, `expense_plan_items` — планы расходов
- `adesk_transactions` — архив Adesk

## Предстоящие задачи

### P1 — Следующие
- [ ] Вебхуки и уведомления (отложено пользователем)

### P2 — Бэклог
- [ ] Google Drive интеграция
- [ ] AI еженедельные дайджесты
- [ ] CORS мониторинг для кастомного домена
- [ ] Рефакторинг BankImportModal.jsx (700+ строк, можно разбить на подкомпоненты)

## Учётные данные
- **Superadmin:** admin / 220066mm
- **AI:** Emergent LLM Key (Claude Sonnet 4.5)

---
*Последнее обновление: 28.03.2026*
