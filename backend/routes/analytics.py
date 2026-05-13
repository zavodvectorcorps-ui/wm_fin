from fastapi import APIRouter, Depends, Query
from typing import Optional
from datetime import datetime, timezone, timedelta

from database import db
from auth import get_current_user

router = APIRouter(prefix="/api")


async def _get_loan_account_ids(user_id: str) -> list:
    """Return list of account ids marked as loan/liability for the given user."""
    loans = await db.accounts.find(
        {"user_id": user_id, "is_loan": True},
        {"_id": 0, "id": 1}
    ).to_list(None)
    return [a["id"] for a in loans]


def _not_loan_op(t: dict, loan_ids: list) -> bool:
    """True if a transaction doesn't involve any loan account."""
    if not loan_ids:
        return True
    if t.get("account_id") in loan_ids:
        return False
    if t.get("to_account_id") in loan_ids:
        return False
    return True


@router.get("/analytics/summary")
async def get_analytics_summary(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    direction_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {"user_id": current_user["user_id"], "status": "fact"}

    if date_from:
        query["date"] = {"$gte": date_from}
    if date_to:
        if "date" in query:
            query["date"]["$lte"] = date_to
        else:
            query["date"] = {"$lte": date_to}
    if direction_id:
        query["direction_id"] = direction_id

    transactions = await db.transactions.find(query, {"_id": 0}).to_list(10000)
    loan_ids = await _get_loan_account_ids(current_user["user_id"])
    # Exclude operations on loan accounts from PnL/income/expense aggregations
    transactions = [t for t in transactions if _not_loan_op(t, loan_ids)]

    # Helper: get amount in account's currency
    def base_amount(t):
        return t.get("amount_base") if t.get("amount_base") is not None else t["amount"]

    total_income = sum(base_amount(t) for t in transactions if t["type"] == "income")
    total_expense = sum(base_amount(t) for t in transactions if t["type"] == "expense")
    profit = total_income - total_expense

    by_direction = {}
    for t in transactions:
        dir_name = t.get("direction_name", "Общее")
        if dir_name not in by_direction:
            by_direction[dir_name] = {"income": 0, "expense": 0, "profit": 0}
        if t["type"] == "income":
            by_direction[dir_name]["income"] += base_amount(t)
        elif t["type"] == "expense":
            by_direction[dir_name]["expense"] += base_amount(t)
        by_direction[dir_name]["profit"] = by_direction[dir_name]["income"] - by_direction[dir_name]["expense"]

    income_by_category = {}
    expense_by_category = {}
    for t in transactions:
        cat_name = t.get("category_name", "Без категории")
        if t["type"] == "income":
            income_by_category[cat_name] = income_by_category.get(cat_name, 0) + base_amount(t)
        elif t["type"] == "expense":
            expense_by_category[cat_name] = expense_by_category.get(cat_name, 0) + base_amount(t)

    accounts = await db.accounts.find({"user_id": current_user["user_id"], "is_active": True}, {"_id": 0}).to_list(100)

    # Get exchange rate for total balance calculation
    eur_rate = 0
    try:
        from routes.exchange_rate import get_nbp_rate
        eur_rate = await get_nbp_rate()
    except Exception:
        pass

    total_balance = 0
    for a in accounts:
        bal = a.get("current_balance", 0)
        if a.get("currency") == "EUR" and eur_rate > 0:
            total_balance += bal * eur_rate
        else:
            total_balance += bal

    # Per-account income/expense for the period (using amount_base)
    account_stats = {}
    for t in transactions:
        acc_id = t.get("account_id", "")
        if acc_id not in account_stats:
            account_stats[acc_id] = {"income": 0, "expense": 0}
        amt = base_amount(t)
        if t["type"] == "income":
            account_stats[acc_id]["income"] += amt
        elif t["type"] == "expense":
            account_stats[acc_id]["expense"] += amt
        elif t["type"] == "transfer":
            # Outgoing transfer is expense for source account
            account_stats[acc_id]["expense"] += amt
            # Incoming transfer is income for target account
            to_acc = t.get("to_account_id")
            if to_acc:
                if to_acc not in account_stats:
                    account_stats[to_acc] = {"income": 0, "expense": 0}
                # Use to_amount_base for target account
                to_amt = t.get("to_amount_base") if t.get("to_amount_base") is not None else amt
                account_stats[to_acc]["income"] += to_amt

    for a in accounts:
        stats = account_stats.get(a["id"], {"income": 0, "expense": 0})
        a["period_income"] = stats["income"]
        a["period_expense"] = stats["expense"]
        a["period_net"] = stats["income"] - stats["expense"]

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    upcoming_payments = await db.planned_payments.find(
        {"user_id": current_user["user_id"], "status": {"$in": ["pending", "overdue"]}, "date": {"$gte": today}},
        {"_id": 0}
    ).sort("date", 1).limit(5).to_list(5)

    overdue_payments = await db.planned_payments.find(
        {"user_id": current_user["user_id"], "status": "overdue"},
        {"_id": 0}
    ).to_list(100)

    return {
        "total_income": total_income,
        "total_expense": total_expense,
        "profit": profit,
        "total_balance": total_balance,
        "by_direction": by_direction,
        "income_by_category": income_by_category,
        "expense_by_category": expense_by_category,
        "accounts": accounts,
        "upcoming_payments": upcoming_payments,
        "overdue_payments": overdue_payments
    }


@router.get("/analytics/runway")
async def get_runway(current_user: dict = Depends(get_current_user)):
    """
    «На сколько месяцев хватит денег» по постоянным расходам.
    Берёт средние расходы по категориям с is_fixed_cost=True за последние 3 полных месяца
    и делит на них общий остаток (в базовой валюте PLN).
    """
    user_id = current_user["user_id"]

    # Get fixed-cost category ids
    fixed_categories = await db.categories.find(
        {"user_id": user_id, "is_fixed_cost": True, "type": "expense", "is_active": True},
        {"_id": 0, "id": 1, "name": 1, "group": 1}
    ).to_list(500)
    fixed_cat_ids = [c["id"] for c in fixed_categories]

    # Period: last 3 full calendar months, ending yesterday
    now = datetime.now(timezone.utc)
    end = now.replace(day=1) - timedelta(days=1)
    start = (end.replace(day=1) - timedelta(days=1)).replace(day=1)
    start = (start.replace(day=1) - timedelta(days=1)).replace(day=1)
    date_from = start.strftime("%Y-%m-%d")
    date_to = end.strftime("%Y-%m-%d")

    # Per-category 3-month sum
    per_category = {}
    total_3m = 0.0
    if fixed_cat_ids:
        txs = await db.transactions.find(
            {
                "user_id": user_id,
                "status": "fact",
                "type": "expense",
                "category_id": {"$in": fixed_cat_ids},
                "date": {"$gte": date_from, "$lte": date_to},
            },
            {"_id": 0, "category_id": 1, "category_name": 1, "amount_base": 1, "amount": 1}
        ).to_list(50000)

        for t in txs:
            amt = t.get("amount_base") if t.get("amount_base") is not None else t.get("amount", 0)
            cat_name = t.get("category_name", "Без категории")
            per_category[cat_name] = per_category.get(cat_name, 0) + amt
            total_3m += amt

    avg_monthly_burn = round(total_3m / 3, 2) if total_3m else 0

    # Total balance in PLN (same logic as summary endpoint)
    accounts = await db.accounts.find(
        {"user_id": user_id, "is_active": True},
        {"_id": 0, "currency": 1, "current_balance": 1}
    ).to_list(100)

    eur_rate = 0
    try:
        from routes.exchange_rate import get_nbp_rate
        eur_rate = await get_nbp_rate()
    except Exception:
        pass

    total_balance = 0.0
    for a in accounts:
        bal = a.get("current_balance", 0) or 0
        if a.get("currency") == "EUR" and eur_rate > 0:
            total_balance += bal * eur_rate
        else:
            total_balance += bal

    runway_months = round(total_balance / avg_monthly_burn, 1) if avg_monthly_burn > 0 else None

    top_categories = sorted(
        [{"name": k, "amount_3m": round(v, 2), "avg_monthly": round(v / 3, 2)} for k, v in per_category.items()],
        key=lambda x: x["avg_monthly"],
        reverse=True
    )[:10]

    return {
        "total_balance": round(total_balance, 2),
        "avg_monthly_burn": avg_monthly_burn,
        "runway_months": runway_months,
        "fixed_categories_count": len(fixed_categories),
        "period": {"from": date_from, "to": date_to},
        "top_categories": top_categories,
    }


@router.get("/analytics/fixed-costs-month")
async def get_fixed_costs_month(
    month: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Постоянные расходы за конкретный месяц (для виджета на дашборде)."""
    user_id = current_user["user_id"]

    if not month:
        month = datetime.now(timezone.utc).strftime("%Y-%m")

    fixed_categories = await db.categories.find(
        {"user_id": user_id, "is_fixed_cost": True, "type": "expense", "is_active": True},
        {"_id": 0, "id": 1, "name": 1}
    ).to_list(500)
    fixed_cat_ids = [c["id"] for c in fixed_categories]
    if not fixed_cat_ids:
        return {"month": month, "total": 0, "by_category": []}

    date_from = f"{month}-01"
    # last day of month
    y, m = map(int, month.split("-"))
    if m == 12:
        date_to = f"{y+1}-01-01"
    else:
        date_to = f"{y}-{m+1:02d}-01"

    txs = await db.transactions.find(
        {
            "user_id": user_id,
            "status": "fact",
            "type": "expense",
            "category_id": {"$in": fixed_cat_ids},
            "date": {"$gte": date_from, "$lt": date_to},
        },
        {"_id": 0, "category_name": 1, "amount_base": 1, "amount": 1}
    ).to_list(50000)

    per_cat = {}
    total = 0.0
    for t in txs:
        amt = t.get("amount_base") if t.get("amount_base") is not None else t.get("amount", 0)
        cat = t.get("category_name", "Без категории")
        per_cat[cat] = per_cat.get(cat, 0) + amt
        total += amt

    by_category = sorted(
        [{"name": k, "amount": round(v, 2)} for k, v in per_cat.items()],
        key=lambda x: x["amount"],
        reverse=True
    )

    return {
        "month": month,
        "total": round(total, 2),
        "by_category": by_category,
    }


@router.get("/analytics/daily-balance")
async def get_daily_balance(
    date_from: str,
    date_to: str,
    current_user: dict = Depends(get_current_user)
):
    transactions = await db.transactions.find(
        {
            "user_id": current_user["user_id"],
            "status": "fact",
            "date": {"$gte": date_from, "$lte": date_to}
        },
        {"_id": 0}
    ).sort("date", 1).to_list(10000)

    accounts = await db.accounts.find({"user_id": current_user["user_id"], "is_active": True}, {"_id": 0}).to_list(100)

    prev_transactions = await db.transactions.find(
        {
            "user_id": current_user["user_id"],
            "status": "fact",
            "date": {"$lt": date_from}
        },
        {"_id": 0}
    ).to_list(10000)

    initial_balance = sum(a.get("initial_balance", 0) for a in accounts)
    for t in prev_transactions:
        amt = t.get("amount_base") if t.get("amount_base") is not None else t["amount"]
        if t["type"] == "income":
            initial_balance += amt
        elif t["type"] == "expense":
            initial_balance -= amt

    daily = {}
    running_balance = initial_balance

    start = datetime.strptime(date_from, "%Y-%m-%d")
    end = datetime.strptime(date_to, "%Y-%m-%d")
    current = start

    while current <= end:
        date_str = current.strftime("%Y-%m-%d")
        daily[date_str] = {"date": date_str, "balance": running_balance, "income": 0, "expense": 0}
        current += timedelta(days=1)

    for t in transactions:
        date_str = t["date"]
        if date_str in daily:
            amt = t.get("amount_base") if t.get("amount_base") is not None else t["amount"]
            if t["type"] == "income":
                daily[date_str]["income"] += amt
                running_balance += amt
            elif t["type"] == "expense":
                daily[date_str]["expense"] += amt
                running_balance -= amt
            daily[date_str]["balance"] = running_balance

    running_balance = initial_balance
    result = []
    for date_str in sorted(daily.keys()):
        running_balance += daily[date_str]["income"] - daily[date_str]["expense"]
        daily[date_str]["balance"] = running_balance
        result.append(daily[date_str])

    return result


@router.get("/analytics/monthly")
async def get_monthly_analytics(
    year: int,
    current_user: dict = Depends(get_current_user)
):
    transactions = await db.transactions.find(
        {
            "user_id": current_user["user_id"],
            "status": "fact",
            "date": {"$gte": f"{year}-01-01", "$lte": f"{year}-12-31"}
        },
        {"_id": 0}
    ).to_list(10000)

    months = {}
    for i in range(1, 13):
        month_key = f"{year}-{str(i).zfill(2)}"
        months[month_key] = {"month": month_key, "income": 0, "expense": 0, "profit": 0}

    for t in transactions:
        month_key = t["date"][:7]
        if month_key in months:
            amt = t.get("amount_base") if t.get("amount_base") is not None else t["amount"]
            if t["type"] == "income":
                months[month_key]["income"] += amt
            elif t["type"] == "expense":
                months[month_key]["expense"] += amt
            months[month_key]["profit"] = months[month_key]["income"] - months[month_key]["expense"]

    return list(months.values())


@router.get("/analytics/pnl")
async def get_pnl_report(
    date_from: str,
    date_to: str,
    direction_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {
        "user_id": current_user["user_id"],
        "status": "fact",
        "date": {"$gte": date_from, "$lte": date_to}
    }

    if direction_id:
        query["direction_id"] = direction_id

    transactions = await db.transactions.find(query, {"_id": 0}).to_list(10000)
    loan_ids = await _get_loan_account_ids(current_user["user_id"])
    transactions = [t for t in transactions if _not_loan_op(t, loan_ids)]
    categories = await db.categories.find({"user_id": current_user["user_id"]}, {"_id": 0}).to_list(100)

    income_groups = {}
    expense_groups = {}

    for cat in categories:
        group = cat["group"]
        if cat["type"] == "income":
            if group not in income_groups:
                income_groups[group] = {"items": {}, "total": 0}
            income_groups[group]["items"][cat["name"]] = 0
        else:
            if group not in expense_groups:
                expense_groups[group] = {"items": {}, "total": 0}
            expense_groups[group]["items"][cat["name"]] = 0

    total_income = 0
    total_expense = 0

    for t in transactions:
        cat_name = t.get("category_name", "Без категории")
        cat = next((c for c in categories if c["name"] == cat_name), None)
        amt = t.get("amount_base") if t.get("amount_base") is not None else t["amount"]

        if t["type"] == "income":
            total_income += amt
            if cat:
                group = cat["group"]
                if group in income_groups:
                    income_groups[group]["items"][cat_name] = income_groups[group]["items"].get(cat_name, 0) + amt
                    income_groups[group]["total"] += amt
        elif t["type"] == "expense":
            total_expense += amt
            if cat:
                group = cat["group"]
                if group in expense_groups:
                    expense_groups[group]["items"][cat_name] = expense_groups[group]["items"].get(cat_name, 0) + amt
                    expense_groups[group]["total"] += amt

    return {
        "period": {"from": date_from, "to": date_to},
        "income": {"total": total_income, "groups": income_groups},
        "expense": {"total": total_expense, "groups": expense_groups},
        "gross_profit": total_income - total_expense,
        "net_profit": total_income - total_expense
    }


@router.get("/analytics/cashflow")
async def get_cashflow_report(
    year: int,
    direction_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {
        "user_id": current_user["user_id"],
        "status": "fact",
        "date": {"$gte": f"{year}-01-01", "$lte": f"{year}-12-31"}
    }

    if direction_id:
        query["direction_id"] = direction_id

    transactions = await db.transactions.find(query, {"_id": 0}).to_list(10000)
    loan_ids = await _get_loan_account_ids(current_user["user_id"])
    transactions = [t for t in transactions if _not_loan_op(t, loan_ids)]

    months = []
    for i in range(1, 13):
        months.append({
            "month": f"{year}-{str(i).zfill(2)}",
            "income": 0,
            "expense": 0,
            "net": 0,
            "by_category": {}
        })

    for t in transactions:
        month_idx = int(t["date"][5:7]) - 1
        cat_name = t.get("category_name", "Без категории")
        amt = t.get("amount_base") if t.get("amount_base") is not None else t["amount"]

        if t["type"] == "income":
            months[month_idx]["income"] += amt
        elif t["type"] == "expense":
            months[month_idx]["expense"] += amt

        if cat_name not in months[month_idx]["by_category"]:
            months[month_idx]["by_category"][cat_name] = 0

        signed_amt = amt if t["type"] == "income" else -amt
        months[month_idx]["by_category"][cat_name] += signed_amt
        months[month_idx]["net"] = months[month_idx]["income"] - months[month_idx]["expense"]

    return {
        "year": year,
        "months": months,
        "total_income": sum(m["income"] for m in months),
        "total_expense": sum(m["expense"] for m in months),
        "net_cashflow": sum(m["net"] for m in months)
    }


@router.get("/analytics/balance")
async def get_balance_report(
    date_to: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    if not date_to:
        date_to = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    accounts = await db.accounts.find(
        {"user_id": current_user["user_id"], "is_active": True},
        {"_id": 0}
    ).to_list(100)

    assets = {"cash": [], "checking": [], "card": [], "savings": []}
    total_by_currency = {}

    for account in accounts:
        acc_type = account.get("type", "checking")
        currency = account.get("currency", "PLN")
        balance = account.get("current_balance", 0)

        assets[acc_type].append({
            "name": account["name"],
            "balance": balance,
            "currency": currency,
            "bank": account.get("bank")
        })

        if currency not in total_by_currency:
            total_by_currency[currency] = 0
        total_by_currency[currency] += balance

    total_assets = sum(a.get("current_balance", 0) for a in accounts)

    pending_expenses = await db.planned_payments.find(
        {"user_id": current_user["user_id"], "type": "expense", "status": {"$in": ["pending", "overdue"]}},
        {"_id": 0}
    ).to_list(500)

    pending_income = await db.planned_payments.find(
        {"user_id": current_user["user_id"], "type": "income", "status": {"$in": ["pending", "overdue"]}},
        {"_id": 0}
    ).to_list(500)

    total_liabilities = sum(p["amount"] for p in pending_expenses)
    total_receivables = sum(p["amount"] for p in pending_income)

    return {
        "date": date_to,
        "assets": {
            "cash": assets["cash"],
            "checking": assets["checking"],
            "card": assets["card"],
            "savings": assets["savings"],
            "total": total_assets,
            "by_currency": total_by_currency
        },
        "liabilities": {"pending_payments": pending_expenses[:20], "total": total_liabilities},
        "receivables": {"pending_income": pending_income[:20], "total": total_receivables},
        "net_worth": total_assets - total_liabilities + total_receivables
    }


@router.get("/analytics/expense-analysis")
async def get_expense_analysis(
    date_from: str,
    date_to: str,
    direction_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {
        "user_id": current_user["user_id"],
        "status": "fact",
        "type": "expense",
        "date": {"$gte": date_from, "$lte": date_to}
    }

    if direction_id:
        query["direction_id"] = direction_id

    transactions = await db.transactions.find(query, {"_id": 0}).to_list(10000)

    by_category = {}
    by_direction = {}
    by_contractor = {}
    daily_expenses = {}

    for t in transactions:
        cat_name = t.get("category_name", "Без категории")
        dir_name = t.get("direction_name", "Общее")
        contractor = t.get("contractor_name", "Без контрагента")
        date = t["date"]
        amount = t.get("amount_base") if t.get("amount_base") is not None else t["amount"]

        if cat_name not in by_category:
            by_category[cat_name] = {"amount": 0, "count": 0}
        by_category[cat_name]["amount"] += amount
        by_category[cat_name]["count"] += 1

        if dir_name not in by_direction:
            by_direction[dir_name] = {"amount": 0, "count": 0}
        by_direction[dir_name]["amount"] += amount
        by_direction[dir_name]["count"] += 1

        if contractor not in by_contractor:
            by_contractor[contractor] = {"amount": 0, "count": 0}
        by_contractor[contractor]["amount"] += amount
        by_contractor[contractor]["count"] += 1

        if date not in daily_expenses:
            daily_expenses[date] = 0
        daily_expenses[date] += amount

    total_expense = sum(t.get("amount_base") if t.get("amount_base") is not None else t["amount"] for t in transactions)

    top_categories = sorted(by_category.items(), key=lambda x: x[1]["amount"], reverse=True)[:15]
    top_contractors = sorted(by_contractor.items(), key=lambda x: x[1]["amount"], reverse=True)[:10]

    days = (datetime.strptime(date_to, "%Y-%m-%d") - datetime.strptime(date_from, "%Y-%m-%d")).days + 1
    daily_average = total_expense / max(days, 1)

    return {
        "period": {"from": date_from, "to": date_to},
        "total_expense": total_expense,
        "daily_average": daily_average,
        "transaction_count": len(transactions),
        "by_category": [{"name": k, **v, "percent": (v["amount"]/total_expense*100) if total_expense > 0 else 0} for k, v in top_categories],
        "by_direction": [{"name": k, **v, "percent": (v["amount"]/total_expense*100) if total_expense > 0 else 0} for k, v in by_direction.items()],
        "top_contractors": [{"name": k, **v} for k, v in top_contractors],
        "daily_trend": [{"date": k, "amount": v} for k, v in sorted(daily_expenses.items())]
    }


@router.get("/analytics/profitability")
async def get_profitability_report(
    date_from: str,
    date_to: str,
    current_user: dict = Depends(get_current_user)
):
    query = {
        "user_id": current_user["user_id"],
        "status": "fact",
        "date": {"$gte": date_from, "$lte": date_to}
    }

    transactions = await db.transactions.find(query, {"_id": 0}).to_list(10000)
    directions = await db.directions.find({"user_id": current_user["user_id"], "is_active": True}, {"_id": 0}).to_list(20)

    by_direction = {}
    for d in directions:
        by_direction[d["name"]] = {
            "id": d["id"],
            "color": d.get("color", "gray"),
            "income": 0, "expense": 0, "profit": 0, "margin": 0, "transactions": 0
        }

    for t in transactions:
        dir_name = t.get("direction_name", "Общее")
        if dir_name not in by_direction:
            by_direction[dir_name] = {
                "id": None, "color": "gray",
                "income": 0, "expense": 0, "profit": 0, "margin": 0, "transactions": 0
            }

        by_direction[dir_name]["transactions"] += 1

        if t["type"] == "income":
            by_direction[dir_name]["income"] += t.get("amount_base") if t.get("amount_base") is not None else t["amount"]
        elif t["type"] == "expense":
            by_direction[dir_name]["expense"] += t.get("amount_base") if t.get("amount_base") is not None else t["amount"]

    for name, data in by_direction.items():
        data["profit"] = data["income"] - data["expense"]
        data["margin"] = (data["profit"] / data["income"] * 100) if data["income"] > 0 else 0

    sorted_directions = sorted(by_direction.items(), key=lambda x: x[1]["profit"], reverse=True)

    total_income = sum(d[1]["income"] for d in sorted_directions)
    total_expense = sum(d[1]["expense"] for d in sorted_directions)
    total_profit = total_income - total_expense
    overall_margin = (total_profit / total_income * 100) if total_income > 0 else 0

    return {
        "period": {"from": date_from, "to": date_to},
        "by_direction": [{"name": k, **v} for k, v in sorted_directions],
        "totals": {
            "income": total_income,
            "expense": total_expense,
            "profit": total_profit,
            "margin": overall_margin
        }
    }


@router.get("/analytics/top-contractors")
async def get_top_contractors(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    limit: int = 10,
    current_user: dict = Depends(get_current_user)
):
    if not date_from:
        date_from = (datetime.now(timezone.utc) - timedelta(days=30)).strftime("%Y-%m-%d")
    if not date_to:
        date_to = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    query = {
        "user_id": current_user["user_id"],
        "status": "fact",
        "date": {"$gte": date_from, "$lte": date_to},
        "contractor_id": {"$ne": None}
    }

    transactions = await db.transactions.find(query, {"_id": 0}).to_list(10000)

    contractor_stats = {}
    for t in transactions:
        contractor_id = t.get("contractor_id")
        contractor_name = t.get("contractor_name", "Неизвестный")

        if not contractor_id:
            continue

        if contractor_id not in contractor_stats:
            contractor_stats[contractor_id] = {
                "id": contractor_id,
                "name": contractor_name,
                "income": 0, "expense": 0, "total": 0, "transactions": 0
            }

        contractor_stats[contractor_id]["transactions"] += 1

        if t["type"] == "income":
            amt = t.get("amount_base") if t.get("amount_base") is not None else t["amount"]
            contractor_stats[contractor_id]["income"] += amt
            contractor_stats[contractor_id]["total"] += amt
        elif t["type"] == "expense":
            amt = t.get("amount_base") if t.get("amount_base") is not None else t["amount"]
            contractor_stats[contractor_id]["expense"] += amt
            contractor_stats[contractor_id]["total"] += amt

    sorted_contractors = sorted(contractor_stats.values(), key=lambda x: x["total"], reverse=True)[:limit]

    return {
        "period": {"from": date_from, "to": date_to},
        "contractors": sorted_contractors
    }


@router.get("/")
async def root():
    return {"message": "WM Finance API", "version": "2.0.0"}


@router.get("/health")
async def health():
    return {"status": "healthy"}
