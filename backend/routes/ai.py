from fastapi import APIRouter, HTTPException, Depends, Query
from datetime import datetime, timezone, timedelta
import os
import logging
from collections import defaultdict

from database import db
from auth import get_current_user

router = APIRouter(prefix="/api")
logger = logging.getLogger(__name__)


def _month_str(d: datetime) -> str:
    return d.strftime("%Y-%m")


def _first_of_month(d: datetime) -> datetime:
    return d.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


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
    user_id = current_user["user_id"]

    # ---- Time windows
    current_month_start = today.strftime("%Y-%m-01")
    prev_month_first = (today.replace(day=1) - timedelta(days=1)).replace(day=1)
    prev_month_start = prev_month_first.strftime("%Y-%m-01")
    prev_month_end = (today.replace(day=1) - timedelta(days=1)).strftime("%Y-%m-%d")

    # 12-month rolling window (for monthly aggregates)
    twelve_months_back = _first_of_month(today) - timedelta(days=365)
    twelve_months_back_str = twelve_months_back.strftime("%Y-%m-01")

    # Year boundaries
    current_year_start = today.strftime("%Y-01-01")
    last_year = today.year - 1
    last_year_start = f"{last_year}-01-01"
    last_year_end = f"{last_year}-12-31"

    # ---- Current & previous month: detailed
    current_transactions = await db.transactions.find({
        "user_id": user_id,
        "status": "fact",
        "date": {"$gte": current_month_start}
    }, {"_id": 0}).to_list(10000)
    current_income = sum(t["amount"] for t in current_transactions if t["type"] == "income")
    current_expense = sum(t["amount"] for t in current_transactions if t["type"] == "expense")

    prev_transactions = await db.transactions.find({
        "user_id": user_id,
        "status": "fact",
        "date": {"$gte": prev_month_start, "$lte": prev_month_end}
    }, {"_id": 0}).to_list(10000)
    prev_income = sum(t["amount"] for t in prev_transactions if t["type"] == "income")
    prev_expense = sum(t["amount"] for t in prev_transactions if t["type"] == "expense")

    # ---- 12-month monthly aggregates (lightweight projection)
    monthly_rows = await db.transactions.find(
        {
            "user_id": user_id,
            "status": "fact",
            "date": {"$gte": twelve_months_back_str},
            "type": {"$in": ["income", "expense"]},
        },
        {"_id": 0, "date": 1, "type": 1, "amount": 1, "direction_name": 1, "category_name": 1},
    ).to_list(200000)

    monthly = defaultdict(lambda: {"income": 0.0, "expense": 0.0})
    monthly_by_dir = defaultdict(lambda: defaultdict(lambda: {"income": 0.0, "expense": 0.0}))
    monthly_by_cat = defaultdict(lambda: defaultdict(float))  # month → category → expense
    for t in monthly_rows:
        m = (t.get("date") or "")[:7]  # YYYY-MM
        if len(m) != 7:
            continue
        monthly[m][t["type"]] += t["amount"]
        dn = t.get("direction_name") or "Общее"
        monthly_by_dir[m][dn][t["type"]] += t["amount"]
        if t["type"] == "expense":
            cn = t.get("category_name") or "Без категории"
            monthly_by_cat[m][cn] += t["amount"]

    # ---- Year-to-date and last-year totals
    ytd = await db.transactions.aggregate([
        {"$match": {"user_id": user_id, "status": "fact",
                    "date": {"$gte": current_year_start},
                    "type": {"$in": ["income", "expense"]}}},
        {"$group": {"_id": "$type", "total": {"$sum": "$amount"}}}
    ]).to_list(10)
    ytd_map = {r["_id"]: r["total"] for r in ytd}

    last_year_agg = await db.transactions.aggregate([
        {"$match": {"user_id": user_id, "status": "fact",
                    "date": {"$gte": last_year_start, "$lte": last_year_end},
                    "type": {"$in": ["income", "expense"]}}},
        {"$group": {"_id": "$type", "total": {"$sum": "$amount"}}}
    ]).to_list(10)
    ly_map = {r["_id"]: r["total"] for r in last_year_agg}

    # ---- Current month breakdowns
    by_direction = defaultdict(lambda: {"income": 0.0, "expense": 0.0})
    expense_by_cat = defaultdict(float)
    for t in current_transactions:
        dn = t.get("direction_name") or "Общее"
        if t["type"] == "income":
            by_direction[dn]["income"] += t["amount"]
        elif t["type"] == "expense":
            by_direction[dn]["expense"] += t["amount"]
            expense_by_cat[t.get("category_name") or "Без категории"] += t["amount"]
    top_expenses = sorted(expense_by_cat.items(), key=lambda x: x[1], reverse=True)[:10]

    # ---- Accounts + upcoming
    accounts = await db.accounts.find(
        {"user_id": user_id, "is_active": True}, {"_id": 0}
    ).to_list(100)
    upcoming = await db.planned_payments.find({
        "user_id": user_id,
        "status": {"$in": ["pending", "overdue"]}
    }, {"_id": 0}).sort("date", 1).limit(10).to_list(10)
    overdue = [p for p in upcoming if p["status"] == "overdue"]

    # ---- Build context
    monthly_lines = []
    for m in sorted(monthly.keys()):
        d = monthly[m]
        monthly_lines.append(
            f"- {m}: доход {d['income']:,.2f}, расход {d['expense']:,.2f}, прибыль {d['income'] - d['expense']:,.2f}"
        )

    # Monthly by direction (compressed — last 6 months only to keep prompt small)
    recent_months = sorted(monthly.keys())[-6:]
    monthly_dir_lines = []
    for m in recent_months:
        per_dir = monthly_by_dir.get(m, {})
        parts = []
        for dn, d in per_dir.items():
            parts.append(f"{dn}: {d['income']:,.0f} / {d['expense']:,.0f}")
        if parts:
            monthly_dir_lines.append(f"- {m} → " + "; ".join(parts))

    # Monthly top-8 expense categories (last 12 months)
    monthly_cat_lines = []
    for m in sorted(monthly_by_cat.keys()):
        cats = sorted(monthly_by_cat[m].items(), key=lambda x: x[1], reverse=True)[:8]
        if cats:
            parts = [f"{cn} {amt:,.0f}" for cn, amt in cats]
            monthly_cat_lines.append(f"- {m}: " + "; ".join(parts))

    context = f"""Контекст финансовых данных компании WM Finance (теплицы, сауны, купели).
Сегодня: {today.strftime('%Y-%m-%d')}.

== Текущий месяц ({current_month_start[:7]}) ==
Доходы: {current_income:,.2f} PLN
Расходы: {current_expense:,.2f} PLN
Прибыль: {current_income - current_expense:,.2f} PLN

== Прошлый месяц ({prev_month_start[:7]}) ==
Доходы: {prev_income:,.2f} PLN
Расходы: {prev_expense:,.2f} PLN
Прибыль: {prev_income - prev_expense:,.2f} PLN

== По направлениям бизнеса (текущий месяц) ==
{chr(10).join([f"- {k}: доходы {v['income']:,.2f}, расходы {v['expense']:,.2f}, прибыль {v['income']-v['expense']:,.2f}" for k, v in by_direction.items()]) or '— нет операций —'}

== Топ-10 категорий расходов (текущий месяц) ==
{chr(10).join([f"- {cat}: {amt:,.2f} PLN" for cat, amt in top_expenses]) or '— нет расходов —'}

== Помесячно за последние 12 месяцев (доход / расход / прибыль) ==
{chr(10).join(monthly_lines) or '— нет данных —'}

== Помесячно по направлениям (последние 6 месяцев, доход / расход) ==
{chr(10).join(monthly_dir_lines) or '— нет данных —'}

== Year-to-date {today.year} ==
Доходы: {ytd_map.get('income', 0):,.2f} PLN
Расходы: {ytd_map.get('expense', 0):,.2f} PLN
Прибыль: {ytd_map.get('income', 0) - ytd_map.get('expense', 0):,.2f} PLN

== Прошлый календарный год ({last_year}) ==
Доходы: {ly_map.get('income', 0):,.2f} PLN
Расходы: {ly_map.get('expense', 0):,.2f} PLN
Прибыль: {ly_map.get('income', 0) - ly_map.get('expense', 0):,.2f} PLN

== Счета ==
{chr(10).join([f"- {a['name']}: {a['current_balance']:,.2f} {a['currency']}" for a in accounts]) or '— нет счетов —'}

== Ближайшие плановые платежи ==
{chr(10).join([f"- {p['date']}: {p['type']} {p['amount']:,.2f} PLN ({p['status']})" for p in upcoming[:5]]) or '— нет —'}
Просроченных платежей: {len(overdue)}
"""

    system_message = """Ты финансовый ИИ-ассистент компании WM Finance. Компания занимается
производством и продажей теплиц, саун и купелей в Польше.

В контексте у тебя есть:
- Детальные транзакции за текущий и прошлый месяц
- Помесячные итоги (доход/расход/прибыль) за последние 12 месяцев
- Помесячные итоги по направлениям бизнеса за последние 6 месяцев
- Топ-8 категорий расходов по каждому месяцу за последние 12 месяцев
- Year-to-date текущего года и итоги прошлого календарного года

Используй эти данные, чтобы отвечать на вопросы о трендах, сравнениях,
прибыли и категориях расходов за любые периоды последних 12 месяцев
(например: «как менялись расходы на маркетинг в январе и феврале?»,
«сравни структуру расходов Q1 этого и прошлого года»).

Отвечай на русском. Форматируй суммы с разделителем тысяч и 2 знаками после
запятой. Будь кратким и по существу.

Если пользователь просит добавить операцию, сформируй JSON в формате:
{"action": "create_transaction", "data": {"type": "income/expense", "amount": число, "direction": "название", "description": "описание"}}
"""

    chat = LlmChat(
        api_key=api_key,
        session_id=f"wmfinance_{user_id}_{today.strftime('%Y%m%d%H%M')}",
        system_message=system_message
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")

    user_message = UserMessage(text=f"{context}\n\nВопрос пользователя: {message}")

    try:
        response = await chat.send_message(user_message)
        return {"response": response}
    except Exception as e:
        logger.error(f"AI error: {e}")
        raise HTTPException(status_code=500, detail="AI service error")
