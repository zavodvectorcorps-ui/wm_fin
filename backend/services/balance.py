from database import db


async def update_account_balance(account_id: str, user_id: str):
    """Recalculate account balance based on all transactions"""
    account = await db.accounts.find_one({"id": account_id, "user_id": user_id}, {"_id": 0})
    if not account:
        return

    initial = account.get("initial_balance", 0)

    income_cursor = db.transactions.find({
        "account_id": account_id,
        "user_id": user_id,
        "type": "income",
        "status": "fact"
    }, {"_id": 0, "amount": 1})
    income_total = sum([t["amount"] async for t in income_cursor])

    expense_cursor = db.transactions.find({
        "account_id": account_id,
        "user_id": user_id,
        "type": "expense",
        "status": "fact"
    }, {"_id": 0, "amount": 1})
    expense_total = sum([t["amount"] async for t in expense_cursor])

    transfer_out_cursor = db.transactions.find({
        "account_id": account_id,
        "user_id": user_id,
        "type": "transfer",
        "status": "fact"
    }, {"_id": 0, "amount": 1})
    transfer_out_total = sum([t["amount"] async for t in transfer_out_cursor])

    transfer_in_cursor = db.transactions.find({
        "to_account_id": account_id,
        "user_id": user_id,
        "type": "transfer",
        "status": "fact"
    }, {"_id": 0, "amount": 1})
    transfer_in_total = sum([t["amount"] async for t in transfer_in_cursor])

    new_balance = initial + income_total - expense_total - transfer_out_total + transfer_in_total

    await db.accounts.update_one(
        {"id": account_id, "user_id": user_id},
        {"$set": {"current_balance": new_balance}}
    )
