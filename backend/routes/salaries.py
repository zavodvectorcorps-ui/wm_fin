"""
WM Finance — Зарплаты (ФОТ).
Сущности:
  - employee — карточка сотрудника
  - salary_accrual — начисление зарплаты за месяц (можно вручную привязать к фактической операции)
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from datetime import datetime, timezone, timedelta

from database import db
from auth import get_current_user
from models import (
    Employee, EmployeeCreate,
    SalaryAccrual, SalaryAccrualCreate,
)

router = APIRouter(prefix="/api")


# ============== Employees ==============

@router.get("/employees", response_model=List[Employee])
async def list_employees(current_user: dict = Depends(get_current_user)):
    rows = await db.employees.find(
        {"user_id": current_user["user_id"]},
        {"_id": 0}
    ).sort("name", 1).to_list(500)
    return rows


@router.post("/employees", response_model=Employee)
async def create_employee(data: EmployeeCreate, current_user: dict = Depends(get_current_user)):
    payload = data.model_dump()
    if payload.get("direction_id"):
        d = await db.directions.find_one({"id": payload["direction_id"]}, {"_id": 0, "name": 1})
        payload["direction_name"] = d["name"] if d else None
    emp = Employee(**payload, user_id=current_user["user_id"])
    await db.employees.insert_one(emp.model_dump())
    return emp


@router.put("/employees/{emp_id}", response_model=Employee)
async def update_employee(emp_id: str, data: EmployeeCreate, current_user: dict = Depends(get_current_user)):
    payload = data.model_dump()
    if payload.get("direction_id"):
        d = await db.directions.find_one({"id": payload["direction_id"]}, {"_id": 0, "name": 1})
        payload["direction_name"] = d["name"] if d else None
    else:
        payload["direction_name"] = None
    result = await db.employees.update_one(
        {"id": emp_id, "user_id": current_user["user_id"]},
        {"$set": payload}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")
    emp = await db.employees.find_one({"id": emp_id}, {"_id": 0})
    return emp


@router.delete("/employees/{emp_id}")
async def delete_employee(emp_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.employees.delete_one(
        {"id": emp_id, "user_id": current_user["user_id"]}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Не найдено")
    return {"status": "deleted"}


def _norm_accrual(row: dict) -> dict:
    """Back-compat: ensure linked_transaction_ids is a list (migrating legacy
    single linked_transaction_id field). Adds computed `total_paid` / `remaining`
    and recomputes `status` from current paid amount."""
    ids = row.get("linked_transaction_ids") or []
    legacy = row.get("linked_transaction_id")
    if legacy and legacy not in ids:
        ids = list(ids) + [legacy]
    row["linked_transaction_ids"] = ids
    return row


async def _enrich_with_payments(rows: list, user_id: str) -> list:
    """Fetch the linked transactions and compute paid total / remaining / status."""
    all_ids = [tid for r in rows for tid in r.get("linked_transaction_ids", [])]
    tx_by_id: dict = {}
    if all_ids:
        cursor = db.transactions.find(
            {"user_id": user_id, "id": {"$in": all_ids}},
            {"_id": 0, "id": 1, "amount": 1, "amount_base": 1, "currency": 1, "date": 1, "description": 1, "account_id": 1, "account_name": 1},
        )
        async for t in cursor:
            tx_by_id[t["id"]] = t

    for r in rows:
        paid = 0.0
        details: list = []
        for tid in r.get("linked_transaction_ids", []):
            t = tx_by_id.get(tid)
            if not t:
                continue
            # Match currency to accrual's: if same currency use amount, else amount_base
            if (t.get("currency") or "PLN") == (r.get("currency") or "PLN"):
                amt = float(t.get("amount") or 0)
            else:
                amt = float(t.get("amount_base") or t.get("amount") or 0)
            paid += amt
            details.append({
                "id": tid,
                "date": t.get("date"),
                "amount": amt,
                "description": t.get("description"),
                "account_name": t.get("account_name"),
            })

        total_due = float(r.get("total_due") or 0)
        r["total_paid"] = round(paid, 2)
        r["remaining"] = round(max(total_due - paid, 0), 2)
        r["payments"] = details
        if paid <= 0.005:
            r["status"] = "planned"
        elif paid + 0.5 < total_due:  # 0.5 PLN tolerance for partial
            r["status"] = "partial"
        else:
            r["status"] = "paid"
    return rows


# ============== Salary accruals ==============

@router.get("/salary-accruals")
async def list_accruals(
    month: Optional[str] = None,  # YYYY-MM
    employee_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    query = {"user_id": current_user["user_id"]}
    if month:
        query["month"] = month
    if employee_id:
        query["employee_id"] = employee_id
    rows = await db.salary_accruals.find(query, {"_id": 0}).sort("month", -1).to_list(1000)
    rows = [_norm_accrual(r) for r in rows]
    rows = await _enrich_with_payments(rows, current_user["user_id"])
    return rows


@router.post("/salary-accruals", response_model=SalaryAccrual)
async def create_accrual(data: SalaryAccrualCreate, current_user: dict = Depends(get_current_user)):
    emp = await db.employees.find_one(
        {"id": data.employee_id, "user_id": current_user["user_id"]},
        {"_id": 0}
    )
    if not emp:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")

    # Check duplicate (one accrual per employee per month)
    existing = await db.salary_accruals.find_one({
        "user_id": current_user["user_id"],
        "employee_id": data.employee_id,
        "month": data.month,
    })
    if existing:
        raise HTTPException(status_code=400, detail="Начисление за этот месяц уже существует")

    payload = data.model_dump()
    payload["total_due"] = round(payload["salary"] + payload["bonus"] - payload.get("taxes", 0) - payload["deductions"], 2)
    payload["employee_name"] = emp.get("name")
    payload["direction_id"] = emp.get("direction_id")
    payload["direction_name"] = emp.get("direction_name")
    payload["currency"] = emp.get("currency", "PLN")

    accrual = SalaryAccrual(**payload, user_id=current_user["user_id"])
    await db.salary_accruals.insert_one(accrual.model_dump())
    return accrual


@router.put("/salary-accruals/{accrual_id}", response_model=SalaryAccrual)
async def update_accrual(
    accrual_id: str,
    data: SalaryAccrualCreate,
    current_user: dict = Depends(get_current_user),
):
    existing = await db.salary_accruals.find_one(
        {"id": accrual_id, "user_id": current_user["user_id"]},
        {"_id": 0}
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Не найдено")

    emp = await db.employees.find_one(
        {"id": data.employee_id, "user_id": current_user["user_id"]},
        {"_id": 0}
    )
    if not emp:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")

    update = data.model_dump()
    update["total_due"] = round(update["salary"] + update["bonus"] - update.get("taxes", 0) - update["deductions"], 2)
    update["employee_name"] = emp.get("name")
    update["direction_id"] = emp.get("direction_id")
    update["direction_name"] = emp.get("direction_name")
    update["currency"] = emp.get("currency", "PLN")

    await db.salary_accruals.update_one(
        {"id": accrual_id, "user_id": current_user["user_id"]},
        {"$set": update}
    )
    accrual = await db.salary_accruals.find_one({"id": accrual_id}, {"_id": 0})
    return accrual


@router.delete("/salary-accruals/{accrual_id}")
async def delete_accrual(accrual_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.salary_accruals.delete_one(
        {"id": accrual_id, "user_id": current_user["user_id"]}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Не найдено")
    return {"status": "deleted"}


# ============== Suggest matches & link ==============

@router.get("/salary-accruals/{accrual_id}/suggest-matches")
async def suggest_salary_matches(accrual_id: str, current_user: dict = Depends(get_current_user)):
    """Предложить транзакции-кандидаты для привязки к начислению зарплаты.
    Учитывает связанного контрагента (Employee.contractor_id) для точного отбора."""
    accrual = await db.salary_accruals.find_one(
        {"id": accrual_id, "user_id": current_user["user_id"]},
        {"_id": 0}
    )
    if not accrual:
        raise HTTPException(status_code=404, detail="Начисление не найдено")

    # Look up the employee's linked contractor (if any) for boosted matching.
    employee = await db.employees.find_one(
        {"id": accrual.get("employee_id"), "user_id": current_user["user_id"]},
        {"_id": 0, "contractor_id": 1}
    )
    employee_contractor_id = (employee or {}).get("contractor_id")

    # Окно: текущий месяц accrual ± 10 дней следующего месяца
    try:
        year, month = map(int, accrual["month"].split("-"))
    except Exception:
        raise HTTPException(status_code=400, detail="Некорректный формат месяца")

    start = datetime(year, month, 1)
    end_year = year + (1 if month == 12 else 0)
    end_month = 1 if month == 12 else month + 1
    end = datetime(end_year, end_month, 1) + timedelta(days=10)

    amount = float(accrual["total_due"]) or float(accrual.get("salary", 0))
    if amount <= 0:
        return {"accrual": accrual, "candidates": []}
    # Wider amount band — partial payments can be much smaller than total_due.
    amt_min = amount * 0.10
    amt_max = amount * 1.20

    # Exclude transactions already linked to ANY salary accrual.
    accrued_tx_ids = await db.salary_accruals.distinct(
        "linked_transaction_ids",
        {"user_id": current_user["user_id"]}
    )

    query = {
        "user_id": current_user["user_id"],
        "status": "fact",
        "type": "expense",
        "date": {"$gte": start.strftime("%Y-%m-%d"), "$lte": end.strftime("%Y-%m-%d")},
        "amount": {"$gte": amt_min, "$lte": amt_max},
    }
    if accrued_tx_ids:
        query["id"] = {"$nin": [t for t in accrued_tx_ids if t]}

    candidates = await db.transactions.find(query, {"_id": 0}).sort("date", 1).to_list(30)

    # Best matches: contractor link (huge boost) > same direction > name in description > amount close
    name = (accrual.get("employee_name") or "").lower()

    def score(t):
        amt_diff = abs(t["amount"] - amount) / max(amount, 1)
        same_dir = 1 if t.get("direction_id") == accrual.get("direction_id") else 0
        name_hit = 1 if name and name in (t.get("description") or "").lower() else 0
        contractor_hit = 1 if employee_contractor_id and t.get("contractor_id") == employee_contractor_id else 0
        # Lower = better. Contractor match is the strongest signal.
        return (amt_diff * 50) - (same_dir * 5) - (name_hit * 10) - (contractor_hit * 50)

    candidates.sort(key=score)
    return {"accrual": accrual, "candidates": candidates[:10]}


@router.post("/salary-accruals/{accrual_id}/link-transaction")
async def link_salary_to_transaction(
    accrual_id: str,
    body: dict,
    current_user: dict = Depends(get_current_user),
):
    """Привязать (добавить) фактическую транзакцию к начислению.
    Поддерживает несколько частичных выплат — добавляет в список linked_transaction_ids."""
    transaction_id = body.get("transaction_id")
    if not transaction_id:
        raise HTTPException(status_code=400, detail="Не указан transaction_id")

    tx = await db.transactions.find_one(
        {"id": transaction_id, "user_id": current_user["user_id"]},
        {"_id": 0, "id": 1}
    )
    if not tx:
        raise HTTPException(status_code=404, detail="Транзакция не найдена")

    accrual = await db.salary_accruals.find_one(
        {"id": accrual_id, "user_id": current_user["user_id"]}, {"_id": 0}
    )
    if not accrual:
        raise HTTPException(status_code=404, detail="Начисление не найдено")

    _norm_accrual(accrual)
    ids = list(accrual.get("linked_transaction_ids") or [])
    if transaction_id in ids:
        return {"status": "already_linked"}
    ids.append(transaction_id)

    await db.salary_accruals.update_one(
        {"id": accrual_id, "user_id": current_user["user_id"]},
        {"$set": {"linked_transaction_ids": ids, "linked_transaction_id": ids[0]}}
    )
    return {"status": "linked", "linked_transaction_ids": ids}


@router.post("/salary-accruals/{accrual_id}/unlink-transaction")
async def unlink_salary(
    accrual_id: str,
    body: Optional[dict] = None,
    current_user: dict = Depends(get_current_user),
):
    """Отвязать транзакцию от начисления. Если в теле указан transaction_id —
    удаляется только она. Без него — отвязываются все (полный сброс)."""
    accrual = await db.salary_accruals.find_one(
        {"id": accrual_id, "user_id": current_user["user_id"]}, {"_id": 0}
    )
    if not accrual:
        raise HTTPException(status_code=404, detail="Не найдено")

    _norm_accrual(accrual)
    tx_id = (body or {}).get("transaction_id") if isinstance(body, dict) else None
    if tx_id:
        ids = [t for t in (accrual.get("linked_transaction_ids") or []) if t != tx_id]
    else:
        ids = []

    await db.salary_accruals.update_one(
        {"id": accrual_id, "user_id": current_user["user_id"]},
        {"$set": {
            "linked_transaction_ids": ids,
            "linked_transaction_id": ids[0] if ids else None,
        }}
    )
    return {"status": "unlinked", "linked_transaction_ids": ids}


@router.post("/salary-accruals/{accrual_id}/create-transaction")
async def create_transaction_from_accrual(
    accrual_id: str,
    payload: dict,
    current_user: dict = Depends(get_current_user),
):
    """Create a real expense transaction directly from a planned salary accrual
    and link it automatically.

    payload:
      - account_id (required) — which account paid
      - amount (optional) — defaults to remaining (total_due - paid)
      - date (optional) — defaults to today
      - description (optional) — auto-generated if missing
    """
    from models import TransactionCreate
    from routes.transactions import create_transaction

    accrual = await db.salary_accruals.find_one(
        {"id": accrual_id, "user_id": current_user["user_id"]}, {"_id": 0}
    )
    if not accrual:
        raise HTTPException(status_code=404, detail="Начисление не найдено")

    _norm_accrual(accrual)
    accrual = (await _enrich_with_payments([accrual], current_user["user_id"]))[0]

    account_id = payload.get("account_id")
    if not account_id:
        raise HTTPException(status_code=400, detail="account_id is required")

    amount = payload.get("amount")
    if amount is None or float(amount) <= 0:
        amount = accrual.get("remaining") or accrual.get("total_due") or 0
    amount = float(amount)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Нечего выплачивать — остаток ≤ 0")

    date_str = payload.get("date") or datetime.utcnow().strftime("%Y-%m-%d")

    # Pull employee → contractor link for the new tx
    contractor_id = None
    employee = await db.employees.find_one(
        {"id": accrual.get("employee_id"), "user_id": current_user["user_id"]},
        {"_id": 0, "contractor_id": 1}
    )
    if employee:
        contractor_id = employee.get("contractor_id")

    description = (
        payload.get("description")
        or f"Зарплата {accrual.get('employee_name') or ''} за {accrual.get('month') or ''}"
    ).strip()

    # Need a direction — prefer accrual's, otherwise fallback
    direction_id = accrual.get("direction_id")
    if not direction_id:
        d = await db.directions.find_one({"user_id": current_user["user_id"]}, {"_id": 0, "id": 1})
        if d:
            direction_id = d["id"]
        else:
            # Create a default direction so the call doesn't fail
            import uuid as _uuid
            direction_id = str(_uuid.uuid4())
            await db.directions.insert_one({
                "id": direction_id, "user_id": current_user["user_id"], "name": "Основное",
                "created_at": datetime.now(timezone.utc).isoformat(),
            })

    data = TransactionCreate(
        type="expense",
        amount=amount,
        currency=accrual.get("currency", "PLN"),
        date=date_str,
        description=description,
        account_id=account_id,
        contractor_id=contractor_id,
        direction_id=direction_id,
        status="fact",
    )
    tx = await create_transaction(data, current_user)
    tx_dict = tx.model_dump() if hasattr(tx, "model_dump") else dict(tx)

    # Link the created transaction to the accrual
    ids = list(accrual.get("linked_transaction_ids") or [])
    ids.append(tx_dict["id"])
    await db.salary_accruals.update_one(
        {"id": accrual_id, "user_id": current_user["user_id"]},
        {"$set": {"linked_transaction_ids": ids, "linked_transaction_id": ids[0]}}
    )

    return {"transaction": tx_dict, "accrual_id": accrual_id}


# ============== Salary summary for dashboard ==============

@router.get("/salary-accruals/summary")
async def salary_summary(
    month: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Сводка по ФОТ за месяц для дашборда."""
    if not month:
        month = datetime.now(timezone.utc).strftime("%Y-%m")

    rows = await db.salary_accruals.find(
        {"user_id": current_user["user_id"], "month": month},
        {"_id": 0}
    ).to_list(1000)
    rows = [_norm_accrual(r) for r in rows]
    rows = await _enrich_with_payments(rows, current_user["user_id"])

    total_accrued = sum(r.get("total_due", 0) for r in rows)
    total_paid = sum(r.get("total_paid", 0) for r in rows)
    total_pending = max(total_accrued - total_paid, 0)

    by_direction = {}
    for r in rows:
        key = r.get("direction_name") or "Общее"
        if key not in by_direction:
            by_direction[key] = {"accrued": 0, "paid": 0}
        by_direction[key]["accrued"] += r.get("total_due", 0)
        by_direction[key]["paid"] += r.get("total_paid", 0)

    return {
        "month": month,
        "employees_count": len(rows),
        "total_accrued": round(total_accrued, 2),
        "total_paid": round(total_paid, 2),
        "total_pending": round(total_pending, 2),
        "by_direction": by_direction,
    }
