# WM Finance - PRD (Product Requirements Document)

## Оригинальная задача
Веб-приложение для финансового учёта малого бизнеса WM Finance. Бизнес по производству и продаже теплиц, саун и купелей в Польше. Валюты: PLN, EUR, USD.

## Архитектура
- **Backend**: FastAPI + MongoDB
- **Frontend**: React + shadcn/ui + Tailwind CSS + Recharts
- **Auth**: JWT + bcrypt (30 дней)
- **AI**: Claude Sonnet 4.5 via Emergent LLM Key
- **Storage**: Local filesystem (/app/backend/uploads)

## User Personas
1. **Владелец бизнеса** - полный доступ ко всем функциям
2. **Бухгалтер** - операции + аналитика + документы
3. **Менеджер** - только операции

## Core Requirements (Static)
- Мультивалютность (PLN основная)
- Направления бизнеса: Теплицы, Сауны, Купели, Общее
- Импорт банковских выписок CSV/XLSX
- Платёжный календарь
- AI-ассистент для финансовых вопросов
- REST API для Telegram-бота
- Документооборот с экспортом

## What's Been Implemented

### Phase 1 MVP (Completed - Feb 24, 2026)
- [x] JWT Authentication
- [x] User seed data on registration
- [x] Accounts, Categories, Directions, Contractors CRUD
- [x] Transactions CRUD with filters
- [x] Planned Payments CRUD
- [x] Projects CRUD
- [x] Auto Rules CRUD
- [x] Analytics endpoints (summary, daily-balance, monthly)
- [x] Import CSV/XLSX
- [x] Telegram Bot API endpoints
- [x] AI Chat endpoint
- [x] Dashboard with charts
- [x] Dark theme, Russian interface

### Phase 1.5 Improvements (Completed - Feb 24, 2026)
- [x] **МОДУЛЬ 13 — Документооборот**
  - Document model and CRUD endpoints
  - File upload (PDF, PNG, JPG, XLSX)
  - Document preview
  - Status: linked/pending
  - Export ZIP with folder structure
  - Documents page with filters and drag&drop
  - "Требуют обработки" section
- [x] **Cash Flow отчёт** (/analytics/cashflow)
  - График по месяцам
  - Детализированная таблица
- [x] **P&L отчёт** (/analytics/pnl)
  - Структура доходов/расходов по группам
  - Расчёт рентабельности
- [x] **Система уведомлений**
  - Просроченные платежи
  - Документы без привязки
  - Отрицательный баланс
- [x] **Улучшения UX**
  - Auth interceptor для 401 ошибок
  - Sidebar с "Документы"

## Prioritized Backlog

### P0 (Critical - Next)
- Баланс активов/пассивов
- Рентабельность по направлениям (детальный)
- Google Drive интеграция для документов

### P1 (High Priority)
- Email-шлюз для входящих документов
- OCR распознавание из PDF
- Связь плановых платежей с фактическими операциями
- Вебхуки исходящие при создании операций

### P2 (Medium Priority)
- Автокатегоризация через AI при импорте
- Еженедельный дайджест от AI
- Горячие клавиши (N - новая операция, F - поиск)
- Telegram-бот: пересылка документов

### P3 (Low Priority)
- Multi-language support (Polish/English)
- Мобильная PWA версия
- S3 storage для документов
- Экспорт данных в Excel

## API Endpoints

### Auth
- POST /api/auth/register
- POST /api/auth/login
- GET /api/auth/me

### Documents (NEW)
- GET /api/documents
- GET /api/documents/pending
- POST /api/documents/upload
- GET /api/documents/file/{filename}
- PUT /api/documents/{id}
- DELETE /api/documents/{id}
- GET /api/documents/export?period=YYYY-MM

### Analytics (UPDATED)
- GET /api/analytics/summary
- GET /api/analytics/daily-balance
- GET /api/analytics/monthly
- GET /api/analytics/cashflow?year=YYYY
- GET /api/analytics/pnl?date_from=&date_to=

### Notifications (NEW)
- GET /api/notifications
- PUT /api/notifications/{id}/read

### Core
- CRUD: /api/accounts, /api/categories, /api/directions
- CRUD: /api/contractors, /api/transactions, /api/planned-payments
- CRUD: /api/projects, /api/auto-rules

### Bot
- POST /api/bot/transaction
- GET /api/bot/report

### AI
- POST /api/ai/chat

## Next Tasks
1. Реализовать Google Drive интеграцию
2. Добавить OCR для распознавания документов
3. Детальный отчёт рентабельности по направлениям
