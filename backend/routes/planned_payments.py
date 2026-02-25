from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from datetime import datetime, timezone

from database import db
from auth import get_current_user
from models import PlannedPayment, PlannedPaymentCreate

router = APIRouter(prefix="/api")


@router.get("/planned-payments", response_model=List[PlannedPayment])
async def get_planned_payments(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    type: Optional[str] = None,
    status: Optional[str] = None,
    direction_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {"user_id": current_user["user_id"]}

    if date_from:
        query["date"] = {"$gte": date_from}
    if date_to:
        if "date" in query:
            query["date"]["$lte"] = date_to
        else:
            query["date"] = {"$lte": date_to}
    if type:
        query["type"] = type
    if status:
        query["status"] = status
    if direction_id:
        query["direction_id"] = direction_id

    # Auto-update overdue payments
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    await db.planned_payments.update_many(
        {"user_id": current_user["user_id"], "status": "pending", "date": {"$lt": today}},
        {"$set": {"status": "overdue"}}
    )

    payments = await db.planned_payments.find(query, {"_id": 0}).sort("date", 1).to_list(500)
    return payments


@router.post("/planned-payments", response_model=PlannedPayment)
async def create_planned_payment(data: PlannedPaymentCreate, current_user: dict = Depends(get_current_user)):
    category_name = None
    if data.category_id:
        cat = await db.categories.find_one({"id": data.category_id}, {"_id": 0, "name": 1})
        category_name = cat["name"] if cat else None

    contractor_name = None
    if data.contractor_id:
        contractor = await db.contractors.find_one({"id": data.contractor_id}, {"_id": 0, "name": 1})
        contractor_name = contractor["name"] if contractor else None

    direction = await db.directions.find_one({"id": data.direction_id}, {"_id": 0, "name": 1})
    direction_name = direction["name"] if direction else None

    account = await db.accounts.find_one({"id": data.account_id}, {"_id": 0, "name": 1})
    account_name = account["name"] if account else None

    payment = PlannedPayment(
        **data.model_dump(),
        user_id=current_user["user_id"],
        category_name=category_name,
        contractor_name=contractor_name,
        direction_name=direction_name,
        account_name=account_name
    )

    await db.planned_payments.insert_one(payment.model_dump())
    return payment


@router.put("/planned-payments/{payment_id}", response_model=PlannedPayment)
async def update_planned_payment(payment_id: str, data: PlannedPaymentCreate, current_user: dict = Depends(get_current_user)):
    result = await db.planned_payments.update_one(
        {"id": payment_id, "user_id": current_user["user_id"]},
        {"$set": data.model_dump()}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Payment not found")
    payment = await db.planned_payments.find_one({"id": payment_id}, {"_id": 0})
    return payment


@router.put("/planned-payments/{payment_id}/status")
async def update_payment_status(
    payment_id: str,
    status: str,
    current_user: dict = Depends(get_current_user)
):
    result = await db.planned_payments.update_one(
        {"id": payment_id, "user_id": current_user["user_id"]},
        {"$set": {"status": status}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Payment not found")
    return {"status": "updated"}


@router.delete("/planned-payments/{payment_id}")
async def delete_planned_payment(payment_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.planned_payments.delete_one({"id": payment_id, "user_id": current_user["user_id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Payment not found")
    return {"status": "deleted"}
