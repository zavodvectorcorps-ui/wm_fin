from fastapi import APIRouter, HTTPException, Depends, Query
from datetime import datetime, timezone, timedelta
import os
import logging

from database import db
from auth import get_current_user

router = APIRouter(prefix="/api")
logger = logging.getLogger(__name__)


@router.post("/ai/chat")
async def ai_chat(
    message: str = Query(...),
    current_user: dict = Depends(get_current_user)
):
    from emergentintegrations.llm.chat import LlmChat, UserMessage

    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="AI not configured")

    today = datetime.now(timezone.utc)
    current_month_start = today.strftime("%Y-%m-01")
    prev_month_start = (today.replace(day=1) - timedelta(days=1)).strftime("%Y-%m-01")
    prev_month_end = (today.replace(day=1) - timedelta(days=1)).strftime("%Y-%m-%d")

    current_transactions = await db.transactions.find({
        "user_id": current_user["user_id"],
        "status": "fact",
        "date": {"$gte": current_month_start}
    }, {"_id": 0}).to_list(10000)

    current_income = sum(t["amount"] for t in current_transactions if t["type"] == "income")
    current_expense = sum(t["amount"] for t in current_transactions if t["type"] == "expense")

    prev_transactions = await db.transactions.find({
        "user_id": current_user["user_id"],
        "status": "fact",
        "date": {"$gte": prev_month_start, "$lte": prev_month_end}
    }, {"_id": 0}).to_list(10000)

    prev_income = sum(t["amount"] for t in prev_transactions if t["type"] == "income")
    prev_expense = sum(t["amount"] for t in prev_transactions if t["type"] == "expense")

    by_direction = {}
    for t in current_transactions:
        dir_name = t.get("direction_name", "Общее")
        if dir_name not in by_direction:
            by_direction[dir_name] = {"income": 0, "expense": 0}
        if t["type"] == "income":
            by_direction[dir_name]["income"] += t["amount"]
        elif t["type"] == "expense":
            by_direction[dir_name]["expense"] += t["amount"]

    expense_by_cat = {}
    for t in current_transactions:
        if t["type"] == "expense":
            cat = t.get("category_name", "Без категории")
            expense_by_cat[cat] = expense_by_cat.get(cat, 0) + t["amount"]

    top_expenses = sorted(expense_by_cat.items(), key=lambda x: x[1], reverse=True)[:10]

    accounts = await db.accounts.find({"user_id": current_user["user_id"], "is_active": True}, {"_id": 0}).to_list(100)

    upcoming = await db.planned_payments.find({
        "user_id": current_user["user_id"],
        "status": {"$in": ["pending", "overdue"]}
    }, {"_id": 0}).sort("date", 1).limit(10).to_list(10)

    overdue = [p for p in upcoming if p["status"] == "overdue"]

    context = f"""Контекст финансовых данных компании WM Finance (теплицы, сауны, купели):

Текущий месяц ({current_month_start[:7]}):
- Доходы: {current_income:,.2f} PLN
- Расходы: {current_expense:,.2f} PLN
- Прибыль: {current_income - current_expense:,.2f} PLN

Прошлый месяц:
- Доходы: {prev_income:,.2f} PLN
- Расходы: {prev_expense:,.2f} PLN
- Прибыль: {prev_income - prev_expense:,.2f} PLN

По направлениям бизнеса (текущий месяц):
{chr(10).join([f"- {k}: доходы {v['income']:,.2f}, расходы {v['expense']:,.2f}, прибыль {v['income']-v['expense']:,.2f}" for k, v in by_direction.items()])}

Топ расходов:
{chr(10).join([f"- {cat}: {amt:,.2f} PLN" for cat, amt in top_expenses])}

Счета:
{chr(10).join([f"- {a['name']}: {a['current_balance']:,.2f} {a['currency']}" for a in accounts])}

Ближайшие платежи:
{chr(10).join([f"- {p['date']}: {p['type']} {p['amount']:,.2f} PLN ({p['status']})" for p in upcoming[:5]])}

Просроченных платежей: {len(overdue)}
"""

    system_message = """Ты финансовый ИИ-ассистент компании WM Finance. Компания занимается производством и продажей теплиц, саун и купелей в Польше.

Отвечай на русском языке. Используй данные из контекста для ответов на вопросы о финансах.
Форматируй суммы с разделителем тысяч и 2 знаками после запятой.
Будь кратким и по существу.

Если пользователь просит добавить операцию, сформируй JSON с данными операции в формате:
{"action": "create_transaction", "data": {"type": "income/expense", "amount": число, "direction": "название", "description": "описание"}}
"""

    chat = LlmChat(
        api_key=api_key,
        session_id=f"wmfinance_{current_user['user_id']}_{today.strftime('%Y%m%d%H%M')}",
        system_message=system_message
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")

    user_message = UserMessage(text=f"{context}\n\nВопрос пользователя: {message}")

    try:
        response = await chat.send_message(user_message)
        return {"response": response}
    except Exception as e:
        logger.error(f"AI error: {e}")
        raise HTTPException(status_code=500, detail="AI service error")
