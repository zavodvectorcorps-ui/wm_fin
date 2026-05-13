from fastapi import APIRouter, HTTPException, Depends
from typing import List

from database import db
from auth import get_current_user
from models import Account, AccountCreate

router = APIRouter(prefix="/api")


async def _recalc_account_amount_base(account_id: str, user_id: str):
    """Recompute amount_base/to_amount_base for every transaction that touches
    this account. Use the account's CURRENT currency as the target.

    Called after an account's currency is changed so historical numbers stay
    consistent with the new currency.
    """
    from routes.exchange_rate import get_nbp_rate
    rate = await get_nbp_rate()  # EUR per PLN multiplier (≈4.25)

    acc = await db.accounts.find_one({"id": account_id, "user_id": user_id}, {"_id": 0, "currency": 1})
    if not acc:
        return
    acc_cur = acc.get("currency", "PLN")

    def convert(amount: float, src_cur: str, dst_cur: str) -> float:
        if src_cur == dst_cur:
            return amount
        if src_cur == "EUR" and dst_cur == "PLN":
            return round(amount * rate, 2)
        if src_cur == "PLN" and dst_cur == "EUR":
            return round(amount / rate, 2) if rate else amount
        return amount

    # Source side: amount_base must be expressed in account currency
    async for t in db.transactions.find(
        {"user_id": user_id, "account_id": account_id},
        {"_id": 0, "id": 1, "amount": 1, "currency": 1, "exchange_rate": 1}
    ):
        src_cur = t.get("currency", "PLN")
        new_base = convert(t.get("amount", 0), src_cur, acc_cur)
        await db.transactions.update_one({"id": t["id"]}, {"$set": {"amount_base": new_base}})

    # Target side: for transfers TO this account, to_amount_base in acc currency
    async for t in db.transactions.find(
        {"user_id": user_id, "to_account_id": account_id, "type": "transfer"},
        {"_id": 0, "id": 1, "amount": 1, "currency": 1, "to_amount": 1}
    ):
        # Manual to_amount overrides: it's already in the target (this) account currency
        if t.get("to_amount") is not None:
            await db.transactions.update_one({"id": t["id"]}, {"$set": {"to_amount_base": float(t["to_amount"])}})
        else:
            src_cur = t.get("currency", "PLN")
            new_to_base = convert(t.get("amount", 0), src_cur, acc_cur)
            await db.transactions.update_one({"id": t["id"]}, {"$set": {"to_amount_base": new_to_base}})


async def _recalc_balance(account_id: str, user_id: str):
    """Recompute current_balance for an account from initial_balance + all txs."""
    acc = await db.accounts.find_one({"id": account_id, "user_id": user_id}, {"_id": 0, "initial_balance": 1})
    if not acc:
        return
    bal = float(acc.get("initial_balance", 0) or 0)
    async for t in db.transactions.find(
        {"user_id": user_id, "status": "fact",
         "$or": [{"account_id": account_id}, {"to_account_id": account_id}]},
        {"_id": 0, "type": 1, "account_id": 1, "to_account_id": 1, "amount_base": 1, "to_amount_base": 1}
    ):
        if t.get("account_id") == account_id:
            amt = t.get("amount_base") or 0
            if t["type"] == "income":
                bal += amt
            elif t["type"] in ("expense", "transfer"):
                bal -= amt
        elif t.get("to_account_id") == account_id and t["type"] == "transfer":
            bal += t.get("to_amount_base") or t.get("amount_base") or 0
    await db.accounts.update_one({"id": account_id}, {"$set": {"current_balance": round(bal, 2)}})


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
    existing = await db.accounts.find_one({"id": account_id, "user_id": current_user["user_id"]}, {"_id": 0, "currency": 1})
    if not existing:
        raise HTTPException(status_code=404, detail="Account not found")
    currency_changed = existing.get("currency") != data.currency

    await db.accounts.update_one(
        {"id": account_id, "user_id": current_user["user_id"]},
        {"$set": data.model_dump()}
    )

    if currency_changed:
        # Recompute amount_base for ALL related transactions, then balance
        await _recalc_account_amount_base(account_id, current_user["user_id"])
        await _recalc_balance(account_id, current_user["user_id"])

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
