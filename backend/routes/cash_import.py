from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timezone
from typing import Optional
import uuid
import re
import csv
import io
import logging
import httpx

from database import db
from auth import get_current_user

router = APIRouter(prefix="/api")
logger = logging.getLogger(__name__)


def extract_sheet_id(url: str) -> str:
    """Extract Google Sheets ID from URL."""
    match = re.search(r'/spreadsheets/d/([a-zA-Z0-9_-]+)', url)
    if not match:
        raise ValueError("Некорректная ссылка на Google Таблицу")
    return match.group(1)


def parse_date(date_str: str) -> Optional[str]:
    """Parse date from various formats to YYYY-MM-DD."""
    for fmt in ("%d.%m.%Y %H:%M:%S", "%d.%m.%Y"):
        try:
            return datetime.strptime(date_str.strip(), fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


def parse_amount(val: str) -> float:
    """Parse amount string, handling commas and spaces."""
    cleaned = val.strip().replace(" ", "").replace(",", ".")
    try:
        return float(cleaned)
    except ValueError:
        return 0.0


@router.post("/cash-import/fetch")
async def fetch_cash_data(
    data: dict,
    current_user: dict = Depends(get_current_user),
):
    """Fetch public Google Sheet and return parsed transactions for a given period."""
    sheet_url = data.get("sheet_url", "").strip()
    date_from = data.get("date_from")
    date_to = data.get("date_to")

    if not sheet_url:
        raise HTTPException(status_code=400, detail="Укажите ссылку на Google Таблицу")
    if not date_from or not date_to:
        raise HTTPException(status_code=400, detail="Укажите период импорта")

    try:
        sheet_id = extract_sheet_id(sheet_url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    csv_url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv"

    try:
        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            resp = await client.get(csv_url)
            if resp.status_code != 200:
                raise HTTPException(
                    status_code=400,
                    detail="Не удалось загрузить таблицу. Убедитесь что она доступна по ссылке (публичный доступ).",
                )
            content = resp.text
    except httpx.RequestError as e:
        logger.error(f"Google Sheets fetch error: {e}")
        raise HTTPException(status_code=500, detail="Ошибка при загрузке таблицы")

    reader = csv.reader(io.StringIO(content))
    rows = list(reader)

    if len(rows) < 2:
        raise HTTPException(status_code=400, detail="Таблица пуста или содержит только заголовок")

    headers = [h.strip().lower() for h in rows[0]]

    # Find column indices
    col_map = {}
    for i, h in enumerate(headers):
        if "дата" in h:
            col_map["date"] = i
        elif "контрагент" in h:
            col_map["contractor"] = i
        elif "сумма" in h:
            col_map["amount"] = i
        elif "назначение" in h:
            col_map["purpose"] = i
        elif "валюта" in h:
            col_map["currency"] = i
        elif "проект" in h:
            col_map["project"] = i
        elif "название счета" in h:
            col_map["account_name"] = i
        elif "сообщение" in h:
            col_map["message"] = i

    if "date" not in col_map or "amount" not in col_map:
        raise HTTPException(
            status_code=400,
            detail="В таблице не найдены обязательные колонки: Дата, Сумма",
        )

    # Get existing transaction hashes for deduplication
    existing_txs = await db.transactions.find(
        {"user_id": current_user["user_id"], "source": "cash_import"},
        {"_id": 0, "date": 1, "amount": 1, "description": 1},
    ).to_list(50000)

    existing_keys = set()
    for tx in existing_txs:
        key = f"{tx.get('date')}_{tx.get('amount')}_{tx.get('description', '')}"
        existing_keys.add(key)

    # Fetch accounts and directions for matching
    accounts = await db.accounts.find(
        {"user_id": current_user["user_id"], "is_active": True},
        {"_id": 0},
    ).to_list(50)

    directions = await db.directions.find(
        {"user_id": current_user["user_id"], "is_active": True},
        {"_id": 0},
    ).to_list(50)

    # Match account by name
    account_map = {a["name"].lower(): a for a in accounts}

    # Match direction by name
    direction_map = {d["name"].lower(): d for d in directions}

    transactions = []
    for row in rows[1:]:
        if len(row) <= col_map.get("date", 0):
            continue

        date_str = row[col_map["date"]].strip() if col_map.get("date") is not None else ""
        if not date_str:
            continue

        parsed_date = parse_date(date_str)
        if not parsed_date:
            continue

        # Filter by period
        if parsed_date < date_from or parsed_date > date_to:
            continue

        amount_raw = row[col_map["amount"]].strip() if col_map.get("amount") is not None else "0"
        amount = parse_amount(amount_raw)
        if amount == 0:
            continue

        contractor = row[col_map["contractor"]].strip() if col_map.get("contractor") is not None and len(row) > col_map["contractor"] else ""
        purpose = row[col_map["purpose"]].strip() if col_map.get("purpose") is not None and len(row) > col_map["purpose"] else ""
        currency = row[col_map["currency"]].strip() if col_map.get("currency") is not None and len(row) > col_map["currency"] else "PLN"
        project = row[col_map["project"]].strip() if col_map.get("project") is not None and len(row) > col_map["project"] else ""
        account_name = row[col_map["account_name"]].strip() if col_map.get("account_name") is not None and len(row) > col_map["account_name"] else ""
        message = row[col_map["message"]].strip() if col_map.get("message") is not None and len(row) > col_map["message"] else ""

        tx_type = "expense" if amount < 0 else "income"
        abs_amount = abs(amount)

        # Auto-match account
        matched_account = account_map.get(account_name.lower())
        account_id = matched_account["id"] if matched_account else ""

        # Auto-match direction by project name
        matched_direction = direction_map.get(project.lower())
        direction_id = matched_direction["id"] if matched_direction else ""

        # Deduplication check
        dedup_key = f"{parsed_date}_{abs_amount}_{purpose}"
        is_duplicate = dedup_key in existing_keys

        transactions.append({
            "date": parsed_date,
            "original_date": date_str,
            "type": tx_type,
            "amount": abs_amount,
            "currency": currency or "PLN",
            "contractor": contractor,
            "description": purpose or message,
            "message": message,
            "project": project,
            "account_name": account_name,
            "account_id": account_id,
            "direction_id": direction_id,
            "direction_name": matched_direction["name"] if matched_direction else "",
            "category_id": "",
            "comment": "",
            "is_duplicate": is_duplicate,
            "needs_review": False,
        })

    # Sort by date desc
    transactions.sort(key=lambda x: x["date"], reverse=True)

    return {
        "transactions": transactions,
        "total": len(transactions),
        "duplicates": sum(1 for t in transactions if t["is_duplicate"]),
        "accounts": [{"id": a["id"], "name": a["name"], "currency": a.get("currency", "PLN")} for a in accounts],
        "directions": [{"id": d["id"], "name": d["name"]} for d in directions],
    }


@router.post("/cash-import/confirm")
async def confirm_cash_import(
    data: dict,
    current_user: dict = Depends(get_current_user),
):
    """Import selected cash transactions."""
    txs = data.get("transactions", [])
    if not txs:
        raise HTTPException(status_code=400, detail="Нет операций для импорта")

    # Get accounts for balance update
    accounts = await db.accounts.find(
        {"user_id": current_user["user_id"], "is_active": True},
        {"_id": 0},
    ).to_list(50)
    account_map = {a["id"]: a for a in accounts}

    # Get categories for matching
    categories = await db.categories.find(
        {"user_id": current_user["user_id"]},
        {"_id": 0},
    ).to_list(500)
    category_map = {c["id"]: c for c in categories}

    # Get directions
    directions = await db.directions.find(
        {"user_id": current_user["user_id"]},
        {"_id": 0},
    ).to_list(50)
    direction_map = {d["id"]: d for d in directions}

    # Load contractor→category rules
    rules = await db.contractor_category_rules.find(
        {"user_id": current_user["user_id"]},
        {"_id": 0},
    ).to_list(5000)
    rule_map = {r["contractor_name_upper"]: r["category_id"] for r in rules}

    imported = []
    balance_updates = {}
    transfer_target_accounts = set()

    for t in txs:
        account_id = t.get("account_id", "")
        account = account_map.get(account_id)

        direction_id = t.get("direction_id", "")
        direction = direction_map.get(direction_id)

        category_id = t.get("category_id", "")
        category_name = ""
        if category_id:
            cat = category_map.get(category_id)
            category_name = cat["name"] if cat else ""

        # Try auto-category from rules
        if not category_id and t.get("description"):
            desc_upper = t["description"].strip().upper()
            if desc_upper in rule_map:
                category_id = rule_map[desc_upper]
                cat = category_map.get(category_id)
                category_name = cat["name"] if cat else ""

        tx_type = t.get("type", "expense")
        to_account_id = t.get("to_account_id") or None

        transaction = {
            "id": str(uuid.uuid4()),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "date": t["date"],
            "type": tx_type,
            "amount": abs(float(t["amount"])),
            "currency": t.get("currency", "PLN"),
            "category_id": category_id,
            "category_name": category_name,
            "direction_id": direction_id,
            "direction_name": direction["name"] if direction else t.get("direction_name", ""),
            "account_id": account_id,
            "account_name": account["name"] if account else t.get("account_name", ""),
            "to_account_id": to_account_id,
            "contractor_id": None,
            "contractor_name": t.get("contractor", ""),
            "description": t.get("description", ""),
            "comment": t.get("comment", ""),
            "source": "cash_import",
            "status": "fact",
            "is_recurring": False,
            "needs_review": bool(t.get("needs_review", False)),
            "balance_after": 0,
            "user_id": current_user["user_id"],
        }

        await db.transactions.insert_one(transaction)
        transaction.pop("_id", None)
        imported.append(transaction)

        # Track balance updates per account
        if account_id:
            if account_id not in balance_updates:
                balance_updates[account_id] = 0
            if tx_type == "transfer":
                balance_updates[account_id] -= abs(float(t["amount"]))
                if to_account_id:
                    transfer_target_accounts.add(to_account_id)
            else:
                sign = 1 if tx_type == "income" else -1
                balance_updates[account_id] += sign * abs(float(t["amount"]))

    # Update account balances using proper recalculation
    from services.balance import update_account_balance
    for acc_id in balance_updates:
        await update_account_balance(acc_id, current_user["user_id"])
    for target_id in transfer_target_accounts:
        await update_account_balance(target_id, current_user["user_id"])

    return {
        "imported_count": len(imported),
        "balance_updates": {k: round(v, 2) for k, v in balance_updates.items()},
    }


@router.get("/cash-import/settings")
async def get_cash_import_settings(current_user: dict = Depends(get_current_user)):
    """Get saved cash import sheet URLs."""
    settings = await db.integration_settings.find_one(
        {"user_id": current_user["user_id"]},
        {"_id": 0},
    )
    sheets = []
    if settings and settings.get("cash_import_sheets"):
        sheets = settings["cash_import_sheets"]
    return {"sheets": sheets}


@router.put("/cash-import/settings")
async def update_cash_import_settings(
    data: dict,
    current_user: dict = Depends(get_current_user),
):
    """Save cash import sheet URLs."""
    sheets = data.get("sheets", [])
    await db.integration_settings.update_one(
        {"user_id": current_user["user_id"]},
        {"$set": {"cash_import_sheets": sheets}},
        upsert=True,
    )
    return {"status": "saved"}
