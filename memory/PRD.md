# WM Finance - Product Requirements Document

## Обзор
WM Finance — веб-приложение для финансового учёта малого бизнеса. Компания занимается продажей и производством теплиц, саун и купелей в Польше. Работа ведётся в польских злотых (PLN) и евро (EUR).

**Брендинг:** Made by Knyazev

## Технологический стек
- **Frontend:** React 18, Tailwind CSS, Shadcn/UI, Recharts
- **Backend:** FastAPI, Python 3.11
- **Database:** MongoDB (via Motor)
- **Auth:** JWT tokens + Superadmin
- **AI:** Claude Sonnet 4.5 (Emergent LLM Key)
- **Integrations:** Telegram Bot, Adesk API

---

## Учётные данные

### Суперадмин
- **Логин:** admin
- **Пароль:** 220066mm

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

### Module 14 - Миграция из Adesk (ЗАВЕРШЕНО ✅)
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

### Интеграции (ЗАВЕРШЕНО ✅ 24.02.2026)
- [x] **Страница интеграций** `/settings/integrations`
- [x] **Telegram Bot настройки:**
  - Bot Token и Chat ID
  - Тест подключения
  - Автоматические сводки (расписание + время)
  - Отправка сводки вручную
- [x] **API для Telegram сводок:**
  - `GET /bot/summary` — сводка для бота
  - `POST /settings/telegram/send-summary` — отправка в Telegram

### Дополнительные функции (ЗАВЕРШЕНО ✅)
- [x] **Суперадмин** — вход по логину `admin` вместо email
- [x] **Виджет "Топ контрагентов"** на дашборде
- [x] **Правила автоматизации** — автокатегоризация при импорте
- [x] **Горячие клавиши** (N, D, F, /)
- [x] **AI Ассистент** — чат с Claude Sonnet 4.5
- [x] **FAQ страница** — подробная справка с чек-листом первоначальной настройки
- [x] **Брендинг "Made by Knyazev"** — логотип в правом нижнем углу

---

## API Endpoints

### Auth
- `POST /api/auth/register` — регистрация
- `POST /api/auth/login` — вход (поддерживает email и логин admin)

### Telegram Bot
- `GET /api/bot/summary?user_token=...&period=week` — финансовая сводка
- `POST /api/settings/telegram/test` — тест подключения
- `POST /api/settings/telegram/send-summary` — отправить сводку

### Settings
- `GET /api/settings/integrations` — получить настройки интеграций
- `PUT /api/settings/integrations/telegram` — обновить Telegram настройки

### Adesk Migration
- `POST /api/adesk/test-connection` — проверка токена
- `POST /api/adesk/start-migration` — загрузка в черновики
- `GET /api/adesk/drafts` — список черновиков
- `PUT /api/adesk/drafts/{id}` — редактирование
- `POST /api/adesk/drafts/bulk-update` — массовое обновление
- `POST /api/adesk/confirm-ready` — импорт готовых
- `GET /api/adesk/export-problems` — экспорт проблемных в CSV

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
| `/settings/integrations` | Интеграции (Telegram, уведомления) |
| `/settings/rules` | Автоправила |
| `/settings/adesk` | Миграция из Adesk |
| `/faq` | Справка и FAQ |

---

## Тестирование

### Результаты
- **Iteration 7:** Backend 100%, Frontend 100%
- Все функции протестированы

---

## БЭКЛОГ (Будущие задачи)

### P1 - Уведомления
- [ ] Push-уведомления о просроченных платежах
- [ ] Email-уведомления

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
│   ├── public/
│   │   ├── index.html     # Made by Knyazev badge
│   │   └── mk-logo.png    # Логотип MK
│   ├── src/
│   │   ├── pages/
│   │   │   ├── IntegrationsPage.jsx
│   │   │   ├── AdeskMigrationPage.jsx
│   │   │   ├── FAQPage.jsx
│   │   │   └── ...
│   │   └── components/
│   │       └── Layout.jsx    # Sidebar + Hotkeys
└── test_reports/
```

---

*Последнее обновление: 24.02.2026*
