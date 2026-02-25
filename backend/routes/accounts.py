from fastapi import APIRouter, HTTPException, Depends
from typing import List

from database import db
from auth import get_current_user
from models import Account, AccountCreate

router = APIRouter(prefix="/api")


@router.get("/accounts", response_model=List[Account])
async def get_accounts(current_user: dict = Depends(get_current_user)):
    accounts = await db.accounts.find({"user_id": current_user["user_id"], "is_active": True}, {"_id": 0}).to_list(100)
    return accounts


@router.post("/accounts", response_model=Account)
async def create_account(data: AccountCreate, current_user: dict = Depends(get_current_user)):
    account = Account(**data.model_dump(), user_id=current_user["user_id"], current_balance=data.initial_balance)
    await db.accounts.insert_one(account.model_dump())
    return account


@router.put("/accounts/{account_id}", response_model=Account)
async def update_account(account_id: str, data: AccountCreate, current_user: dict = Depends(get_current_user)):
    result = await db.accounts.update_one(
        {"id": account_id, "user_id": current_user["user_id"]},
        {"$set": data.model_dump()}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Account not found")
    account = await db.accounts.find_one({"id": account_id}, {"_id": 0})
    return account


@router.delete("/accounts/{account_id}")
async def delete_account(account_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.accounts.update_one(
        {"id": account_id, "user_id": current_user["user_id"]},
        {"$set": {"is_active": False}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Account not found")
    return {"status": "deleted"}
