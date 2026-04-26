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

        accounts_lines = "\n".join(
            f"• {a.get('name', '')}: {a.get('current_balance', 0):,.2f} {a.get('currency', 'PLN')}"
            for a in accounts
        )

        message = f"""📊 *Еженедельная сводка*

💰 *Показатели за неделю:*
• Доходы: +{income:,.0f} zł
• Расходы: -{expense:,.0f} zł
• {emoji_profit} Прибыль: {profit:,.0f} zł

🏦 *Счета:*
{accounts_lines}
💰 *Итого:* {total_balance:,.2f} zł

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



async def _send_telegram_message(token: str, chat_id: str, text: str) -> bool:
    """Отправить сообщение в Telegram. Возвращает True при успехе."""
    import httpx
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.post(
                f"https://api.telegram.org/bot{token}/sendMessage",
                json={"chat_id": chat_id, "text": text, "parse_mode": "Markdown"}
            )
            return r.status_code == 200
    except Exception as e:
        logger.error(f"Telegram send error: {e}")
        return False


async def send_planned_payment_reminders():
    """
    Раз в день — напомнить о плановых платежах:
      - просроченные (date < today, status != paid)
      - на сегодня (date == today, status != paid)
      - на завтра (date == today+1, status != paid)
    Не дублирует напоминания: помечает поле reminder_sent_at.
    """
    today = datetime.now(timezone.utc).date()
    today_str = today.strftime("%Y-%m-%d")
    tomorrow_str = (today + timedelta(days=1)).strftime("%Y-%m-%d")

    settings_list = await db.integration_settings.find(
        {"telegram_bot_token": {"$ne": None}, "telegram_chat_id": {"$ne": None}},
        {"_id": 0}
    ).to_list(200)

    for settings in settings_list:
        token = settings.get("telegram_bot_token")
        chat_id = settings.get("telegram_chat_id")
        user_id = settings["user_id"]
        if not token or not chat_id:
            continue

        # Auto-mark overdue
        await db.planned_payments.update_many(
            {"user_id": user_id, "status": "pending", "date": {"$lt": today_str}},
            {"$set": {"status": "overdue"}}
        )

        # Pull payments needing reminder
        payments = await db.planned_payments.find(
            {
                "user_id": user_id,
                "status": {"$in": ["pending", "overdue"]},
                "date": {"$lte": tomorrow_str},
            },
            {"_id": 0}
        ).sort("date", 1).to_list(200)

        if not payments:
            continue

        # Group by bucket
        overdue, due_today, due_tomorrow = [], [], []
        for p in payments:
            if p["date"] < today_str:
                overdue.append(p)
            elif p["date"] == today_str:
                due_today.append(p)
            elif p["date"] == tomorrow_str:
                due_tomorrow.append(p)

        # Throttle: skip payments reminded in the last 20 hours
        cutoff = datetime.now(timezone.utc) - timedelta(hours=20)

        def _filter(items):
            keep = []
            for p in items:
                last = p.get("reminder_sent_at")
                if last:
                    try:
                        last_dt = datetime.fromisoformat(last.replace("Z", "+00:00"))
                        if last_dt > cutoff:
                            continue
                    except Exception:
                        pass
                keep.append(p)
            return keep

        overdue = _filter(overdue)
        due_today = _filter(due_today)
        due_tomorrow = _filter(due_tomorrow)

        if not (overdue or due_today or due_tomorrow):
            continue

        def fmt_line(p):
            amt = f"{p['amount']:,.2f} {p.get('currency', 'PLN')}"
            who = p.get("contractor_name") or p.get("category_name") or "Платёж"
            note = f" — {p['comment']}" if p.get("comment") else ""
            return f"• `{p['date']}` *{amt}* — {who}{note}"

        sections = []
        if overdue:
            sections.append("🔴 *Просрочено:*\n" + "\n".join(fmt_line(p) for p in overdue))
        if due_today:
            sections.append("🟡 *Сегодня к оплате:*\n" + "\n".join(fmt_line(p) for p in due_today))
        if due_tomorrow:
            sections.append("🟢 *Завтра к оплате:*\n" + "\n".join(fmt_line(p) for p in due_tomorrow))

        message = "📅 *Напоминание о плановых платежах*\n\n" + "\n\n".join(sections) + \
                  "\n\n_Откройте «Платёжный календарь» в WM Finance, чтобы связать с фактической операцией._"

        sent = await _send_telegram_message(token, chat_id, message)
        if sent:
            now_iso = datetime.now(timezone.utc).isoformat()
            ids = [p["id"] for p in (overdue + due_today + due_tomorrow)]
            if ids:
                await db.planned_payments.update_many(
                    {"id": {"$in": ids}, "user_id": user_id},
                    {"$set": {"reminder_sent_at": now_iso}}
                )
            logger.info(f"Planned payment reminders sent to user {user_id}: "
                        f"{len(overdue)} overdue, {len(due_today)} today, {len(due_tomorrow)} tomorrow")
