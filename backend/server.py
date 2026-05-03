from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from datetime import datetime, timezone
import os
import logging
from dotenv import load_dotenv
from pathlib import Path

# Load env
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Import database client for lifecycle management
from database import client

# Import all route modules
from routes.auth import router as auth_router
from routes.accounts import router as accounts_router
from routes.categories import router as categories_router
from routes.directions import router as directions_router
from routes.contractors import router as contractors_router
from routes.transactions import router as transactions_router
from routes.planned_payments import router as planned_payments_router
from routes.projects import router as projects_router
from routes.documents import router as documents_router
from routes.notifications import router as notifications_router
from routes.analytics import router as analytics_router
from routes.adesk import router as adesk_router
from routes.integrations import router as integrations_router
from routes.ai import router as ai_router
from routes.bot import router as bot_router
from routes.expense_plan import router as expense_plan_router
from routes.bank_import import router as bank_import_router
from routes.cash_import import router as cash_import_router
from routes.telegram_webhook import router as telegram_webhook_router
from routes.exchange_rate import router as exchange_rate_router
from routes.backup import router as backup_router
from routes.recurring import router as recurring_router
from routes.salaries import router as salaries_router
from routes.drive_backup import router as drive_backup_router
from routes.demo import router as demo_router, is_demo_user_from_token, DEMO_WRITE_ALLOWLIST

# Import service routers
from services.google_sheets import router as google_sheets_router

# Create FastAPI app
app = FastAPI(title="WM Finance API", version="2.0.0")

# CORS
cors_origins = os.environ.get("CORS_ORIGINS", "*")
if cors_origins == "*":
    origins = ["*"]
