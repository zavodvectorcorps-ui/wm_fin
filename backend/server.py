from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.asyncio import AsyncIOScheduler
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
            {"google_sheets_url": {"$exists": True, "$ne": None}},
            {"_id": 0}
        ).to_list(100)

        for settings in users_with_sheets:
            try:
                await backup_to_google_sheets(
                    settings["user_id"],
                    settings["google_sheets_url"]
                )
                logger.info(f"Scheduled backup for user {settings['user_id']} completed")
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

    scheduler.start()
    logger.info("WM Finance API v2.0.0 started with scheduler")


@app.on_event("shutdown")
async def shutdown_db_client():
    scheduler.shutdown(wait=False)
    client.close()
