from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional, Literal
from datetime import datetime, timezone, timedelta
import httpx
import uuid
import logging

from database import db
from auth import get_current_user
from models import TelegramSettingsUpdate, TelegramTestMessage

router = APIRouter(prefix="/api")
logger = logging.getLogger(__name__)


@router.get("/settings/integrations")
async def get_integration_settings(current_user: dict = Depends(get_current_user)):
    settings = await db.integration_settings.find_one(
        {"user_id": current_user["user_id"]},
        {"_id": 0}
    )

    if not settings:
        settings = {
            "id": str(uuid.uuid4()),
            "user_id": current_user["user_id"],
            "telegram_bot_token": None,
            "telegram_chat_id": None,
            "telegram_auto_summary": False,
            "telegram_summary_schedule": "weekly",
            "telegram_summary_time": "09:00",
            "adesk_api_token": None,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        await db.integration_settings.insert_one(settings)

    result = dict(settings)
    bot_token = result.get("telegram_bot_token")
    adesk_token = result.get("adesk_api_token")
    result["has_telegram_bot_token"] = bool(bot_token)
    result["has_adesk_api_token"] = bool(adesk_token)
    # Do NOT send raw/masked secrets to frontend — they would round-trip back on save and overwrite real values
    result["telegram_bot_token"] = None
    result["adesk_api_token"] = None

    return result


@router.put("/settings/integrations/telegram")
async def update_telegram_settings(
    data: TelegramSettingsUpdate,
    current_user: dict = Depends(get_current_user)
):
    update_data = {"updated_at": datetime.now(timezone.utc).isoformat()}

    # Only update the token if a non-empty value was provided (prevents wiping saved token
    # when frontend sends empty string because field is intentionally blank for security)
    if data.telegram_bot_token is not None and data.telegram_bot_token.strip():
        update_data["telegram_bot_token"] = data.telegram_bot_token.strip()
    if data.telegram_chat_id is not None:
        update_data["telegram_chat_id"] = data.telegram_chat_id
    if data.telegram_auto_summary is not None:
        update_data["telegram_auto_summary"] = data.telegram_auto_summary
    if data.telegram_summary_schedule is not None:
        update_data["telegram_summary_schedule"] = data.telegram_summary_schedule
    if data.telegram_summary_time is not None:
        update_data["telegram_summary_time"] = data.telegram_summary_time

    await db.integration_settings.update_one(
        {"user_id": current_user["user_id"]},
        {"$set": update_data},
        upsert=True
    )

    return {"status": "updated"}


@router.post("/settings/telegram/test")
async def test_telegram_connection(
    data: TelegramTestMessage,
    current_user: dict = Depends(get_current_user)
):
    bot_token = (data.bot_token or "").strip()
    chat_id = (data.chat_id or "").strip()

    # Fall back to stored credentials when fields are empty
    if not bot_token or not chat_id:
        saved = await db.integration_settings.find_one(
            {"user_id": current_user["user_id"]},
            {"_id": 0, "telegram_bot_token": 1, "telegram_chat_id": 1}
        ) or {}
        bot_token = bot_token or (saved.get("telegram_bot_token") or "")
        chat_id = chat_id or (saved.get("telegram_chat_id") or "")

    if not bot_token or not chat_id:
        return {"status": "error", "message": "Не указан токен или Chat ID"}

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"https://api.telegram.org/bot{bot_token}/sendMessage",
                json={
                    "chat_id": chat_id,
                    "text": "✅ *WM Finance подключен!*\n\nТестовое сообщение отправлено успешно.",
                    "parse_mode": "Markdown"
                }
            )

            if response.status_code == 200:
                return {"status": "success", "message": "Сообщение отправлено"}
            else:
                error = response.json()
                return {"status": "error", "message": error.get("description", "Ошибка отправки")}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.post("/settings/telegram/send-summary")
