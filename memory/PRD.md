# WM Finance - Product Requirements Document

## Обзор
WM Finance — веб-приложение для финансового учёта малого бизнеса. Компания занимается продажей и производством теплиц, саун и купелей в Польше. Работа ведётся в польских злотых (PLN) и евро (EUR).

## Технологический стек
- **Frontend:** React 18, Tailwind CSS, Shadcn/UI, Recharts
- **Backend:** FastAPI, Python 3.11
- **Database:** MongoDB (via Motor)
- **Auth:** JWT tokens
- **AI:** Claude Sonnet 4.5 (Emergent LLM Key)

---

## РЕАЛИЗОВАННЫЕ ФУНКЦИИ

### Phase 1 - MVP (ЗАВЕРШЕНО)
- [x] Авторизация (регистрация, вход, JWT)
- [x] Управление счетами (CRUD)
- [x] Категории доходов/расходов
- [x] Направления бизнеса (Теплицы, Сауны, Купели)
- [x] Контрагенты
- [x] Транзакции (ручной ввод, фильтрация)
- [x] Дашборд с метриками
- [x] Импорт CSV с маппингом
- [x] Платёжный календарь

### Phase 2 - Аналитика (ЗАВЕРШЕНО ✅ 24.02.2026)
- [x] **Движение денег (Cash Flow)** — `/analytics/cashflow`
- [x] **Прибыли и убытки (P&L)** — `/analytics/pnl`
- [x] **Баланс (Balance Sheet)** — `/analytics/balance`
  - Активы по типам счетов
  - Обязательства (запланированные расходы)
  - Дебиторка (ожидаемые поступления)
  - Чистый капитал
  - Распределение по валютам
- [x] **Анализ расходов** — `/analytics/expenses`
  - Динамика расходов
  - По категориям (круговая диаграмма)
  - По направлениям
  - Топ контрагентов по расходам
- [x] **Рентабельность** — `/analytics/profitability`
  - Доходы vs Расходы по направлениям
  - Прибыль по направлениям
  - Маржинальность
  - Детальная таблица

### Phase 2 - Дополнительные функции (ЗАВЕРШЕНО ✅)
- [x] **Виджет "Топ контрагентов"** на дашборде
- [x] **Правила автоматизации** — `/settings/rules`
  - Создание правил по шаблонам
  - Автоприсвоение категории/направления/контрагента
- [x] **Связь документов с транзакциями**
  - Прикрепление/открепление через меню операции
- [x] **Горячие клавиши**
  - `N` — новая транзакция
  - `D` — дашборд
  - `F` или `/` — фокус на поиск

### Module 13 - Документооборот (ЗАВЕРШЕНО ✅)
- [x] Загрузка документов (drag-and-drop)
- [x] Фильтрация по типу и периоду
- [x] Экспорт архивом ZIP
- [x] Привязка к транзакциям

### AI-функции (РЕАЛИЗОВАНО ✅)
- [x] **AI Ассистент** — кнопка чата справа внизу
  - Интеграция с Claude Sonnet 4.5
  - Контекстные ответы по финансовым данным
  - Очистка истории

---

## API Endpoints

### Auth
- `POST /api/auth/register` — регистрация
- `POST /api/auth/login` — вход

### Data Models
- `/api/accounts` — счета (CRUD)
- `/api/categories` — категории
- `/api/directions` — направления
- `/api/contractors` — контрагенты
- `/api/transactions` — операции
- `/api/planned-payments` — плановые платежи
- `/api/projects` — проекты
- `/api/documents` — документы
- `/api/auto-rules` — правила автоматизации

### Analytics
- `/api/analytics/summary` — сводка
- `/api/analytics/daily-balance` — баланс по дням
- `/api/analytics/cashflow` — движение денег
- `/api/analytics/pnl` — прибыли и убытки
- `/api/analytics/balance` — баланс (активы/пассивы)
- `/api/analytics/expense-analysis` — анализ расходов
- `/api/analytics/profitability` — рентабельность
- `/api/analytics/top-contractors` — топ контрагентов

### AI & Bot
- `POST /api/ai/chat` — AI чат
- `POST /api/bot/transaction` — Telegram бот (создание)
- `GET /api/bot/report` — Telegram бот (отчёт)

### Documents
- `POST /api/documents/upload` — загрузка
- `GET /api/documents` — список
- `POST /api/documents/{id}/link-transaction` — привязка к транзакции
- `DELETE /api/documents/{id}/unlink` — отвязка
- `GET /api/transactions/{id}/documents` — документы транзакции

---

## БЭКЛОГ (P1-P2)

### P1 - Telegram Bot
- [ ] Полноценный Telegram бот для быстрого ввода операций
- [ ] Получение отчётов в Telegram

### P1 - Уведомления
- [ ] Система уведомлений (просроченные платежи, низкий баланс)
- [ ] Push-уведомления

### P2 - Интеграции
- [ ] Google Drive для хранения документов
- [ ] Банковская интеграция (API)
- [ ] Webhooks при создании транзакций

### P2 - Расширенный AI
- [ ] Еженедельные AI-дайджесты
- [ ] Автоматическая категоризация с ML
- [ ] Прогнозы денежного потока

---

## Тестирование

### Тестовые данные
- **Email:** test@wmfinance.pl
- **Password:** test123

### Результаты тестов
- **Iteration 5:** Backend 100%, Frontend 100%
- Все P0/P1 функции протестированы и работают

---

## Ключевые файлы
- `/app/backend/server.py` — все API
- `/app/frontend/src/App.js` — роутинг
- `/app/frontend/src/components/Layout.jsx` — layout + hotkeys
- `/app/frontend/src/pages/` — все страницы

---

*Последнее обновление: 24.02.2026*
