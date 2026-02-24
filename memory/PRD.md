# WM Finance - PRD (Product Requirements Document)

## Оригинальная задача
Веб-приложение для финансового учёта малого бизнеса WM Finance. Бизнес по производству и продаже теплиц, саун и купелей в Польше. Валюты: PLN, EUR, USD.

## Архитектура
- **Backend**: FastAPI + MongoDB
- **Frontend**: React + shadcn/ui + Tailwind CSS
- **Auth**: JWT + bcrypt
- **AI**: Claude Sonnet 4.5 via Emergent LLM Key

## User Personas
1. **Владелец бизнеса** - полный доступ ко всем функциям
2. **Бухгалтер** - операции + аналитика
3. **Менеджер** - только операции

## Core Requirements (Static)
- Мультивалютность (PLN основная)
- Направления бизнеса: Теплицы, Сауны, Купели, Общее
- Импорт банковских выписок CSV/XLSX
- Платёжный календарь
- AI-ассистент для финансовых вопросов
- REST API для Telegram-бота

## What's Been Implemented

### Phase 1 MVP (Completed - Feb 24, 2026)

#### Backend (server.py)
- [x] JWT Authentication (register, login, /auth/me)
- [x] User seed data on registration
- [x] Accounts CRUD
- [x] Categories CRUD (income/expense)
- [x] Business Directions CRUD
- [x] Contractors CRUD
- [x] Transactions CRUD with filters
- [x] Planned Payments CRUD
- [x] Projects CRUD
- [x] Auto Rules CRUD
- [x] Analytics endpoints (summary, daily-balance, monthly)
- [x] Import CSV/XLSX with column mapping
- [x] Telegram Bot API endpoints (/api/bot/transaction, /api/bot/report)
- [x] AI Chat endpoint (/api/ai/chat)

#### Frontend
- [x] Login/Register page
- [x] Dashboard with metric cards and charts
- [x] Transactions page with filters and forms
- [x] Planned Payments page (list + calendar)
- [x] Projects page
- [x] Contractors page
- [x] Settings page (Accounts, Categories, Directions, Auto Rules, API)
- [x] Import page with column mapping
- [x] AI Chat component (floating button + drawer)
- [x] Sidebar navigation
- [x] Dark theme
- [x] Russian interface

## Prioritized Backlog

### P0 (Critical - Next)
- Аналитика: Cash Flow report
- Аналитика: P&L report
- Детальная рентабельность по направлениям

### P1 (High Priority)
- Уведомления (bell icon + просроченные платежи)
- Вебхуки исходящие при создании операций
- Начальные остатки счетов в настройках
- Связь плановых платежей с фактическими операциями

### P2 (Medium Priority)
- Автокатегоризация через AI при импорте
- Еженедельный дайджест от AI
- Горячие клавиши (N - новая операция, F - поиск)
- Баланс активов/пассивов

### P3 (Low Priority)
- Telegram интеграция (уведомления в бот)
- Экспорт данных
- Мобильная оптимизация
- Multi-language support (Polish/English)

## Next Tasks
1. Реализовать Cash Flow отчёт (/analytics/cashflow)
2. Реализовать P&L отчёт (/analytics/pnl)
3. Добавить уведомления о просроченных платежах
4. Настроить начальные остатки счетов
