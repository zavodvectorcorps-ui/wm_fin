from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Query
from typing import List, Optional
from datetime import datetime, timezone
import csv
import io
import logging

from database import db
from auth import get_current_user
from models import Transaction, TransactionCreate
from services.balance import update_account_balance
from routes.exchange_rate import get_nbp_rate

router = APIRouter(prefix="/api")
logger = logging.getLogger(__name__)


async def get_effective_rate(user_id: str) -> float:
    """Get the effective EUR/PLN rate (manual or NBP)."""
    settings = await db.integration_settings.find_one(
        {"user_id": user_id}, {"_id": 0, "manual_eur_pln_rate": 1}
    )
    manual = settings.get("manual_eur_pln_rate") if settings else None
    if manual:
        return float(manual)
    return await get_nbp_rate()


async def calc_amount_base(amount: float, currency: str, account_id: str, user_id: str):
    """Convert amount to account's currency. Returns (amount_base, exchange_rate)."""
    account = await db.accounts.find_one({"id": account_id, "user_id": user_id}, {"_id": 0, "currency": 1})
    acc_currency = account.get("currency", "PLN") if account else "PLN"

    if currency == acc_currency:
        return amount, None

    rate = await get_effective_rate(user_id)
    if rate <= 0:
        return amount, None

    # EUR -> PLN
    if currency == "EUR" and acc_currency == "PLN":
        return round(amount * rate, 2), rate
    # PLN -> EUR
    if currency == "PLN" and acc_currency == "EUR":
        return round(amount / rate, 2), rate

    return amount, None


