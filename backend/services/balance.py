from database import db


async def update_account_balance(account_id: str, user_id: str):
    """Recalculate account balance based on all transactions.
    Uses amount_base (converted amount in account currency) when available,
    falls back to amount for backward compatibility.
    """
    account = await db.accounts.find_one({"id": account_id, "user_id": user_id}, {"_id": 0})
    if not account:
        return

    initial = account.get("initial_balance", 0)

    # Helper: get effective amount for balance (amount_base if exists, else amount)
    def effective_amount(t):
        return t.get("amount_base") if t.get("amount_base") is not None else t["amount"]

    income_cursor = db.transactions.find({
        "account_id": account_id,
        "user_id": user_id,
        "type": "income",
        "status": "fact"
    }, {"_id": 0, "amount": 1, "amount_base": 1})
    income_total = sum([effective_amount(t) async for t in income_cursor])

    expense_cursor = db.transactions.find({
        "account_id": account_id,
        "user_id": user_id,
        "type": "expense",
        "status": "fact"
    }, {"_id": 0, "amount": 1, "amount_base": 1})
    expense_total = sum([effective_amount(t) async for t in expense_cursor])

    transfer_out_cursor = db.transactions.find({
        "account_id": account_id,
        "user_id": user_id,
        "type": "transfer",
        "status": "fact"
    }, {"_id": 0, "amount": 1, "amount_base": 1})
    transfer_out_total = sum([effective_amount(t) async for t in transfer_out_cursor])

    transfer_in_cursor = db.transactions.find({
        "to_account_id": account_id,
        "user_id": user_id,
        "type": "transfer",
        "status": "fact"
    }, {"_id": 0, "amount": 1, "amount_base": 1, "to_amount_base": 1})
    transfer_in_total = 0
    async for t in transfer_in_cursor:
        # Use to_amount_base (amount in target account's currency) if available
        if t.get("to_amount_base") is not None:
            transfer_in_total += t["to_amount_base"]
        elif t.get("amount_base") is not None:
            transfer_in_total += t["amount_base"]
        else:
            transfer_in_total += t["amount"]

    new_balance = initial + income_total - expense_total - transfer_out_total + transfer_in_total

    await db.accounts.update_one(
        {"id": account_id, "user_id": user_id},
        {"$set": {"current_balance": new_balance}}
    )
