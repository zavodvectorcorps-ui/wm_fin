"""
WM Finance — Demo read-only mode.

Provides a demo user with pre-seeded fake data.
Users with role='demo' can GET anything but cannot modify (POST/PUT/PATCH/DELETE are blocked).
"""
import logging
import random
from datetime import datetime, timezone, timedelta

import jwt
from fastapi import APIRouter, HTTPException

from database import db
from auth import JWT_SECRET, JWT_ALGORITHM, create_token

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth")

DEMO_USER_ID = "demo-user-readonly"
DEMO_EMAIL = "demo@wm-finance.pl"

# Paths that demo users CAN call with write methods (own token management only)
DEMO_WRITE_ALLOWLIST = {
    "/api/auth/logout",
}


def is_demo_user_from_token(authorization_header: str | None) -> bool:
    """Check if request carries a demo JWT."""
    if not authorization_header or not authorization_header.startswith("Bearer "):
        return False
    token = authorization_header[7:]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload.get("role") == "demo"
    except Exception:
        return False


async def ensure_demo_data():
    """Create demo user + seed realistic fake data if not already present."""
    existing = await db.users.find_one({"id": DEMO_USER_ID}, {"_id": 0, "id": 1})
    if existing:
        # Already seeded
        return

    now = datetime.now(timezone.utc)

    # ---- User ----
    await db.users.insert_one({
        "id": DEMO_USER_ID,
        "email": DEMO_EMAIL,
        "name": "Demo User",
        "role": "demo",
        "is_active": True,
        "created_at": now.isoformat(),
        "password_hash": "",  # Cannot log in via password
    })

    # ---- Directions ----
    directions = [
        {"id": "dir-demo-1", "name": "Теплицы", "color": "#10b981", "user_id": DEMO_USER_ID, "is_active": True},
        {"id": "dir-demo-2", "name": "Сауны", "color": "#f59e0b", "user_id": DEMO_USER_ID, "is_active": True},
        {"id": "dir-demo-3", "name": "Купели", "color": "#3b82f6", "user_id": DEMO_USER_ID, "is_active": True},
    ]
    await db.directions.insert_many(directions)

    # ---- Accounts ----
    accounts = [
        {"id": "acc-demo-1", "name": "Nest Bank EUR", "currency": "EUR", "type": "bank",
         "current_balance": 12800.0, "user_id": DEMO_USER_ID, "is_active": True},
        {"id": "acc-demo-2", "name": "mBank PLN", "currency": "PLN", "type": "bank",
         "current_balance": 48500.0, "user_id": DEMO_USER_ID, "is_active": True},
        {"id": "acc-demo-3", "name": "Касса PLN", "currency": "PLN", "type": "cash",
         "current_balance": 3200.0, "user_id": DEMO_USER_ID, "is_active": True},
    ]
    await db.accounts.insert_many(accounts)

    # ---- Categories ----
    categories_data = [
        # Income
        ("cat-inc-1", "Выручка теплицы", "income", "Выручка", False),
        ("cat-inc-2", "Выручка сауны", "income", "Выручка", False),
        ("cat-inc-3", "Продажа купелей", "income", "Выручка", False),
        # Expense - fixed
        ("cat-exp-1", "Аренда склада", "expense", "Операционные", True),
        ("cat-exp-2", "Зарплата", "expense", "ФОТ", True),
        ("cat-exp-3", "Интернет / связь", "expense", "Операционные", True),
        ("cat-exp-4", "Налоги", "expense", "Налоги", True),
        ("cat-exp-5", "CRM / софт", "expense", "Операционные", True),
        # Expense - variable
        ("cat-exp-6", "Закупка материалов", "expense", "Себестоимость", False),
        ("cat-exp-7", "Логистика", "expense", "Себестоимость", False),
        ("cat-exp-8", "Реклама", "expense", "Маркетинг", False),
    ]
    categories = []
    for cid, name, type_, group, is_fixed in categories_data:
        categories.append({
            "id": cid, "name": name, "type": type_, "group": group,
            "is_fixed_cost": is_fixed, "is_active": True, "user_id": DEMO_USER_ID,
        })
    await db.categories.insert_many(categories)

    # ---- Contractors ----
    contractors = [
        {"id": f"ctr-demo-{i}", "name": n, "type": t, "user_id": DEMO_USER_ID, "is_active": True}
        for i, (n, t) in enumerate([
            ("ООО Зелёный Мир", "client"),
            ("Spa Wellness Sp. z o.o.", "client"),
            ("Orange Polska", "supplier"),
            ("Warehouse Lublin", "supplier"),
            ("Google Ads", "supplier"),
        ], start=1)
    ]
    await db.contractors.insert_many(contractors)

    # ---- Employees ----
    employees = [
        {"id": "emp-demo-1", "name": "Анна Ковалик", "position": "Менеджер теплиц",
         "default_salary": 5500, "currency": "PLN", "direction_id": "dir-demo-1",
         "direction_name": "Теплицы", "is_active": True, "user_id": DEMO_USER_ID,
         "created_at": now.isoformat()},
        {"id": "emp-demo-2", "name": "Павел Новак", "position": "Мастер саун",
         "default_salary": 6200, "currency": "PLN", "direction_id": "dir-demo-2",
         "direction_name": "Сауны", "is_active": True, "user_id": DEMO_USER_ID,
         "created_at": now.isoformat()},
        {"id": "emp-demo-3", "name": "Иван Сидоров", "position": "Сборщик купелей",
         "default_salary": 5800, "currency": "PLN", "direction_id": "dir-demo-3",
         "direction_name": "Купели", "is_active": True, "user_id": DEMO_USER_ID,
         "created_at": now.isoformat()},
    ]
    await db.employees.insert_many(employees)

    # ---- Transactions (last 90 days) ----
    transactions = []
    for days_back in range(90):
        day = now - timedelta(days=days_back)
        date_str = day.strftime("%Y-%m-%d")

        # 1-3 transactions per day
        for _ in range(random.randint(1, 3)):
            type_ = random.choices(["income", "expense"], weights=[35, 65])[0]
            if type_ == "income":
                cat = random.choice(categories[:3])
                contractor = random.choice(contractors[:2])
                amount = round(random.uniform(1500, 12000), 2)
            else:
                cat = random.choice(categories[3:])
                contractor = random.choice(contractors[2:])
                amount = round(random.uniform(100, 4500), 2)

            direction = random.choice(directions)
            account = random.choice(accounts)

            tx = {
                "id": f"tx-demo-{len(transactions)}",
                "date": date_str,
                "type": type_,
                "amount": amount,
                "amount_base": amount if account["currency"] == "PLN" else round(amount * 4.35, 2),
                "currency": account["currency"],
                "account_id": account["id"],
                "account_name": account["name"],
                "category_id": cat["id"],
                "category_name": cat["name"],
                "direction_id": direction["id"],
                "direction_name": direction["name"],
                "contractor_id": contractor["id"],
                "contractor_name": contractor["name"],
                "description": f"{cat['name']} — {contractor['name']}",
                "status": "fact",
                "needs_review": False,
                "user_id": DEMO_USER_ID,
                "created_at": day.isoformat(),
            }
            transactions.append(tx)

    if transactions:
        await db.transactions.insert_many(transactions)

    # ---- Recurring expenses ----
    recurring = [
        {"id": "rec-demo-1", "name": "Аренда склада", "category_id": "cat-exp-1",
         "category_name": "Аренда склада", "direction_id": "dir-demo-1", "direction_name": "Теплицы",
         "account_id": "acc-demo-2", "account_name": "mBank PLN",
         "amount": 3500, "currency": "PLN", "periodicity": "monthly", "day_of_month": 5,
         "is_active": True, "user_id": DEMO_USER_ID, "created_at": now.isoformat()},
        {"id": "rec-demo-2", "name": "Интернет офис", "category_id": "cat-exp-3",
         "category_name": "Интернет / связь", "direction_id": "dir-demo-2", "direction_name": "Сауны",
         "account_id": "acc-demo-2", "account_name": "mBank PLN",
         "amount": 180, "currency": "PLN", "periodicity": "monthly", "day_of_month": 10,
         "is_active": True, "user_id": DEMO_USER_ID, "created_at": now.isoformat()},
        {"id": "rec-demo-3", "name": "CRM HubSpot", "category_id": "cat-exp-5",
         "category_name": "CRM / софт", "direction_id": "dir-demo-1", "direction_name": "Теплицы",
         "account_id": "acc-demo-1", "account_name": "Nest Bank EUR",
         "amount": 89, "currency": "EUR", "periodicity": "monthly", "day_of_month": 15,
         "is_active": True, "user_id": DEMO_USER_ID, "created_at": now.isoformat()},
    ]
    await db.recurring_expenses.insert_many(recurring)

    # ---- Salary accruals (current + previous month) ----
    cur_month = now.strftime("%Y-%m")
    prev_month = (now.replace(day=1) - timedelta(days=1)).strftime("%Y-%m")
    accruals = []
    for m_idx, month in enumerate([prev_month, cur_month]):
        for e in employees:
            accruals.append({
                "id": f"acc-demo-{month}-{e['id']}",
                "month": month,
                "employee_id": e["id"],
                "employee_name": e["name"],
                "direction_id": e["direction_id"],
                "direction_name": e["direction_name"],
                "salary": e["default_salary"],
                "bonus": random.choice([0, 300, 500]),
                "deductions": 0,
                "total_due": e["default_salary"] + random.choice([0, 300, 500]),
                "currency": "PLN",
                "status": "paid" if m_idx == 0 else "planned",
                "user_id": DEMO_USER_ID,
                "created_at": now.isoformat(),
            })
    await db.salary_accruals.insert_many(accruals)

    logger.info(f"Demo data seeded for {DEMO_USER_ID}: {len(transactions)} tx, {len(accruals)} salaries")


@router.post("/demo-login")
async def demo_login():
    """Auto-login endpoint: creates demo data on first call, returns a read-only JWT."""
    await ensure_demo_data()
    token = create_token(DEMO_USER_ID, DEMO_EMAIL, "demo")
    return {
        "token": token,
        "user": {
            "id": DEMO_USER_ID,
            "email": DEMO_EMAIL,
            "name": "Demo User (read-only)",
            "role": "demo",
        },
        "message": "Demo mode — read-only access"
    }