@router.get("/transactions")
async def get_transactions(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    type: Optional[str] = None,
    status: Optional[str] = None,
    account_id: Optional[str] = None,
    direction_id: Optional[str] = None,
    category_id: Optional[str] = None,
    contractor_id: Optional[str] = None,
    source: Optional[str] = None,
    search: Optional[str] = None,
    needs_review: Optional[bool] = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
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
    if account_id:
        query["$or"] = [{"account_id": account_id}, {"to_account_id": account_id}]
    if direction_id:
        query["direction_id"] = direction_id
    if category_id:
        query["category_id"] = category_id
    if contractor_id:
        query["contractor_id"] = contractor_id
    if source:
        query["source"] = source
    if search:
        query["description"] = {"$regex": search, "$options": "i"}
    if needs_review is not None:
        query["needs_review"] = needs_review

    total = await db.transactions.count_documents(query)
    skip = (page - 1) * per_page
    items = await db.transactions.find(query, {"_id": 0}).sort("date", -1).skip(skip).limit(per_page).to_list(per_page)

    # Aggregate summary for ENTIRE filtered period using a COPY of the query
    # to prevent any mutation from the find() cursor above
    match_query = {k: v for k, v in query.items()}
    summary_pipeline = [
        {"$match": match_query},
        {"$group": {
            "_id": {
                "currency": {"$ifNull": ["$currency", "PLN"]},
                "type": "$type",
            },
            "total_amount": {"$sum": "$amount"},
            "total_amount_base": {"$sum": {"$ifNull": ["$amount_base", "$amount"]}},
            "count": {"$sum": 1},
        }},
    ]
    summary_raw = await db.transactions.aggregate(summary_pipeline).to_list(100)

    summary = {}
    summary_total_count = 0
    for row in summary_raw:
        cur = row["_id"]["currency"]
        t = row["_id"]["type"]
        if cur not in summary:
            summary[cur] = {"income": 0, "expense": 0, "income_base": 0, "expense_base": 0, "count": 0}
        if t == "income":
            summary[cur]["income"] = row["total_amount"]
            summary[cur]["income_base"] = row["total_amount_base"]
        elif t == "expense":
            summary[cur]["expense"] = row["total_amount"]
            summary[cur]["expense_base"] = row["total_amount_base"]
        summary[cur]["count"] += row["count"]
        summary_total_count += row["count"]

    return {
        "items": items,
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": (total + per_page - 1) // per_page if per_page else 1,
        "summary": summary,
        "summary_total_count": summary_total_count,
    }


@router.post("/transactions", response_model=Transaction)
async def create_transaction(data: TransactionCreate, current_user: dict = Depends(get_current_user)):
    category_name = None
    if data.category_id:
        cat = await db.categories.find_one({"id": data.category_id}, {"_id": 0, "name": 1})
        category_name = cat["name"] if cat else None

    direction = await db.directions.find_one({"id": data.direction_id}, {"_id": 0, "name": 1})
    direction_name = direction["name"] if direction else None

    account = await db.accounts.find_one({"id": data.account_id}, {"_id": 0, "name": 1, "current_balance": 1, "currency": 1})
    account_name = account["name"] if account else None

    # Calculate converted amount if currencies differ
    amount_base, exchange_rate = await calc_amount_base(
        data.amount, data.currency, data.account_id, current_user["user_id"]
    )

    # For transfers: calculate amount in target account's currency
    to_amount_base = None
    to_account_name = None
    if data.to_account_id:
        to_acc = await db.accounts.find_one({"id": data.to_account_id}, {"_id": 0, "name": 1, "currency": 1})
        to_account_name = to_acc["name"] if to_acc else None
        to_amount_base_val, _ = await calc_amount_base(
            data.amount, data.currency, data.to_account_id, current_user["user_id"]
        )
        to_amount_base = to_amount_base_val

    contractor_name = None
    if data.contractor_id:
        contractor = await db.contractors.find_one({"id": data.contractor_id}, {"_id": 0, "name": 1})
        contractor_name = contractor["name"] if contractor else None

    transaction = Transaction(
        **data.model_dump(),
        user_id=current_user["user_id"],
        category_name=category_name,
        direction_name=direction_name,
        account_name=account_name,
        to_account_name=to_account_name,
        contractor_name=contractor_name,
        amount_base=amount_base,
        to_amount_base=to_amount_base,
        exchange_rate=exchange_rate,
        source="manual"
    )

    await db.transactions.insert_one(transaction.model_dump())

    await update_account_balance(data.account_id, current_user["user_id"])
    if data.to_account_id:
        await update_account_balance(data.to_account_id, current_user["user_id"])

    updated_account = await db.accounts.find_one({"id": data.account_id}, {"_id": 0, "current_balance": 1})
    transaction.balance_after = updated_account["current_balance"] if updated_account else 0

    await db.transactions.update_one(
        {"id": transaction.id},
        {"$set": {"balance_after": transaction.balance_after}}
    )

    return transaction


@router.put("/transactions/{transaction_id}", response_model=Transaction)
async def update_transaction(transaction_id: str, data: TransactionCreate, current_user: dict = Depends(get_current_user)):
    old_transaction = await db.transactions.find_one({"id": transaction_id, "user_id": current_user["user_id"]}, {"_id": 0})
    if not old_transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")

    category_name = None
    if data.category_id:
        cat = await db.categories.find_one({"id": data.category_id}, {"_id": 0, "name": 1})
        category_name = cat["name"] if cat else None

    direction = await db.directions.find_one({"id": data.direction_id}, {"_id": 0, "name": 1})
    direction_name = direction["name"] if direction else None

    account = await db.accounts.find_one({"id": data.account_id}, {"_id": 0, "name": 1})
    account_name = account["name"] if account else None

    # Calculate converted amount
    amount_base, exchange_rate = await calc_amount_base(
        data.amount, data.currency, data.account_id, current_user["user_id"]
    )

    to_amount_base = None
    to_account_name = None
    if data.to_account_id:
        to_acc = await db.accounts.find_one({"id": data.to_account_id}, {"_id": 0, "name": 1})
        to_account_name = to_acc["name"] if to_acc else None
        to_amount_base_val, _ = await calc_amount_base(
            data.amount, data.currency, data.to_account_id, current_user["user_id"]
        )
        to_amount_base = to_amount_base_val

    contractor_name = None
    if data.contractor_id:
        contractor = await db.contractors.find_one({"id": data.contractor_id}, {"_id": 0, "name": 1})
        contractor_name = contractor["name"] if contractor else None

    update_data = data.model_dump()
    update_data["category_name"] = category_name
    update_data["direction_name"] = direction_name
    update_data["account_name"] = account_name
    update_data["to_account_name"] = to_account_name
    update_data["contractor_name"] = contractor_name
    update_data["amount_base"] = amount_base
    update_data["to_amount_base"] = to_amount_base
    update_data["exchange_rate"] = exchange_rate

    await db.transactions.update_one(
        {"id": transaction_id, "user_id": current_user["user_id"]},
        {"$set": update_data}
    )

    await update_account_balance(data.account_id, current_user["user_id"])
    if old_transaction.get("account_id") != data.account_id:
        await update_account_balance(old_transaction["account_id"], current_user["user_id"])
    if data.to_account_id:
        await update_account_balance(data.to_account_id, current_user["user_id"])

    transaction = await db.transactions.find_one({"id": transaction_id}, {"_id": 0})
    return transaction


@router.delete("/transactions/{transaction_id}")
async def delete_transaction(transaction_id: str, current_user: dict = Depends(get_current_user)):
    transaction = await db.transactions.find_one({"id": transaction_id, "user_id": current_user["user_id"]}, {"_id": 0})
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")

    await db.transactions.delete_one({"id": transaction_id})

    await update_account_balance(transaction["account_id"], current_user["user_id"])
    if transaction.get("to_account_id"):
        await update_account_balance(transaction["to_account_id"], current_user["user_id"])

    return {"status": "deleted"}


@router.post("/import/preview")
async def preview_import(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    content = await file.read()

    rows = []
    if file.filename.endswith('.csv'):
        text = content.decode('utf-8')
        reader = csv.DictReader(io.StringIO(text))
        rows = list(reader)
    elif file.filename.endswith('.xlsx'):
        import openpyxl
        wb = openpyxl.load_workbook(io.BytesIO(content))
        ws = wb.active
        headers = [cell.value for cell in ws[1]]
        for row in ws.iter_rows(min_row=2, values_only=True):
            if any(row):
                rows.append(dict(zip(headers, row)))

    columns = list(rows[0].keys()) if rows else []

    return {
        "columns": columns,
        "preview": rows[:100],
        "total_rows": len(rows)
    }


@router.post("/import/process")
async def process_import(
    file: UploadFile = File(...),
    date_column: str = Query(...),
    amount_column: str = Query(...),
    description_column: str = Query(...),
    type_column: Optional[str] = None,
    account_id: str = Query(...),
    direction_id: str = Query(...),
    current_user: dict = Depends(get_current_user)
):
    content = await file.read()

    rows = []
    if file.filename.endswith('.csv'):
        text = content.decode('utf-8')
        reader = csv.DictReader(io.StringIO(text))
        rows = list(reader)
    elif file.filename.endswith('.xlsx'):
        import openpyxl
        wb = openpyxl.load_workbook(io.BytesIO(content))
        ws = wb.active
        headers = [cell.value for cell in ws[1]]
        for row in ws.iter_rows(min_row=2, values_only=True):
            if any(row):
                rows.append(dict(zip(headers, row)))

    rules = await db.auto_rules.find({"user_id": current_user["user_id"], "is_active": True}, {"_id": 0}).to_list(100)

    account = await db.accounts.find_one({"id": account_id}, {"_id": 0, "name": 1})
    direction = await db.directions.find_one({"id": direction_id}, {"_id": 0, "name": 1})

    imported = []
    duplicates = []

    for row in rows:
        try:
            date_val = str(row.get(date_column, ""))
            amount_val = row.get(amount_column, 0)
            description = str(row.get(description_column, ""))

            if isinstance(date_val, str) and date_val:
                for fmt in ["%Y-%m-%d", "%d.%m.%Y", "%d/%m/%Y", "%Y/%m/%d"]:
                    try:
                        parsed_date = datetime.strptime(date_val.strip(), fmt)
                        date_str = parsed_date.strftime("%Y-%m-%d")
                        break
                    except ValueError:
                        date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            else:
                date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

            if isinstance(amount_val, str):
                amount_val = amount_val.replace(",", ".").replace(" ", "")
            amount = abs(float(amount_val))

            trans_type = "expense"
            if type_column and row.get(type_column):
                type_val = str(row.get(type_column, "")).lower()
                if "income" in type_val or "приход" in type_val or "+" in type_val:
                    trans_type = "income"
            elif float(amount_val) > 0:
                trans_type = "income"

            existing = await db.transactions.find_one({
                "user_id": current_user["user_id"],
                "date": date_str,
                "amount": amount,
                "description": description
            }, {"_id": 0})

            if existing:
                duplicates.append({"date": date_str, "amount": amount, "description": description})
                continue

            category_id = None
            category_name = None
            matched_direction_id = direction_id
            matched_direction_name = direction["name"] if direction else None
            matched = False

            for rule in rules:
                if rule["pattern"].lower() in description.lower():
                    if rule.get("category_id"):
                        category_id = rule["category_id"]
                        cat = await db.categories.find_one({"id": category_id}, {"_id": 0, "name": 1})
                        category_name = cat["name"] if cat else None
                    if rule.get("direction_id"):
                        matched_direction_id = rule["direction_id"]
                        dir_doc = await db.directions.find_one({"id": matched_direction_id}, {"_id": 0, "name": 1})
                        matched_direction_name = dir_doc["name"] if dir_doc else None
                    matched = True
                    break

            transaction = Transaction(
                date=date_str,
                type=trans_type,
                amount=amount,
                currency="PLN",
                category_id=category_id,
                category_name=category_name,
                direction_id=matched_direction_id,
                direction_name=matched_direction_name,
                account_id=account_id,
                account_name=account["name"] if account else None,
                description=description,
                source="import",
                status="fact",
                user_id=current_user["user_id"]
            )

            await db.transactions.insert_one(transaction.model_dump())
            imported.append({
                "id": transaction.id,
                "date": date_str,
                "type": trans_type,
                "amount": amount,
                "description": description,
                "category_name": category_name,
                "direction_name": matched_direction_name,
                "matched": matched
            })

        except Exception as e:
            logger.error(f"Error importing row: {e}")
            continue

    await update_account_balance(account_id, current_user["user_id"])

    return {
        "imported_count": len(imported),
        "duplicate_count": len(duplicates),
        "imported": imported,
        "duplicates": duplicates
    }



@router.get("/transactions/descriptions/suggestions")
async def get_description_suggestions(
    q: str = "",
    current_user: dict = Depends(get_current_user)
):
    """Return popular transaction descriptions for autocomplete."""
    query = {"user_id": current_user["user_id"], "description": {"$exists": True, "$ne": ""}}
    if q:
        query["description"] = {"$regex": q, "$options": "i"}

    pipeline = [
        {"$match": query},
        {"$group": {"_id": "$description", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 20},
    ]
    results = await db.transactions.aggregate(pipeline).to_list(20)
    return [{"description": r["_id"], "count": r["count"]} for r in results if r["_id"]]


@router.put("/transactions/{transaction_id}/review")
async def toggle_needs_review(
    transaction_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Toggle the needs_review flag on a transaction."""
    tx = await db.transactions.find_one(
        {"id": transaction_id, "user_id": current_user["user_id"]},
        {"_id": 0, "needs_review": 1}
    )
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")

    new_val = not tx.get("needs_review", False)
    await db.transactions.update_one(
        {"id": transaction_id},
        {"$set": {"needs_review": new_val}}
    )
    return {"needs_review": new_val}