else:
    origins = [o.strip() for o in cors_origins.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def block_writes_for_demo_users(request, call_next):
    """Demo users get 403 on any write method except explicit allowlist."""
    method = request.method.upper()
    if method in ("POST", "PUT", "PATCH", "DELETE"):
        path = request.url.path
        # Skip the demo-login endpoint itself
        if path != "/api/auth/demo-login" and path not in DEMO_WRITE_ALLOWLIST:
            auth_header = request.headers.get("authorization")
            if is_demo_user_from_token(auth_header):
                from fastapi.responses import JSONResponse
                return JSONResponse(
                    status_code=403,
                    content={"detail": "Демо-режим: изменения запрещены. Зарегистрируйтесь для полного доступа."}
                )
    return await call_next(request)

# Include all routers
all_routers = [
    auth_router,
    accounts_router,
    categories_router,
    directions_router,
    contractors_router,
    transactions_router,
    planned_payments_router,
    projects_router,
    documents_router,
    notifications_router,
    analytics_router,
    adesk_router,
    integrations_router,
    ai_router,
    bot_router,
    expense_plan_router,
    bank_import_router,
    cash_import_router,
    telegram_webhook_router,
    exchange_rate_router,
    backup_router,
    recurring_router,
    salaries_router,
    drive_backup_router,
    demo_router,
    google_sheets_router,
]

for router in all_routers:
    app.include_router(router)

# Scheduler for automated tasks
scheduler = AsyncIOScheduler()


@app.on_event("startup")
async def startup_event():
    from services.telegram import send_scheduled_telegram_summary
    from services.google_sheets import backup_to_google_sheets
    from database import db

    # Backfill to_account_name for existing transfer transactions
    try:
        transfers = await db.transactions.find(
            {"type": "transfer", "to_account_id": {"$ne": None}, "to_account_name": None},
            {"_id": 0, "id": 1, "to_account_id": 1}
        ).to_list(10000)
        for t in transfers:
            acc = await db.accounts.find_one({"id": t["to_account_id"]}, {"_id": 0, "name": 1})
            if acc:
                await db.transactions.update_one(
                    {"id": t["id"]},
                    {"$set": {"to_account_name": acc["name"]}}
                )
        if transfers:
            logger.info(f"Backfilled to_account_name for {len(transfers)} transfers")
    except Exception as e:
        logger.error(f"Backfill error: {e}")

    # Backfill amount_base for existing transactions where currency != account currency
    try:
        from routes.exchange_rate import get_nbp_rate
        rate = await get_nbp_rate()
        if rate > 0:
            # Find transactions without amount_base that have non-PLN currency on PLN accounts
            txs = await db.transactions.find(
                {"amount_base": None},
                {"_id": 0, "id": 1, "amount": 1, "currency": 1, "account_id": 1}
            ).to_list(50000)
            updated = 0
            for t in txs:
                acc = await db.accounts.find_one({"id": t["account_id"]}, {"_id": 0, "currency": 1})
                acc_cur = acc.get("currency", "PLN") if acc else "PLN"
                tx_cur = t.get("currency", "PLN")
                update_fields = {}
                if tx_cur != acc_cur and tx_cur == "EUR" and acc_cur == "PLN":
                    update_fields["amount_base"] = round(t["amount"] * rate, 2)
                    update_fields["exchange_rate"] = rate
                elif tx_cur != acc_cur and tx_cur == "PLN" and acc_cur == "EUR":
                    update_fields["amount_base"] = round(t["amount"] / rate, 2)
                    update_fields["exchange_rate"] = rate
                else:
                    update_fields["amount_base"] = t["amount"]

                # Backfill to_amount_base for transfers
                to_acc_id = t.get("to_account_id")
                if t.get("type") == "transfer" and to_acc_id:
                    to_acc = await db.accounts.find_one({"id": to_acc_id}, {"_id": 0, "currency": 1})
                    to_cur = to_acc.get("currency", "PLN") if to_acc else "PLN"
                    if tx_cur != to_cur and tx_cur == "EUR" and to_cur == "PLN":
                        update_fields["to_amount_base"] = round(t["amount"] * rate, 2)
                    elif tx_cur != to_cur and tx_cur == "PLN" and to_cur == "EUR":
                        update_fields["to_amount_base"] = round(t["amount"] / rate, 2)
                    else:
                        update_fields["to_amount_base"] = t["amount"]

                await db.transactions.update_one({"id": t["id"]}, {"$set": update_fields})
                updated += 1
            if updated:
                logger.info(f"Backfilled amount_base for {updated} transactions (rate={rate})")
                # Recalculate all account balances
                accounts = await db.accounts.find({}, {"_id": 0, "id": 1, "user_id": 1}).to_list(100)
                from services.balance import update_account_balance
                for a in accounts:
                    await update_account_balance(a["id"], a["user_id"])
                logger.info(f"Recalculated balances for {len(accounts)} accounts")
    except Exception as e:
        logger.error(f"Backfill amount_base error: {e}")

    # Schedule Telegram summary (weekly on Monday at 9:00)
    scheduler.add_job(
        send_scheduled_telegram_summary,
        "cron",
        day_of_week="mon",
        hour=9,
        minute=0,
        id="telegram_weekly_summary",
        replace_existing=True
    )

    # Schedule Google Sheets backup (daily at 2:00 AM)
    async def scheduled_google_sheets_backup():
        users_with_sheets = await db.integration_settings.find(
            {
                "google_sheets_url": {"$exists": True, "$ne": None},
                "google_service_account": {"$exists": True, "$ne": None},
            },
            {"_id": 0}
        ).to_list(100)

        for settings in users_with_sheets:
            try:
                result = await backup_to_google_sheets(
                    settings["user_id"],
                    settings["google_sheets_url"],
                    settings["google_service_account"],
                )
                if result.get("status") == "success":
                    await db.integration_settings.update_one(
                        {"user_id": settings["user_id"]},
                        {"$set": {"last_backup_at": datetime.now(timezone.utc).isoformat()}}
                    )
                logger.info(f"Scheduled backup for user {settings['user_id']}: {result.get('status')}")
            except Exception as e:
                logger.error(f"Scheduled backup failed for user {settings['user_id']}: {e}")

    scheduler.add_job(
        scheduled_google_sheets_backup,
        "cron",
        hour=2,
        minute=0,
        id="google_sheets_daily_backup",
        replace_existing=True
    )

    # Schedule daily auto-generation of planned payments from recurring expense templates (3:00 AM)
    async def scheduled_recurring_generation():
        from routes.recurring import _next_due_date
        from models import PlannedPayment
        today = datetime.now(timezone.utc)
        users = await db.recurring_expenses.distinct("user_id", {"is_active": True})
        for user_id in users:
            try:
                rows = await db.recurring_expenses.find(
                    {"user_id": user_id, "is_active": True},
                    {"_id": 0}
                ).to_list(500)
                for r in rows:
                    due_date = _next_due_date(today, int(r.get("day_of_month", 1)), r.get("periodicity", "monthly"))
                    existing = await db.planned_payments.find_one({
                        "user_id": user_id,
                        "date": due_date,
                        "category_id": r.get("category_id"),
                        "amount": r.get("amount"),
                    })
                    if existing:
                        continue
                    payment = PlannedPayment(
                        date=due_date,
                        type="expense",
                        amount=r["amount"],
                        currency=r.get("currency", "PLN"),
                        category_id=r.get("category_id"),
                        category_name=r.get("category_name"),
                        contractor_id=r.get("contractor_id"),
                        contractor_name=r.get("contractor_name"),
                        direction_id=r["direction_id"],
                        direction_name=r.get("direction_name"),
                        account_id=r["account_id"],
                        account_name=r.get("account_name"),
                        recurrence=r.get("periodicity", "monthly"),
                        comment=f"[{r['name']}] {r.get('comment') or ''}".strip(),
                        user_id=user_id,
                    )
                    await db.planned_payments.insert_one(payment.model_dump())
                logger.info(f"Recurring auto-gen ok for user {user_id}: {len(rows)} templates")
            except Exception as e:
                logger.error(f"Recurring auto-gen failed for user {user_id}: {e}")

    scheduler.add_job(
        scheduled_recurring_generation,
        "cron",
        hour=3,
        minute=0,
        id="recurring_daily_generation",
        replace_existing=True,
    )

    # Daily Telegram reminders for upcoming/overdue planned payments at 09:30
    from services.telegram import send_planned_payment_reminders
    scheduler.add_job(
        send_planned_payment_reminders,
        "cron",
        hour=9,
        minute=30,
        id="planned_payments_telegram_reminders",
        replace_existing=True,
    )

    # Daily Google Drive backup (DB only) at 03:00 UTC
    from services.google_drive_backup import scheduled_drive_backup_db, scheduled_drive_backup_full
    scheduler.add_job(
        scheduled_drive_backup_db,
        "cron",
        hour=3,
        minute=0,
        id="google_drive_backup_db",
        replace_existing=True,
    )
    # Weekly full backup (DB + uploads) on Sundays at 03:30 UTC
    scheduler.add_job(
        scheduled_drive_backup_full,
        "cron",
        day_of_week="sun",
        hour=3,
        minute=30,
        id="google_drive_backup_full",
        replace_existing=True,
    )

    scheduler.start()
    logger.info("WM Finance API v2.0.0 started with scheduler")


@app.on_event("shutdown")
async def shutdown_db_client():
    scheduler.shutdown(wait=False)
    client.close()
