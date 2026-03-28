from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import StreamingResponse
from typing import Optional, Literal
from datetime import datetime, timezone, timedelta
import uuid
import csv
import io
import re
import logging
import jwt

from database import db
from auth import get_current_user, JWT_SECRET, JWT_ALGORITHM
from models import Transaction, BotTransactionRequest
from services.balance import update_account_balance

router = APIRouter(prefix="/api")
logger = logging.getLogger(__name__)


@router.post("/bot/transaction")
async def bot_create_transaction(data: BotTransactionRequest):
    try:
        payload = jwt.decode(data.user_token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload["user_id"]
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        raise HTTPException(status_code=401, detail="Invalid token")

    text = data.text.lower()

    direction_name = "Общее"
    if "теплиц" in text:
        direction_name = "Теплицы"
    elif "саун" in text:
        direction_name = "Сауны"
    elif "купел" in text:
        direction_name = "Купели"

    direction = await db.directions.find_one({"user_id": user_id, "name": direction_name}, {"_id": 0})
    if not direction:
        direction = await db.directions.find_one({"user_id": user_id, "name": "Общее"}, {"_id": 0})

    trans_type = "expense"
    if any(word in text for word in ["приход", "получил", "оплатили", "поступление"]):
        trans_type = "income"

    numbers = re.findall(r'\d+(?:[.,]\d+)?', text)
    amount = float(numbers[0].replace(",", ".")) if numbers else 0

    account = await db.accounts.find_one({"user_id": user_id, "is_active": True}, {"_id": 0})
    if not account:
        raise HTTPException(status_code=400, detail="No accounts found")

    description = text
    for word in ["теплицы", "теплица", "сауна", "сауны", "купель", "купели", "расход", "приход", "плачу", "получил"]:
        description = description.replace(word, "")
    for num in numbers:
        description = description.replace(num, "")
    description = " ".join(description.split()).strip()

    date_str = data.date or datetime.now(timezone.utc).strftime("%Y-%m-%d")

    transaction = Transaction(
        date=date_str,
        type=trans_type,
        amount=amount,
        currency="PLN",
        direction_id=direction["id"] if direction else "",
        direction_name=direction_name,
        account_id=account["id"],
        account_name=account["name"],
        description=description or "Операция из Telegram",
        source="telegram_bot",
        status="fact",
        user_id=user_id
    )

    await db.transactions.insert_one(transaction.model_dump())
    await update_account_balance(account["id"], user_id)

    return {
        "status": "created",
        "transaction": {
            "id": transaction.id,
            "date": transaction.date,
            "type": transaction.type,
            "amount": transaction.amount,
            "direction": direction_name,
            "description": transaction.description
        }
    }


@router.get("/bot/report")
async def bot_get_report(
    period: str = Query("week"),
    direction: str = Query("all"),
    user_token: str = Query(...)
):
    try:
        payload = jwt.decode(user_token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload["user_id"]
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        raise HTTPException(status_code=401, detail="Invalid token")

    now = datetime.now(timezone.utc)

    if period == "week":
        date_from = (now - timedelta(days=7)).strftime("%Y-%m-%d")
    elif period == "month":
        date_from = (now - timedelta(days=30)).strftime("%Y-%m-%d")
    else:
        date_from = now.strftime("%Y-%m-01")

    date_to = now.strftime("%Y-%m-%d")

    query = {
        "user_id": user_id,
        "status": "fact",
        "date": {"$gte": date_from, "$lte": date_to}
    }

    if direction != "all":
        query["direction_name"] = direction

    transactions = await db.transactions.find(query, {"_id": 0}).to_list(10000)

    total_income = sum(t["amount"] for t in transactions if t["type"] == "income")
    total_expense = sum(t["amount"] for t in transactions if t["type"] == "expense")
    profit = total_income - total_expense

    accounts = await db.accounts.find({"user_id": user_id, "is_active": True}, {"_id": 0}).to_list(100)
    total_balance = sum(a.get("current_balance", 0) for a in accounts)

    report = f"""📊 Отчёт за {period}
    
💰 Доходы: {total_income:,.2f} zł
💸 Расходы: {total_expense:,.2f} zł
📈 Прибыль: {profit:,.2f} zł

🏦 Счета:"""
    for a in accounts:
        report += f"\n• {a.get('name', '')}: {a.get('current_balance', 0):,.2f} {a.get('currency', 'PLN')}"
    report += f"\n💰 Итого: {total_balance:,.2f} zł"

    return {"report": report}


@router.get("/bot/summary")
async def get_telegram_summary(
    user_token: str,
    period: Literal["day", "week", "month"] = "week"
):
    try:
        payload = jwt.decode(user_token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload["user_id"]
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        raise HTTPException(status_code=401, detail="Invalid token")

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
        {"user_id": user_id, "status": "fact", "date": {"$gte": date_from, "$lte": date_to}},
        {"_id": 0}
    ).to_list(10000)

    income = sum(t["amount"] for t in transactions if t["type"] == "income")
    expense = sum(t["amount"] for t in transactions if t["type"] == "expense")
    profit = income - expense

    by_direction = {}
    for t in transactions:
        dir_name = t.get("direction_name", "Общее")
        if dir_name not in by_direction:
            by_direction[dir_name] = {"income": 0, "expense": 0}
        if t["type"] == "income":
            by_direction[dir_name]["income"] += t["amount"]
        elif t["type"] == "expense":
            by_direction[dir_name]["expense"] += t["amount"]

    expense_by_cat = {}
    for t in transactions:
        if t["type"] == "expense":
            cat_name = t.get("category_name", "Прочее")
            expense_by_cat[cat_name] = expense_by_cat.get(cat_name, 0) + t["amount"]

    top_expenses = sorted(expense_by_cat.items(), key=lambda x: x[1], reverse=True)[:5]

    accounts = await db.accounts.find({"user_id": user_id, "is_active": True}, {"_id": 0}).to_list(20)
    total_balance = sum(a.get("current_balance", 0) for a in accounts)

    upcoming = await db.planned_payments.find(
        {
            "user_id": user_id,
            "status": "pending",
            "date": {"$gte": date_to, "$lte": (now + timedelta(days=7)).strftime("%Y-%m-%d")}
        },
        {"_id": 0}
    ).to_list(10)

    upcoming_expense = sum(p["amount"] for p in upcoming if p["type"] == "expense")
    upcoming_income = sum(p["amount"] for p in upcoming if p["type"] == "income")

    emoji_profit = "📈" if profit >= 0 else "📉"

    message = f"""📊 *Финансовая сводка {period_label}*

💰 *Общие показатели:*
• Доходы: +{income:,.0f} zł
• Расходы: -{expense:,.0f} zł
• {emoji_profit} Прибыль: {profit:,.0f} zł

🏦 *Счета:*
"""
    for a in accounts:
        message += f"• {a.get('name', '')}: {a.get('current_balance', 0):,.2f} {a.get('currency', 'PLN')}\n"
    message += f"💰 *Итого:* {total_balance:,.2f} zł\n\n"

    if by_direction:
        message += "📂 *По направлениям:*\n"
        for dir_name, data in by_direction.items():
            dir_profit = data["income"] - data["expense"]
            message += f"• {dir_name}: {dir_profit:+,.0f} zł\n"
        message += "\n"

    if top_expenses:
        message += "📌 *Топ расходов:*\n"
        for cat, amount in top_expenses:
            message += f"• {cat}: {amount:,.0f} zł\n"
        message += "\n"

    if upcoming_expense > 0 or upcoming_income > 0:
        message += "⏰ *На следующей неделе:*\n"
        if upcoming_income > 0:
            message += f"• Ожидается: +{upcoming_income:,.0f} zł\n"
        if upcoming_expense > 0:
            message += f"• К оплате: -{upcoming_expense:,.0f} zł\n"

    return {
        "message": message,
        "data": {
            "period": period,
            "income": income,
            "expense": expense,
            "profit": profit,
            "balance": total_balance,
            "by_direction": by_direction,
            "top_expenses": top_expenses,
            "upcoming_expense": upcoming_expense,
            "upcoming_income": upcoming_income
        }
    }
