# WM Finance - Product Requirements Document

## Обзор
WM Finance — веб-приложение для финансового учёта малого бизнеса. Компания занимается продажей и производством теплиц, саун и купелей в Польше. Работа ведётся в польских злотых (PLN) и евро (EUR).

## Технологический стек
- **Frontend:** React 18, Tailwind CSS, Shadcn/UI, Recharts
- **Backend:** FastAPI, Python 3.11
- **Database:** MongoDB (via Motor)
- **Auth:** JWT tokens + Superadmin
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

### Phase 2 - Аналитика (ЗАВЕРШЕНО ✅)
- [x] Движение денег (Cash Flow)
- [x] Прибыли и убытки (P&L)
- [x] Баланс (активы, обязательства, дебиторка)
- [x] Анализ расходов (по категориям, направлениям)
- [x] Рентабельность по направлениям

### Module 13 - Документооборот (ЗАВЕРШЕНО ✅)
- [x] Загрузка документов (drag-and-drop)
- [x] Привязка документов к транзакциям
- [x] Экспорт архивом ZIP

### Module 14 - Миграция из Adesk (ЗАВЕРШЕНО ✅ 24.02.2026)
- [x] Страница подключения `/settings/adesk`
- [x] Ввод API-токена и проверка подключения
- [x] Загрузка данных в черновики (staging)
- [x] Умный маппинг (проекты → направления, статьи → категории)
- [x] Редактирование черновиков (inline + dialog)
- [x] Массовые операции (выбрать несколько → назначить)
- [x] Панель прогресса (✅ Готово / ⚠️ Проверки / ❌ Ошибки)
- [x] Подтверждение и импорт готовых операций
- [x] Защита от дублей
- [x] Экспорт проблемных в CSV

### Дополнительные функции (ЗАВЕРШЕНО ✅)
- [x] **Суперадмин** — вход по логину `admin` вместо email
- [x] **Telegram Bot Summary** — API для получения сводок
- [x] **Виджет "Топ контрагентов"** на дашборде
- [x] **Правила автоматизации** — автокатегоризация при импорте
- [x] **Горячие клавиши** (N, D, F, /)
- [x] **AI Ассистент** — чат с Claude Sonnet 4.5
- [x] **FAQ страница** — подробная справка по всем разделам

---

## Учётные данные

### Суперадмин
- **Логин:** admin
- **Пароль:** 220066mm

### Тестовый пользователь
- **Email:** test@wmfinance.pl
- **Пароль:** test123

---

## API Endpoints

### Auth
- `POST /api/auth/register` — регистрация
- `POST /api/auth/login` — вход (поддерживает email и логин admin)

### Telegram Bot
- `GET /api/bot/summary?user_token=...&period=week` — финансовая сводка
  - period: day | week | month
  - Возвращает форматированное сообщение в Markdown

### Adesk Migration
- `POST /api/adesk/test-connection` — проверка токена
- `POST /api/adesk/start-migration` — загрузка в черновики
- `GET /api/adesk/drafts` — список черновиков
- `PUT /api/adesk/drafts/{id}` — редактирование
- `POST /api/adesk/drafts/bulk-update` — массовое обновление
- `POST /api/adesk/confirm-ready` — импорт готовых
- `GET /api/adesk/export-problems` — экспорт проблемных в CSV

### Analytics
- `/api/analytics/summary`
- `/api/analytics/daily-balance`
- `/api/analytics/cashflow`
- `/api/analytics/pnl`
- `/api/analytics/balance`
- `/api/analytics/expense-analysis`
- `/api/analytics/profitability`
- `/api/analytics/top-contractors`

---

## Страницы приложения

| Route | Описание |
|-------|----------|
| `/` | Рабочий стол (Dashboard) |
| `/transactions` | Операции |
| `/documents` | Документы |
| `/projects` | Проекты |
| `/contractors` | Контрагенты |
| `/analytics/cashflow` | Движение денег |
| `/analytics/pnl` | Прибыли и убытки |
| `/analytics/balance` | Баланс |
| `/analytics/expenses` | Анализ расходов |
| `/analytics/profitability` | Рентабельность |
| `/planning/calendar` | Платёжный календарь |
| `/import` | Импорт выписок |
| `/settings` | Настройки |
| `/settings/rules` | Автоправила |
| `/settings/adesk` | Миграция из Adesk |
| `/faq` | Справка и FAQ |

---

## Тестирование

### Результаты
- **Iteration 6:** Backend 100%, Frontend 100%
- Все функции протестированы

### Тестовые файлы
- `/app/test_reports/iteration_6.json`

---

## БЭКЛОГ (Будущие задачи)

### P1 - Уведомления
- [ ] Push-уведомления о просроченных платежах
- [ ] Уведомления о низком балансе

### P2 - Интеграции
- [ ] Google Drive для документов
- [ ] Банковская интеграция (API)
- [ ] Webhooks

### P2 - Расширенный AI
- [ ] Еженедельные AI-дайджесты по email
- [ ] Прогнозы денежного потока

---

## Ключевые файлы

```
/app/
├── backend/
│   ├── .env
│   ├── requirements.txt
│   └── server.py          # Все API endpoints
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── AdeskMigrationPage.jsx
│   │   │   ├── FAQPage.jsx
│   │   │   ├── BalancePage.jsx
│   │   │   ├── ExpenseAnalysisPage.jsx
│   │   │   └── ProfitabilityPage.jsx
│   │   └── components/
│   │       ├── Layout.jsx    # Sidebar + Hotkeys
│   │       └── AIChat.jsx
└── test_reports/
```

---

*Последнее обновление: 24.02.2026*
