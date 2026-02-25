from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional

from database import db
from auth import get_current_user
from models import Contractor, ContractorCreate

router = APIRouter(prefix="/api")


@router.get("/contractors", response_model=List[Contractor])
async def get_contractors(
    type: Optional[str] = None,
    group: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {"user_id": current_user["user_id"], "is_active": True}
    if type:
        query["type"] = type
    if group:
        query["group"] = group
    contractors = await db.contractors.find(query, {"_id": 0}).to_list(500)
    return contractors


@router.get("/contractors/{contractor_id}")
async def get_contractor(contractor_id: str, current_user: dict = Depends(get_current_user)):
    contractor = await db.contractors.find_one(
        {"id": contractor_id, "user_id": current_user["user_id"]},
        {"_id": 0}
    )
    if not contractor:
        raise HTTPException(status_code=404, detail="Contractor not found")

    transactions = await db.transactions.find(
        {"contractor_id": contractor_id, "user_id": current_user["user_id"]},
        {"_id": 0}
    ).sort("date", -1).to_list(100)

    total_income = sum(t["amount"] for t in transactions if t["type"] == "income")
    total_expense = sum(t["amount"] for t in transactions if t["type"] == "expense")

    contractor["transactions"] = transactions
    contractor["total_income"] = total_income
    contractor["total_expense"] = total_expense
    contractor["balance"] = total_income - total_expense

    return contractor


@router.post("/contractors", response_model=Contractor)
async def create_contractor(data: ContractorCreate, current_user: dict = Depends(get_current_user)):
    contractor = Contractor(**data.model_dump(), user_id=current_user["user_id"])
    await db.contractors.insert_one(contractor.model_dump())
    return contractor


@router.put("/contractors/{contractor_id}", response_model=Contractor)
async def update_contractor(contractor_id: str, data: ContractorCreate, current_user: dict = Depends(get_current_user)):
    result = await db.contractors.update_one(
        {"id": contractor_id, "user_id": current_user["user_id"]},
        {"$set": data.model_dump()}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Contractor not found")
    contractor = await db.contractors.find_one({"id": contractor_id}, {"_id": 0})
    return contractor


@router.delete("/contractors/{contractor_id}")
async def delete_contractor(contractor_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.contractors.update_one(
        {"id": contractor_id, "user_id": current_user["user_id"]},
        {"$set": {"is_active": False}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Contractor not found")
    return {"status": "deleted"}