async def send_telegram_summary(
    period: Literal["day", "week", "month"] = "week",
    current_user: dict = Depends(get_current_user)
):
    settings = await db.integration_settings.find_one(
        {"user_id": current_user["user_id"]},
        {"_id": 0}
    )

    if not settings or not settings.get("telegram_bot_token") or not settings.get("telegram_chat_id"):
        raise HTTPException(status_code=400, detail="Telegram не настроен")

    now = datetime.now(timezone.utc)

    if period == "day":
        date_from = now.strftime("%Y-%m-%d")
        period_label = "за сегодня"
    elif period == "week":
        date_from = (now - timedelta(days=7)).strftime("%Y-%m-%d")
        period_label = "за неделю"
    else:
        date_from = (now - timedelta(days=30)).strftime("%Y-%m-%d")
        period_label = "за месяц"

    date_to = now.strftime("%Y-%m-%d")

    transactions = await db.transactions.find(
        {"user_id": current_user["user_id"], "status": "fact", "date": {"$gte": date_from, "$lte": date_to}},
        {"_id": 0}
    ).to_list(10000)

    income = sum(t["amount"] for t in transactions if t["type"] == "income")
    expense = sum(t["amount"] for t in transactions if t["type"] == "expense")
    profit = income - expense

    accounts = await db.accounts.find(
        {"user_id": current_user["user_id"], "is_active": True},
        {"_id": 0}
    ).to_list(20)

    total_balance = sum(a.get("current_balance", 0) for a in accounts)

    emoji_profit = "📈" if profit >= 0 else "📉"

    accounts_lines = "\n".join(
        f"• {a.get('name', '')}: {a.get('current_balance', 0):,.2f} {a.get('currency', 'PLN')}"
        for a in accounts
    )

    message = f"""📊 *Финансовая сводка {period_label}*

💰 *Показатели:*
• Доходы: +{income:,.0f} zł
• Расходы: -{expense:,.0f} zł
• {emoji_profit} Прибыль: {profit:,.0f} zł

🏦 *Счета:*
{accounts_lines}
💰 *Итого:* {total_balance:,.2f} zł

_Отправлено из WM Finance_"""

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"https://api.telegram.org/bot{settings['telegram_bot_token']}/sendMessage",
                json={
                    "chat_id": settings["telegram_chat_id"],
                    "text": message,
                    "parse_mode": "Markdown"
                }
            )

            if response.status_code == 200:
                return {"status": "success", "message": "Сводка отправлена в Telegram"}
            else:
                error = response.json()
                raise HTTPException(status_code=400, detail=error.get("description", "Ошибка отправки"))
    except httpx.TimeoutException:
        raise HTTPException(status_code=500, detail="Таймаут подключения к Telegram")


@router.delete("/settings/reset-all")
async def reset_all_data(
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user["user_id"]

    results = {
        "transactions": (await db.transactions.delete_many({"user_id": user_id})).deleted_count,
        "planned_payments": (await db.planned_payments.delete_many({"user_id": user_id})).deleted_count,
        "projects": (await db.projects.delete_many({"user_id": user_id})).deleted_count,
        "contractors": (await db.contractors.delete_many({"user_id": user_id})).deleted_count,
        "documents": (await db.documents.delete_many({"user_id": user_id})).deleted_count,
        "adesk_drafts": (await db.adesk_drafts.delete_many({"user_id": user_id})).deleted_count,
        "auto_rules": (await db.auto_rules.delete_many({"user_id": user_id})).deleted_count,
        "notifications": (await db.notifications.delete_many({"user_id": user_id})).deleted_count,
    }

    results["categories"] = (await db.categories.delete_many({
        "user_id": user_id,
        "group": "Импорт из Adesk"
    })).deleted_count

    results["directions"] = (await db.directions.delete_many({
        "user_id": user_id,
        "name": {"$nin": ["Теплицы", "Сауны", "Купели", "Общее"]}
    })).deleted_count

    results["accounts"] = (await db.accounts.delete_many({
        "user_id": user_id,
        "name": {"$nin": ["Cash PL", "mBank PLN", "mBank EUR"]}
    })).deleted_count

    await db.accounts.update_many(
        {"user_id": user_id},
        {"$set": {"current_balance": 0, "initial_balance": 0}}
    )

    return {"status": "reset_complete", "deleted": results}
