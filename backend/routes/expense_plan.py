from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from datetime import datetime, timezone
import uuid

from database import db
from auth import get_current_user

router = APIRouter(prefix="/api")

CATEGORY_LABELS = {
    "rent": "Аренда",
    "salary": "Зарплата",
    "purchases": "Закупки",
    "utilities": "Коммунальные",
    "subscriptions": "Подписки/Сервисы",
    "other": "Прочее"
}


# === ExpensePlanMonth CRUD ===

@router.get("/expense-plans")
async def get_expense_plans(
    year: Optional[int] = None,
    month: Optional[int] = None,
    project_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {"user_id": current_user["user_id"]}
    if year:
        query["year"] = year
    if month:
        query["month"] = month
    if project_id:
        query["project_id"] = project_id

    plans = await db.expense_plans.find(query, {"_id": 0}).sort([("year", -1), ("month", -1)]).to_list(100)
    return plans


@router.get("/expense-plans/{plan_id}")
async def get_expense_plan(plan_id: str, current_user: dict = Depends(get_current_user)):
    plan = await db.expense_plans.find_one(
        {"id": plan_id, "user_id": current_user["user_id"]}, {"_id": 0}
    )
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    return plan


@router.post("/expense-plans")
async def create_expense_plan(
    year: int, month: int,
    project_id: Optional[str] = None,
    name: Optional[str] = None,
    notes: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    month_names = ["", "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
                   "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"]
    default_name = f"{month_names[month]} {year}"

    plan = {
        "id": str(uuid.uuid4()),
        "year": year,
        "month": month,
        "project_id": project_id,
        "name": name or default_name,
        "notes": notes or "",
        "user_id": current_user["user_id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    await db.expense_plans.insert_one(plan)
    return plan


@router.delete("/expense-plans/{plan_id}")
async def delete_expense_plan(plan_id: str, current_user: dict = Depends(get_current_user)):
    plan = await db.expense_plans.find_one(
        {"id": plan_id, "user_id": current_user["user_id"]}, {"_id": 0}
    )
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    await db.expense_plan_items.delete_many({"plan_month_id": plan_id})
    await db.expense_plans.delete_one({"id": plan_id})
    return {"status": "deleted"}


# === ExpensePlanItem CRUD ===

@router.get("/expense-plans/{plan_id}/items")
async def get_plan_items(plan_id: str, current_user: dict = Depends(get_current_user)):
    items = await db.expense_plan_items.find(
        {"plan_month_id": plan_id, "user_id": current_user["user_id"]}, {"_id": 0}
    ).sort("created_at", 1).to_list(500)
    return items


@router.post("/expense-plans/{plan_id}/items")
async def create_plan_item(
    plan_id: str,
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    plan = await db.expense_plans.find_one(
        {"id": plan_id, "user_id": current_user["user_id"]}, {"_id": 0}
    )
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    item = {
        "id": str(uuid.uuid4()),
        "plan_month_id": plan_id,
        "type": data.get("type", "variable"),
        "category": data.get("category", "other"),
        "description": data.get("description", ""),
        "amount_planned": float(data.get("amount_planned", 0)),
        "currency": data.get("currency", "PLN"),
        "day_in_month": data.get("day_in_month"),
        "is_recurring_every_month": data.get("is_recurring_every_month", False),
        "project_id": data.get("project_id"),
        "comment": data.get("comment", ""),
        "user_id": current_user["user_id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }

    await db.expense_plan_items.insert_one(item)

    await db.expense_plans.update_one(
        {"id": plan_id},
        {"$set": {"updated_at": datetime.now(timezone.utc).isoformat()}}
    )

    return item


@router.put("/expense-plans/items/{item_id}")
async def update_plan_item(
    item_id: str,
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    item = await db.expense_plan_items.find_one(
        {"id": item_id, "user_id": current_user["user_id"]}, {"_id": 0}
    )
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    update = {}
    for field in ["type", "category", "description", "amount_planned", "currency",
                  "day_in_month", "is_recurring_every_month", "project_id", "comment"]:
        if field in data:
            update[field] = data[field]

    if "amount_planned" in update:
        update["amount_planned"] = float(update["amount_planned"])

    update["updated_at"] = datetime.now(timezone.utc).isoformat()

    await db.expense_plan_items.update_one({"id": item_id}, {"$set": update})

    await db.expense_plans.update_one(
        {"id": item["plan_month_id"]},
        {"$set": {"updated_at": datetime.now(timezone.utc).isoformat()}}
    )

    updated = await db.expense_plan_items.find_one({"id": item_id}, {"_id": 0})
    return updated


@router.delete("/expense-plans/items/{item_id}")
async def delete_plan_item(item_id: str, current_user: dict = Depends(get_current_user)):
    item = await db.expense_plan_items.find_one(
        {"id": item_id, "user_id": current_user["user_id"]}, {"_id": 0}
    )
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    await db.expense_plan_items.delete_one({"id": item_id})
    return {"status": "deleted"}


# === Special actions ===

@router.post("/expense-plans/{plan_id}/copy-previous")
async def copy_previous_month(plan_id: str, current_user: dict = Depends(get_current_user)):
    """Copy items from the previous month's plan into this plan"""
    plan = await db.expense_plans.find_one(
        {"id": plan_id, "user_id": current_user["user_id"]}, {"_id": 0}
    )
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    prev_month = plan["month"] - 1
    prev_year = plan["year"]
    if prev_month < 1:
        prev_month = 12
        prev_year -= 1

    prev_plan = await db.expense_plans.find_one(
        {"user_id": current_user["user_id"], "year": prev_year, "month": prev_month, "project_id": plan.get("project_id")},
        {"_id": 0}
    )

    if not prev_plan:
        raise HTTPException(status_code=404, detail="Нет плана за предыдущий месяц")

    prev_items = await db.expense_plan_items.find(
        {"plan_month_id": prev_plan["id"], "user_id": current_user["user_id"]},
        {"_id": 0}
    ).to_list(500)

    if not prev_items:
        raise HTTPException(status_code=404, detail="В предыдущем месяце нет позиций")

    created = 0
    for old_item in prev_items:
        new_item = {
            "id": str(uuid.uuid4()),
            "plan_month_id": plan_id,
            "type": old_item["type"],
            "category": old_item["category"],
            "description": old_item["description"],
            "amount_planned": old_item["amount_planned"],
            "currency": old_item.get("currency", "PLN"),
            "day_in_month": old_item.get("day_in_month"),
            "is_recurring_every_month": old_item.get("is_recurring_every_month", False),
            "project_id": old_item.get("project_id"),
            "comment": old_item.get("comment", ""),
            "user_id": current_user["user_id"],
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        await db.expense_plan_items.insert_one(new_item)
        created += 1

    return {"status": "success", "copied": created}


@router.post("/expense-plans/{plan_id}/extend-recurring")
async def extend_recurring(
    plan_id: str,
    months_ahead: int = 6,
    current_user: dict = Depends(get_current_user)
):
    """Copy recurring items to the next N months"""
    plan = await db.expense_plans.find_one(
        {"id": plan_id, "user_id": current_user["user_id"]}, {"_id": 0}
    )
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    recurring_items = await db.expense_plan_items.find(
        {"plan_month_id": plan_id, "user_id": current_user["user_id"], "is_recurring_every_month": True},
        {"_id": 0}
    ).to_list(500)

    if not recurring_items:
        raise HTTPException(status_code=400, detail="Нет постоянных расходов для копирования")

    month_names = ["", "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
                   "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"]

    created_plans = 0
    created_items = 0

    cur_year = plan["year"]
    cur_month = plan["month"]

    for _ in range(months_ahead):
        cur_month += 1
        if cur_month > 12:
            cur_month = 1
            cur_year += 1

        # Find or create plan for this month
        target_plan = await db.expense_plans.find_one(
            {"user_id": current_user["user_id"], "year": cur_year, "month": cur_month, "project_id": plan.get("project_id")},
            {"_id": 0}
        )

        if not target_plan:
            target_plan = {
                "id": str(uuid.uuid4()),
                "year": cur_year,
                "month": cur_month,
                "project_id": plan.get("project_id"),
                "name": f"{month_names[cur_month]} {cur_year}",
                "notes": "",
                "user_id": current_user["user_id"],
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
            await db.expense_plans.insert_one(target_plan)
            created_plans += 1

        for old_item in recurring_items:
            # Check if already exists (avoid duplicates)
            exists = await db.expense_plan_items.find_one({
                "plan_month_id": target_plan["id"],
                "user_id": current_user["user_id"],
                "description": old_item["description"],
                "category": old_item["category"]
            })
            if exists:
                continue

            new_item = {
                "id": str(uuid.uuid4()),
                "plan_month_id": target_plan["id"],
                "type": old_item["type"],
                "category": old_item["category"],
                "description": old_item["description"],
                "amount_planned": old_item["amount_planned"],
                "currency": old_item.get("currency", "PLN"),
                "day_in_month": old_item.get("day_in_month"),
                "is_recurring_every_month": True,
                "project_id": old_item.get("project_id"),
                "comment": old_item.get("comment", ""),
                "user_id": current_user["user_id"],
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
            await db.expense_plan_items.insert_one(new_item)
            created_items += 1

    return {
        "status": "success",
        "created_plans": created_plans,
        "created_items": created_items,
        "months_ahead": months_ahead
    }


@router.get("/expense-plans/summary/all")
async def get_plans_summary(
    year: Optional[int] = None,
    current_user: dict = Depends(get_current_user)
):
    """Summary across all months for a year"""
    query = {"user_id": current_user["user_id"]}
    if year:
        query["year"] = year

    plans = await db.expense_plans.find(query, {"_id": 0}).to_list(100)

    result = []
    for plan in plans:
        items = await db.expense_plan_items.find(
            {"plan_month_id": plan["id"], "user_id": current_user["user_id"]},
            {"_id": 0}
        ).to_list(500)

        fixed_total = sum(i["amount_planned"] for i in items if i["type"] == "fixed")
        variable_total = sum(i["amount_planned"] for i in items if i["type"] == "variable")

        result.append({
            **plan,
            "items_count": len(items),
            "fixed_total": fixed_total,
            "variable_total": variable_total,
            "total": fixed_total + variable_total
        })

    return sorted(result, key=lambda x: (x["year"], x["month"]))


@router.get("/expense-plans/categories/list")
async def get_categories_list():
    return CATEGORY_LABELS
