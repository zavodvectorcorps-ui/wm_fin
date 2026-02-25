import logging
from datetime import datetime, timezone, timedelta

from database import db

logger = logging.getLogger(__name__)


async def send_scheduled_telegram_summary():
    """Send scheduled summaries for all users with auto-summary enabled"""
    import httpx

    settings_list = await db.integration_settings.find(
        {"telegram_auto_summary": True},
        {"_id": 0}
    ).to_list(100)

    for settings in settings_list:
        if not settings.get("telegram_bot_token") or not settings.get("telegram_chat_id"):
            continue

        user_id = settings["user_id"]

        now = datetime.now(timezone.utc)
        date_from = (now - timedelta(days=7)).strftime("%Y-%m-%d")
        date_to = now.strftime("%Y-%m-%d")

        transactions = await db.transactions.find(
            {"user_id": user_id, "status": "fact", "date": {"$gte": date_from, "$lte": date_to}},
            {"_id": 0}
        ).to_list(10000)

        income = sum(t["amount"] for t in transactions if t["type"] == "income")
        expense = sum(t["amount"] for t in transactions if t["type"] == "expense")
        profit = income - expense

        accounts = await db.accounts.find(
            {"user_id": user_id, "is_active": True},
            {"_id": 0}
        ).to_list(20)

        total_balance = sum(a.get("current_balance", 0) for a in accounts)
        emoji_profit = "📈" if profit >= 0 else "📉"

        message = f"""📊 *Еженедельная сводка*

💰 *Показатели за неделю:*
• Доходы: +{income:,.0f} zł
• Расходы: -{expense:,.0f} zł
• {emoji_profit} Прибыль: {profit:,.0f} zł

🏦 *Баланс:* {total_balance:,.0f} zł

_Автоматическое сообщение от WM Finance_"""

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                await client.post(
                    f"https://api.telegram.org/bot{settings['telegram_bot_token']}/sendMessage",
                    json={
                        "chat_id": settings["telegram_chat_id"],
                        "text": message,
                        "parse_mode": "Markdown"
                    }
                )
            logger.info(f"Scheduled summary sent to user {user_id}")
        except Exception as e:
            logger.error(f"Failed to send scheduled summary to user {user_id}: {e}")
