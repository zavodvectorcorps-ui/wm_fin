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


# ============== Salary accruals ==============

@router.get("/salary-accruals", response_model=List[SalaryAccrual])
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
    payload["total_due"] = round(payload["salary"] + payload["bonus"] - payload["deductions"], 2)
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
    update["total_due"] = round(update["salary"] + update["bonus"] - update["deductions"], 2)
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
    """Предложить транзакции-кандидаты для привязки к начислению зарплаты."""
    accrual = await db.salary_accruals.find_one(
        {"id": accrual_id, "user_id": current_user["user_id"]},
        {"_id": 0}
    )
    if not accrual:
        raise HTTPException(status_code=404, detail="Начисление не найдено")

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
    amt_min = amount * 0.85
    amt_max = amount * 1.15

    query = {
        "user_id": current_user["user_id"],
        "status": "fact",
        "type": "expense",
        "date": {"$gte": start.strftime("%Y-%m-%d"), "$lte": end.strftime("%Y-%m-%d")},
        "amount": {"$gte": amt_min, "$lte": amt_max},
    }

    candidates = await db.transactions.find(query, {"_id": 0}).sort("date", 1).to_list(20)

    # Best matches: same direction, same amount, presence of employee name in description
    name = (accrual.get("employee_name") or "").lower()

    def score(t):
        amt_diff = abs(t["amount"] - amount) / max(amount, 1)
        same_dir = 1 if t.get("direction_id") == accrual.get("direction_id") else 0
        name_hit = 1 if name and name in (t.get("description") or "").lower() else 0
        return (amt_diff * 100) - (same_dir * 5) - (name_hit * 10)

    candidates.sort(key=score)
    return {"accrual": accrual, "candidates": candidates[:5]}


@router.post("/salary-accruals/{accrual_id}/link-transaction")
async def link_salary_to_transaction(
    accrual_id: str,
    body: dict,
    current_user: dict = Depends(get_current_user),
):
    transaction_id = body.get("transaction_id")
    if not transaction_id:
        raise HTTPException(status_code=400, detail="Не указан transaction_id")

    tx = await db.transactions.find_one(
        {"id": transaction_id, "user_id": current_user["user_id"]},
        {"_id": 0, "id": 1}
    )
    if not tx:
        raise HTTPException(status_code=404, detail="Транзакция не найдена")

    result = await db.salary_accruals.update_one(
        {"id": accrual_id, "user_id": current_user["user_id"]},
        {"$set": {"status": "paid", "linked_transaction_id": transaction_id}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Начисление не найдено")
    return {"status": "linked"}


@router.post("/salary-accruals/{accrual_id}/unlink-transaction")
async def unlink_salary(accrual_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.salary_accruals.update_one(
        {"id": accrual_id, "user_id": current_user["user_id"]},
        {"$set": {"status": "planned", "linked_transaction_id": None}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Не найдено")
    return {"status": "unlinked"}


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

    total_accrued = sum(r.get("total_due", 0) for r in rows)
    total_paid = sum(r.get("total_due", 0) for r in rows if r.get("status") == "paid")
    total_pending = total_accrued - total_paid

    by_direction = {}
    for r in rows:
        key = r.get("direction_name") or "Общее"
        if key not in by_direction:
            by_direction[key] = {"accrued": 0, "paid": 0}
        by_direction[key]["accrued"] += r.get("total_due", 0)
        if r.get("status") == "paid":
            by_direction[key]["paid"] += r.get("total_due", 0)

    return {
        "month": month,
        "employees_count": len(rows),
        "total_accrued": round(total_accrued, 2),
        "total_paid": round(total_paid, 2),
        "total_pending": round(total_pending, 2),
        "by_direction": by_direction,
    }
