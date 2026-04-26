"""
WM Finance — Регулярные (постоянные) расходы.
Шаблоны вида «Аренда склада 3500 zł 5-го числа каждого месяца».
Раз в месяц шедулер создаёт по ним planned_payments на следующий период.
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List
from datetime import datetime, timezone
import calendar

from database import db
from auth import get_current_user
from models import RecurringExpense, RecurringExpenseCreate, PlannedPayment

router = APIRouter(prefix="/api")


async def _hydrate(data: dict) -> dict:
    """Заполнить *_name по *_id (category, contractor, direction, account)."""
    if data.get("category_id"):
        cat = await db.categories.find_one({"id": data["category_id"]}, {"_id": 0, "name": 1})
        data["category_name"] = cat["name"] if cat else None
    if data.get("contractor_id"):
        contr = await db.contractors.find_one({"id": data["contractor_id"]}, {"_id": 0, "name": 1})
        data["contractor_name"] = contr["name"] if contr else None
    if data.get("direction_id"):
        d = await db.directions.find_one({"id": data["direction_id"]}, {"_id": 0, "name": 1})
        data["direction_name"] = d["name"] if d else None
    if data.get("account_id"):
        a = await db.accounts.find_one({"id": data["account_id"]}, {"_id": 0, "name": 1})
        data["account_name"] = a["name"] if a else None
    return data


@router.get("/recurring-expenses", response_model=List[RecurringExpense])
async def list_recurring(current_user: dict = Depends(get_current_user)):
    rows = await db.recurring_expenses.find(
        {"user_id": current_user["user_id"]},
        {"_id": 0}
    ).sort("name", 1).to_list(500)
    return rows


@router.post("/recurring-expenses", response_model=RecurringExpense)
async def create_recurring(data: RecurringExpenseCreate, current_user: dict = Depends(get_current_user)):
    payload = data.model_dump()
    payload = await _hydrate(payload)
    item = RecurringExpense(**payload, user_id=current_user["user_id"])
    await db.recurring_expenses.insert_one(item.model_dump())
    return item


@router.put("/recurring-expenses/{item_id}", response_model=RecurringExpense)
async def update_recurring(item_id: str, data: RecurringExpenseCreate, current_user: dict = Depends(get_current_user)):
    payload = data.model_dump()
    payload = await _hydrate(payload)
    result = await db.recurring_expenses.update_one(
        {"id": item_id, "user_id": current_user["user_id"]},
        {"$set": payload}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Не найдено")
    item = await db.recurring_expenses.find_one({"id": item_id}, {"_id": 0})
    return item


@router.delete("/recurring-expenses/{item_id}")
async def delete_recurring(item_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.recurring_expenses.delete_one(
        {"id": item_id, "user_id": current_user["user_id"]}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Не найдено")
    return {"status": "deleted"}


def _next_due_date(today: datetime, day_of_month: int, periodicity: str) -> str:
    """Вычислить дату следующего срока для расходного шаблона."""
    year = today.year
    month = today.month
    # Если уже прошло в этом месяце — следующий период
    if today.day >= day_of_month:
        if periodicity == "monthly":
            month += 1
        else:  # quarterly
            month += 3
        if month > 12:
            year += month // 12 if month % 12 != 0 else (month // 12) - 1
            month = ((month - 1) % 12) + 1
    last_day = calendar.monthrange(year, month)[1]
    safe_day = min(day_of_month, last_day)
    return f"{year:04d}-{month:02d}-{safe_day:02d}"


@router.post("/recurring-expenses/generate-now")
async def generate_planned_now(current_user: dict = Depends(get_current_user)):
    """Создать planned_payments для всех активных шаблонов на ближайший период (если ещё нет)."""
    today = datetime.now(timezone.utc)
    rows = await db.recurring_expenses.find(
        {"user_id": current_user["user_id"], "is_active": True},
        {"_id": 0}
    ).to_list(500)

    created = 0
    for r in rows:
        due_date = _next_due_date(today, int(r.get("day_of_month", 1)), r.get("periodicity", "monthly"))
        # Проверяем не создан ли уже planned payment на эту дату для этого шаблона
        existing = await db.planned_payments.find_one({
            "user_id": current_user["user_id"],
            "date": due_date,
            "category_id": r.get("category_id"),
            "amount": r.get("amount"),
            "comment": {"$regex": r.get("name", ""), "$options": "i"} if r.get("name") else None,
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
            user_id=current_user["user_id"],
        )
        await db.planned_payments.insert_one(payment.model_dump())
        created += 1

    return {"status": "ok", "created": created, "total_templates": len(rows)}


# ===== Suggest matches between a planned payment and existing transactions =====

@router.get("/planned-payments/{payment_id}/suggest-matches")
async def suggest_matches(payment_id: str, current_user: dict = Depends(get_current_user)):
    """Предлагает транзакции-кандидаты для сверки с плановым платежом."""
    payment = await db.planned_payments.find_one(
        {"id": payment_id, "user_id": current_user["user_id"]},
        {"_id": 0}
    )
    if not payment:
        raise HTTPException(status_code=404, detail="Плановый платёж не найден")

    pay_date = datetime.strptime(payment["date"], "%Y-%m-%d")
    # Окно ±10 дней
    from datetime import timedelta
    date_from = (pay_date - timedelta(days=10)).strftime("%Y-%m-%d")
    date_to = (pay_date + timedelta(days=10)).strftime("%Y-%m-%d")

    amount = float(payment["amount"])
    amt_min = amount * 0.85
    amt_max = amount * 1.15

    query = {
        "user_id": current_user["user_id"],
        "status": "fact",
        "type": payment["type"],
        "date": {"$gte": date_from, "$lte": date_to},
        "amount": {"$gte": amt_min, "$lte": amt_max},
    }
    if payment.get("category_id"):
        query["$or"] = [
            {"category_id": payment["category_id"]},
            {"category_id": None}
        ]

    candidates = await db.transactions.find(query, {"_id": 0}).sort("date", 1).to_list(20)

    # Score by closeness of amount and date
    def score(t):
        amt_diff = abs(t["amount"] - amount) / max(amount, 1)
        try:
            t_date = datetime.strptime(t["date"], "%Y-%m-%d")
            day_diff = abs((t_date - pay_date).days)
        except Exception:
            day_diff = 30
        cat_match = 1 if (t.get("category_id") and t.get("category_id") == payment.get("category_id")) else 0
        return (amt_diff * 100) + day_diff - (cat_match * 5)

    candidates.sort(key=score)
    return {"payment": payment, "candidates": candidates[:5]}


@router.post("/planned-payments/{payment_id}/link-transaction")
async def link_to_transaction(
    payment_id: str,
    body: dict,
    current_user: dict = Depends(get_current_user),
):
    """Привязать существующую транзакцию к плановому платежу и пометить как paid."""
    transaction_id = body.get("transaction_id")
    if not transaction_id:
        raise HTTPException(status_code=400, detail="Не указан transaction_id")

    tx = await db.transactions.find_one(
        {"id": transaction_id, "user_id": current_user["user_id"]},
        {"_id": 0, "id": 1}
    )
    if not tx:
        raise HTTPException(status_code=404, detail="Транзакция не найдена")

    result = await db.planned_payments.update_one(
        {"id": payment_id, "user_id": current_user["user_id"]},
        {"$set": {"status": "paid", "linked_transaction_id": transaction_id}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Плановый платёж не найден")
    return {"status": "linked", "transaction_id": transaction_id}


@router.post("/planned-payments/{payment_id}/unlink-transaction")
async def unlink_transaction(payment_id: str, current_user: dict = Depends(get_current_user)):
    """Отвязать транзакцию от планового платежа и вернуть в pending."""
    result = await db.planned_payments.update_one(
        {"id": payment_id, "user_id": current_user["user_id"]},
        {"$set": {"status": "pending", "linked_transaction_id": None}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Не найдено")
    return {"status": "unlinked"}
