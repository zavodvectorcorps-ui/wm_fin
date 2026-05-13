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
- [x] Mobile: хедер `bg-card` вместо прозрачного, сводка Операций `grid-cols-2` + `text-sm` на мобильном
- [x] Timezone fix: заменён `toISOString().split('T')[0]` на локальное форматирование дат (utils `todayLocal()` + `getPeriodDates` fmt) — исправлена ошибка "Текущий месяц показывает март вместо апреля" из-за UTC-сдвига
- [x] Мобильная главная страница: баланс + кнопки Доход/Расход/Перевод + последние 5 операций + форма в bottom sheet, после сохранения — возврат на ту же страницу
- [x] **Backup/Restore БД через UI**: вкладка "Бэкап" в Настройках, endpoints `GET /api/admin/db/export` (отдаёт tar.gz со всеми коллекциями) и `POST /api/admin/db/import` (восстанавливает), `GET /api/admin/db/stats` (превью). Только для superadmin. Файл: `/app/backend/routes/backup.py`, UI: `/app/frontend/src/pages/SettingsPage.jsx`.

## Workspace + Roles + Salaries v2 (05.05.2026)
- [x] **Multi-tenant Workspace**: одна общая база для команды. JWT теперь включает `workspace_id` (= owner's user_id) и `workspace_role`. `auth.get_current_user` транспарентно мапит `workspace_id → current_user["user_id"]` для всех существующих фильтров — миграция кода не требуется.
- [x] **Миграция legacy users**: на старте сервера (`migrate_users_to_workspaces`) для всех пользователей без `workspace_id` ставится `workspace_id = id, workspace_role = "owner"`. Идемпотентна.
- [x] **5 ролей**: `owner / admin / accountant / manager / viewer`. Backend middleware `enforce_workspace_role` блокирует записи: для accountant/viewer — все, для manager — `/api/admin/`, `/api/settings/`, `/api/integrations/`, `/api/backup/`, `/api/exchange-rate`, `/api/categories|directions|accounts|employees`, `/api/workspace/`.
- [x] **Frontend role-aware nav**: Layout сайдбар скрывает Аналитику для viewer, Настройки/Интеграции/Команду для не-admin, оставляя viewer'у только Дашборд.
- [x] **Workspace API** (`/app/backend/routes/workspace.py`):
  - `GET /api/workspace/info` — данные workspace + ваша роль
  - `GET /api/workspace/members` — список участников
  - `PUT /api/workspace/members/{id}/role` — сменить роль (owner/admin only)
  - `DELETE /api/workspace/members/{id}` — удалить участника
  - `GET /api/workspace/invites` — список приглашений
  - `POST /api/workspace/invites` — создать (генерирует one-time token TTL 7 дней)
  - `DELETE /api/workspace/invites/{id}` — отозвать
  - `GET /api/auth/invite-info/{token}` — public, инфо до принятия
  - `POST /api/auth/accept-invite` — public, создаёт юзера + возвращает auth-токен
- [x] **Frontend pages**:
  - `/team` (`TeamPage.jsx`) — управление командой, копируемые invite-ссылки
  - `/invite/:token` (`InviteAcceptPage.jsx`) — публичная форма принятия приглашения

### Зарплаты v2 (05.05.2026)
- [x] **Employee**: добавлены `default_bonus` и `default_tax_rate` (% от оклад+премия). Подставляются автоматически в новые начисления.
- [x] **SalaryAccrual**: добавлено поле `taxes` (отдельно от `deductions`). Формула: `total_due = salary + bonus − taxes − deductions`.
- [x] **UI**: в форме сотрудника добавлены поля «Базовая премия» и «Налоги по умолчанию, %». В форме начисления — отдельное поле «Налоги» с авто-подстановкой при выборе сотрудника.
- [x] Тест: Менеджер с `salary=5000, bonus=1000, tax_rate=20%` → начисление автоматически рассчитывает `taxes=1200, total_due=4700`.

## Read-Only Demo Account (03.05.2026)
- [x] **Бэкенд**: `POST /api/auth/demo-login` (`/app/backend/routes/demo.py`) — создаёт демо-пользователя `demo-user-readonly` с фейковыми данными (3 направления, 3 счёта, 11 категорий, 5 контрагентов, 3 сотрудника, ~180 транзакций за 90 дней, регулярные расходы, начисления зарплат), возвращает JWT с `role=demo`. Идемпотентен — данные сидируются один раз.
- [x] **Middleware**: `block_writes_for_demo_users` в `server.py` — блокирует POST/PUT/PATCH/DELETE с 403 для пользователей роли `demo`, кроме `/api/auth/demo-login` и `/api/auth/logout`.
- [x] **Фронт**: `loginAsDemo()` + `isDemo` флаг в `AuthContext.js`, кнопка «Войти в демо» в `DemoPage.jsx` теперь автологинит и редиректит на `/dashboard`.
- [x] **UI индикаторы**: жёлтый sticky-баннер сверху на всех страницах для роли `demo` с кнопкой «Выйти из демо», бейдж `DEMO` в сайдбаре у имени пользователя, отдельный пункт «Выйти из демо» в выпадающем меню. Глобальный axios-перехватчик 403 показывает тост «Демо-режим: изменения запрещены».

## Google Drive OAuth 2.0 миграция (04.05.2026)
- [x] **Проблема**: Сервисные аккаунты Google с 2022 не имеют квоты хранилища — все бэкапы падали с `storageQuotaExceeded`.
- [x] **Решение**: Полная миграция бэкапа Drive с Service Account на OAuth 2.0 (scope `drive.file`). Новый файл: `/app/backend/routes/google_oauth.py`.
- [x] **Backend endpoints**:
  - `PUT /api/settings/google-oauth/config` — сохранить Client ID / Client Secret
  - `POST /api/settings/google-oauth/start` — вернуть Google auth URL с JWT-state (включает user_id + redirect_uri, TTL 15 мин)
  - `GET /api/settings/google-oauth/callback` — публичный, обменивает code на refresh_token, сохраняет email пользователя через Drive About API, редиректит на фронт с `?drive_connected=1` или `?drive_error=...`
  - `GET /api/settings/google-oauth/status` — статус подключения
  - `POST /api/settings/google-oauth/disconnect` — удаляет токены
- [x] **`services/google_drive_backup.py`**: `_get_drive_service(settings)` теперь строит клиент из refresh_token + client_id/secret, автоматически обновляет access_token. Scheduler дергает `google_drive_refresh_token` вместо `google_service_account`.
- [x] **Frontend**: новая карточка `GoogleDriveOAuthCard` в `IntegrationsPage.jsx` — статус-бейджи, инструкция с подсвеченным redirect_uri + Copy, поля Client ID/Secret, кнопки «Подключить» / «Отключить», обработка query-параметров `drive_connected` / `drive_error`.

## Массовое удаление операций (12.05.2026)
- [x] **Backend**: `POST /api/transactions/bulk-delete` (`/app/backend/routes/transactions.py`) — принимает `{"ids": [...]}`, ограничение 500 за раз, валидирует принадлежность к workspace через `user_id`, удаляет `delete_many` и пересчитывает балансы всех затронутых счетов через `update_account_balance`. Edge cases: пустой массив → 400 «Передайте массив ids»; несуществующие id → `{deleted: 0}`; без авторизации → 403.
- [x] **Frontend** (`TransactionsPage.jsx`): чекбокс в каждой строке (`row-checkbox-{id}`), select-all в шапке таблицы (`select-all-checkbox`), sticky Bulk Action Bar при `selectedIds.size > 0` со счётчиком и кнопкой «Удалить выделенные» (`bulk-delete-btn`) + спиннер; подтверждение через `window.confirm`; сохранение скролла после удаления; подсветка выделенных строк `bg-primary/5`.
- [x] **Тестирование (12.05.2026)**: curl-тест — 3 операции по 100 PLN → баланс 5448→5748→5448 (пересчёт корректен); UI screenshot подтверждает рендер Bulk Bar при 2 и 5 (select-all) выделенных операциях.

## Массовое изменение Статьи / Направления (12.05.2026)
- [x] **Backend**: `POST /api/transactions/bulk-update` (`/app/backend/routes/transactions.py`) — принимает `{"ids": [...], "category_id"?: "...", "direction_id"?: "..."}`, обязательно ≥1 поле, лимит 500. Валидирует, что category/direction принадлежат workspace (`user_id`). Обновляет через `update_many` с denormalized `category_name`. Не пересчитывает балансы (статья/направление не влияют на баланс).
- [x] **Frontend** (`TransactionsPage.jsx`): в Bulk Action Bar добавлены два `Select`-а: «Сменить статью...» (`bulk-category-select`, опции с бейджем `+/−/↔` по типу) и «Сменить направление...» (`bulk-direction-select`). Хендлер `handleBulkUpdate({category_id?, direction_id?})` шлёт запрос, показывает спиннер, тост «Обновлено: N», сбрасывает выделение и сохраняет скролл.
- [x] **Тестирование (12.05.2026)**: curl-тест — обновление category+direction одновременно на 2 операциях → `{matched:2, modified:2}` + denormalized `category_name` обновился. Edge cases: без полей → 400, бад id → 404. UI: screenshot подтвердил применение «Доплата по заказу» к 3 выделенным строкам с тостом «Обновлено: 3».

## Cross-currency Transfer — ручной курс/сумма (13.05.2026)
- [x] **Проблема**: при переводе между счетами в разных валютах (PLN→EUR и т.п.) до сих пор использовался только автоматический NBP-курс; реальный курс банка отличался → расхождение балансов. **Был баг направления курса**: EUR→PLN с ручным курсом считал неправильно.
- [x] **Backend** (`/app/backend/routes/transactions.py`, `/app/backend/models.py`): в `TransactionCreate` добавлено `to_amount`. В create/update: если `to_amount > 0` И валюты source/target различаются — `to_amount_base = to_amount`, `exchange_rate = round(to_amount / amount, 6)` (target units per 1 source unit, работает в обе стороны). Иначе — fallback на `calc_amount_base` (NBP/manual rate).
- [x] **Frontend** (`TransactionsPage.jsx`): amber-блок с двумя связанными полями: «Сумма к получению (TO_CUR)» (`form-to-amount`) и «Курс (1 FROM_CUR = X TO_CUR)» (`form-manual-rate`). Конвенция `to_amount = amount × rate`.
- [x] **Тестирование (13.05.2026)**: PLN→EUR (1000→230 EUR) → rate 0.23 ✅; EUR→PLN (230 EUR→1000.5 PLN) → rate 4.35 ✅; редактирование без `to_amount` → авто NBP.

## Архитектура: займы как отдельный тип счёта (13.05.2026)
- [x] **Модель**: в `Account` и `AccountCreate` добавлено поле `is_loan: bool = False`.
- [x] **Backend** `/api/transactions`: возвращает `loans_summary` (received_base, repaid_base, accounts) — отдельный блок по займам. Операции на loan-счетах исключаются из основного `summary` (Доходы/Расходы).
- [x] **Backend** аналитика: эндпоинты `/api/analytics/summary`, `/pnl`, `/cashflow` фильтруют loan-операции через helpers `_get_loan_account_ids` + `_not_loan_op` в `analytics.py`. Это устраняет раздутый оборот PnL/CashFlow от движения по займам.
- [x] **Frontend Settings** (`SettingsPage.jsx`): в форме счёта чекбокс «Заёмные средства (займ / кредит)» с пояснением.
- [x] **Frontend Transactions** (`TransactionsPage.jsx`): компонент `LoansSummary` — 4 карточки (Получено / Погашено / Чистое изменение долга / Остаток долга) + список loan-счетов.
- [x] **Тестирование (13.05.2026)**: seed loan-account + 10000 income + 3000 expense + 2500 regular income → main summary показал только 2500 PLN, loans block — received 10000, repaid 3000, net +7000, остаток 7000 PLN. Скриншот UI подтвердил рендер.

## Динамика чистого капитала + сохранение фильтров (13.05.2026)
- [x] **Backend**: `GET /api/analytics/net-worth-history?months=N` (`analytics.py`) — реплеит транзакции по каждому счёту с initial_balance до конца каждого месяца, конвертирует EUR в PLN (NBP), возвращает `[{month, assets, loans, net_worth}]`.
- [x] **Frontend** (`BalancePage.jsx`): новая карточка «Динамика чистого капитала» с `AreaChart` (recharts) — 12 месяцев, 3 серии: Активы (синяя), Займы (амбер), Чистый капитал = активы − займы (зелёная, ярче). Tooltip с форматированием валюты.
- [x] **Frontend** (`TransactionsPage.jsx`): фильтры (`filters`), номер страницы (`page`) и позиция скролла (`scrollY`) сохраняются в `sessionStorage` (`wm:transactions:state`). При уходе на другую страницу (например, в Настройки добавить категорию) и возврате — состояние восстанавливается. Используются refs (`isFirstRender`, `filtersInitDone`) чтобы не сбрасывать `page` при первоначальном восстановлении.
- [x] **Тестирование (13.05.2026)**: backend curl — net-worth-history с 6 месяцев вернул корректные значения. UI: ввели «тест-persist» в поиск, перешли в Settings, вернулись — поиск сохранился ✅. Скриншот подтвердил рендер графика на /analytics/balance.

## Bugfix: «Итого в PLN» теперь корректно конвертирует EUR (13.05.2026)
- [x] **Проблема**: строка «Итого в PLN (EUR × X)» внизу сводки на странице Операций просто складывала `income_base_EUR + income_base_PLN` без умножения на курс. Например, `71722 €` + `39252 zł` отображалось как `110 974 zł` вместо `~344 244 zł`.
- [x] **Frontend** (`TransactionsPage.jsx`, компонент `PeriodSummary`): EUR-суммы теперь умножаются на `eurPlnRate` перед сложением. `totalIncomePln = inc_EUR × rate + inc_PLN`.
- [x] **Backend** (`routes/transactions.py`): `loans_summary` теперь возвращает `received_by_cur` и `repaid_by_cur` (разбивка по валютам), `LoansSummary` на фронте конвертирует EUR через `eurPlnRate` перед суммированием.
- [x] **Тестирование**: создал 1000 EUR + 500 PLN income → отображается «Итого: +4752,40 zł» (= 1000 × 4.2524 + 500) ✅.

## Bugfix: семантика «Займов» + per-currency отображение (13.05.2026)
- [x] **Проблема 1**: метки `Получено` / `Погашено` были перевёрнуты. По модели пользователя получение займа = перевод ИЗ счёта-займа на bank-account (Аликор → PKO PLN). Логика бэкенда же считала это `Погашено`.
- [x] **Проблема 2**: EUR-суммы в блоке Займов выводились слитной PLN-цифрой без указания валюты, и при отсутствии конверсии получалось `-80 000 zł` вместо `-80 000 €`.
- [x] **Backend** (`routes/transactions.py`): пайплайны переименованы и поменяны местами — `received_pipeline` теперь `account_id IN loans AND type=transfer` (перевод ИЗ займа = получение), `repaid_pipeline` теперь `to_account_id IN loans AND type=transfer` (перевод НА займ = погашение). Группировка по `$currency` сохранена.
- [x] **Frontend** (`LoansSummary`): обе карточки «Получено» и «Погашено» рендерят `MultiCurrencyValue` — отдельная строка на каждую валюту (например: «+50 000 zł / +30 000 €»). «Чистое изменение долга» по-прежнему сводится в PLN-эквивалент с подписью «долг вырос / уменьшился».
- [x] **Тестирование (13.05.2026)**: создано 30000€ + 50000zł получения + 10000zł погашения → loans block отобразил «+50 000 zł / +30 000 €» (2 опер) / «−10 000 zł» (1 опер) / Чистое изменение «+167 572 zł долг вырос» / остаток «−30 000 € / −40 000 zł» ✅. Скриншот UI подтвердил.

## Карточка «Денег на счетах» + подсказка для переводов (13.05.2026)
- [x] **Backend** (`routes/transactions.py`): `/api/transactions` теперь возвращает `cash_summary` — сумма `current_balance` по всем не-loan счетам, сгруппированная по валютам. Это **деньги, доступные сейчас** (включая уже полученные заёмные средства).
- [x] **Frontend** (`TransactionsPage.jsx`): новый компонент `CashOnHand` (sky-голубая карточка) рендерится между основной сводкой и блоком Займов. Показывает остатки по каждой валюте + «Итого в PLN (EUR × rate)».
- [x] **Frontend** подсказка-tooltip в диалоге **Перевод** (`transfer-hint`, blue-info): отображается, когда выбраны оба счёта. Контекстный текст по 4 сценариям:
   1. Перевод из loan → asset: «Получение займа: ... уйдёт в минус, на ... прилетят деньги. Это НЕ доход.»
   2. Перевод из asset → loan: «Погашение займа: ... уменьшится, на ... долг сократится. Это НЕ расход.»
   3. Cross-currency (asset↔asset): «Обмен валюты: со ... спишется CUR1, на ... прилетит CUR2. Это НЕ доход и НЕ расход.»
   4. Обычный перевод: «Перевод между своими счетами: списание + зачисление. Это НЕ доход и НЕ расход.»
- [x] **Тестирование (13.05.2026)**: curl `cash_summary` → корректные суммы по валютам. UI screenshot: подсказка появилась при выборе Cash PL → mBank EUR с правильным текстом «Обмен валюты»; карточка «Денег на счетах» отобразила Остаток PLN 5448 zł + Итого в PLN 5448 zł.

## Период-end версия Cash card: начало / конец / Δ (13.05.2026)
- [x] **Backend** (`routes/transactions.py`): когда применён `date_from` или `date_to`, `cash_summary` дополнительно возвращает `period_start_by_currency`, `period_end_by_currency`, `period_start_date`, `period_end_date`. Внутренний helper `_balances_at(cutoff_date)` реплеит транзакции каждого asset-счёта с `initial_balance` до cutoff (end-of-day) — учитывает income/expense/transfer (включая `to_amount_base`).
- [x] **Frontend** (`CashOnHand` в `TransactionsPage.jsx`): под текущими остатками появляется подзаголовок «Движение средств за выбранный период (PLN-эквивалент)» с тремя карточками — «На начало периода» / «На конец периода» / «Изменение» (со стрелкой ↗/↘, цвет emerald/rose). EUR конвертируется через текущий `eurPlnRate`.
- [x] **Тестирование (13.05.2026)**: создал в мае +2000 income и −300 expense → period_start=5448, period_end=7148, Δ=+1700 zł. UI screenshot подтвердил: «На начало 5448 zł», «На конец 7148 zł», «↗ +1700 zł» зелёным.

## Bulk: применить авто-правила к выделенным (13.05.2026)
- [x] **Backend** `POST /api/transactions/bulk-apply-rules` (`routes/transactions.py`): принимает `{ids: [...], overwrite: bool}`. Загружает активные `auto_rules` пользователя, прелоадит category/direction lookup, итерирует выделенные транзакции, ищет `rule.pattern in description` (case-insensitive). Если `overwrite=false` — обновляет только пустые `category_id` / `direction_id`. Если `overwrite=true` — перезаписывает. Возвращает `{matched, updated, skipped, no_match}`.
- [x] **Frontend** (`TransactionsPage.jsx`): новая кнопка `bulk-apply-rules-btn` в Bulk Action Bar (между «Сменить направление…» и «Удалить выделенные»). Иконка Bot. По клику показывается `window.confirm` с пояснением «заполнятся только пустые поля». Хендлер `handleBulkApplyRules(overwrite)` шлёт запрос, показывает тост `Обновлено: N · без совпадений: M · пропущено: K`, сбрасывает выделение, сохраняет скролл.
- [x] **Тестирование (13.05.2026)**: создал правило `pattern="ALICOR" → Cat+Sauny`, 2 транзакции (одна с "ALICOR", одна нет, обе без категории). Первый вызов: updated=1, no_match=1. Повтор без overwrite: updated=0, skipped=1, no_match=1. С overwrite=true: direction также обновился до Sauny ✅. UI screenshot подтвердил рендер кнопки.

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
- **Demo (read-only):** автологин через `POST /api/auth/demo-login` (без пароля)
- **Workspace invite**: создаётся в `/team` UI владельцем/админом, выдаётся ссылка `/invite/{token}` с TTL 7 дней

---
*Последнее обновление: 12.05.2026*
