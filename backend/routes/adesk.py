from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import StreamingResponse
from typing import Optional
from datetime import datetime, timezone
import uuid
import csv
import io
import httpx
import logging

from database import db
from auth import get_current_user
from models import (
    AdeskConnectionTest, AdeskMigrationStart,
    AdeskDraftUpdate, AdeskBulkUpdate
)
from services.balance import update_account_balance

router = APIRouter(prefix="/api")
logger = logging.getLogger(__name__)


@router.post("/adesk/test-connection")
async def test_adesk_connection(
    data: AdeskConnectionTest,
    current_user: dict = Depends(get_current_user)
):
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                "https://api.adesk.ru/v1/transactions",
                params={
                    "api_token": data.api_token,
                    "range": "all_time",
                    "length": 10,
                    "start": 0
                }
            )
            logger.info(f"Adesk test: status={response.status_code}")

            if response.status_code == 200:
                result = response.json()
                if isinstance(result, list):
                    count = len(result)
                elif isinstance(result, dict):
                    count = result.get("recordsTotal", result.get("recordsFiltered", len(result.get("data", []))))
                else:
                    count = 0

                return {
                    "status": "success",
                    "message": f"Подключение успешно. Найдено операций: {count}",
                    "transactions_count": count
                }
            elif response.status_code in (401, 403):
                return {"status": "error", "message": "Неверный API токен"}
            else:
                return {"status": "error", "message": f"Ошибка API: {response.status_code}"}

    except httpx.TimeoutException:
        return {"status": "error", "message": "Таймаут подключения к Adesk"}
    except Exception as e:
        logger.error(f"Adesk connection error: {e}")
        return {"status": "error", "message": f"Ошибка: {str(e)}"}


def normalize_currency(raw) -> str:
    """Normalize currency from Adesk to PLN/EUR/USD"""
    if isinstance(raw, (int, float)):
        return {1: "RUB", 2: "USD", 3: "EUR", 4: "PLN"}.get(int(raw), "PLN")
    if not isinstance(raw, str) or not raw.strip():
        return "PLN"
    norm = raw.strip().upper()
    if norm in ["PLN", "ZŁ", "ZL", "ZLOTY"]:
        return "PLN"
    elif norm in ["EUR", "EURO", "€"]:
        return "EUR"
    elif norm in ["USD", "DOLLAR", "$"]:
        return "USD"
    return norm if norm in ["PLN", "EUR", "USD"] else "PLN"


def detect_currency_from_name(name: str) -> Optional[str]:
    """Detect currency from account name as fallback"""
    n = name.lower()
    if "eur" in n or "евро" in n or "€" in n:
        return "EUR"
    elif "usd" in n or "доллар" in n or "$" in n:
        return "USD"
    return None


@router.post("/adesk/start-migration")
async def start_adesk_migration(
    data: AdeskMigrationStart,
    current_user: dict = Depends(get_current_user)
):
    batch_id = str(uuid.uuid4())
    user_id = current_user["user_id"]

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            # Load existing entities for mapping
            categories = await db.categories.find({"user_id": user_id}, {"_id": 0}).to_list(200)
            directions = await db.directions.find({"user_id": user_id}, {"_id": 0}).to_list(50)
            contractors = await db.contractors.find({"user_id": user_id}, {"_id": 0}).to_list(500)
            accounts = await db.accounts.find({"user_id": user_id}, {"_id": 0}).to_list(50)

            category_map = {c["name"].lower(): c for c in categories}
            direction_map = {d["name"].lower(): d for d in directions}
            contractor_map = {c["name"].lower(): c for c in contractors}
            account_map = {a["name"].lower(): a for a in accounts}

            # Project name -> direction mapping
            project_direction_keywords = {
                "теплиц": "теплицы",
                "саун": "сауны",
                "купел": "купели",
                "бан": "сауны",
            }

            drafts_created = 0
            auto_imported = 0
            errors = 0
            seen_adesk_ids = set()

            if data.migrate_transactions:
                start_offset = 0
                page_size = 1000

                while True:
                    # Build date range for Adesk API
                    start_date = data.date_from.replace("-", ".")
                    end_date = data.date_to.replace("-", ".")
                    # Convert YYYY.MM.DD -> DD.MM.YYYY if needed
                    if len(start_date) == 10 and start_date[4] == ".":
                        parts = start_date.split(".")
                        start_date = f"{parts[2]}.{parts[1]}.{parts[0]}"
                    if len(end_date) == 10 and end_date[4] == ".":
                        parts = end_date.split(".")
                        end_date = f"{parts[2]}.{parts[1]}.{parts[0]}"

                    response = await client.get(
                        "https://api.adesk.ru/v1/transactions",
                        params={
                            "api_token": data.api_token,
                            "range": "custom",
                            "startDate": start_date,
                            "endDate": end_date,
                            "length": page_size,
                            "start": start_offset
                        }
                    )

                    logger.info(f"Adesk page start={start_offset}: status={response.status_code}")

                    if response.status_code != 200:
                        logger.error(f"Adesk API error: {response.text[:500]}")
                        break

                    result = response.json()

                    # Parse response - Adesk uses DataTables format
                    if isinstance(result, list):
                        transactions = result
                    elif isinstance(result, dict):
                        transactions = result.get("data", result.get("items", result.get("transactions", [])))
                    else:
                        transactions = []

                    logger.info(f"Adesk offset={start_offset}: {len(transactions)} transactions")

                    if not transactions:
                        break

                    # Log raw structure of first transaction
                    if start_offset == 0 and transactions:
                        sample = transactions[0]
                        logger.info(f"Adesk sample keys: {list(sample.keys())}")
                        logger.info(f"Adesk sample bankAccount: {sample.get('bankAccount')}")
                        logger.info(f"Adesk sample project: {sample.get('project')}")
                        logger.info(f"Adesk sample type: {sample.get('type')}, isTransfer: {sample.get('isTransfer')}")
                        logger.info(f"Adesk sample dateIso: {sample.get('dateIso')}")

                    # Check for duplicate page (infinite loop prevention)
                    new_count = 0
                    for tx in transactions:
                        tid = str(tx.get("id", ""))
                        if tid not in seen_adesk_ids:
                            new_count += 1
                        seen_adesk_ids.add(tid)

                    if new_count == 0:
                        logger.info(f"All {len(transactions)} transactions already seen, stopping")
                        break

                    # Safety limit
                    if start_offset > 50000:
                        logger.warning("Migration stopped: offset limit reached")
                        break

                    for tx in transactions:
                        try:
                            adesk_id = str(tx.get("id", ""))

                            # Skip if already processed
                            existing = await db.adesk_drafts.find_one({
                                "adesk_id": adesk_id, "user_id": user_id
                            })
                            if existing:
                                continue
                            existing_trans = await db.transactions.find_one({
                                "adesk_id": adesk_id, "user_id": user_id
                            })
                            if existing_trans:
                                continue

                            # === PARSE ADESK TRANSACTION ===

                            # Type
                            is_transfer = tx.get("isTransfer") == True
                            if is_transfer:
                                # Adesk provides transfers as TWO separate operations:
                                # - Debit side (type=2): money leaves the account → expense
                                # - Credit side (type=1): money enters the account → income
                                # We map them to income/expense for correct balance calculation
                                if tx.get("type") == 1:
                                    t_type = "income"
                                else:
                                    t_type = "expense"
                            elif tx.get("type") == 1:
                                t_type = "income"
                            else:
                                t_type = "expense"

                            # Amount
                            raw_amount = tx.get("amount", 0)
                            if isinstance(raw_amount, str):
                                raw_amount = raw_amount.replace(",", ".").replace(" ", "")
                            amount = abs(float(raw_amount))

                            # Date from dateIso
                            date_iso = tx.get("dateIso", "") or tx.get("date", "")
                            if date_iso and "T" in date_iso:
                                parsed_date = date_iso[:10]  # YYYY-MM-DD
                            elif date_iso and "." in date_iso:
                                parts = date_iso.split(".")
                                if len(parts) == 3:
                                    if len(parts[0]) == 4:
                                        parsed_date = f"{parts[0]}-{parts[1]}-{parts[2]}"
                                    else:
                                        parsed_date = f"{parts[2]}-{parts[1]}-{parts[0]}"
                                else:
                                    parsed_date = date_iso[:10]
                            elif date_iso:
                                parsed_date = date_iso[:10]
                            else:
                                parsed_date = data.date_from

                            # === BANK ACCOUNT + CURRENCY ===
                            bank_account = tx.get("bankAccount") or {}
                            account_adesk = bank_account.get("name", "") if isinstance(bank_account, dict) else ""
                            raw_currency = bank_account.get("currency", "") if isinstance(bank_account, dict) else ""
                            exchange_rate = tx.get("exchangeRate", 1.0)

                            # Normalize currency
                            currency = normalize_currency(raw_currency)
                            # Fallback: detect from account name
                            if currency == "PLN" and account_adesk:
                                detected = detect_currency_from_name(account_adesk)
                                if detected:
                                    currency = detected

                            logger.info(f"tx {adesk_id}: account='{account_adesk}', raw_currency='{raw_currency}', currency='{currency}', type={t_type}")

                            # Find or create account
                            mapped_account = account_map.get(account_adesk.lower()) if account_adesk else None

                            if account_adesk and not mapped_account:
                                new_account = {
                                    "id": str(uuid.uuid4()),
                                    "name": account_adesk,
                                    "type": "checking",
                                    "currency": currency,
                                    "bank": None,
                                    "initial_balance": 0,
                                    "current_balance": 0,
                                    "is_active": True,
                                    "user_id": user_id
                                }
                                await db.accounts.insert_one(new_account)
                                account_map[account_adesk.lower()] = new_account
                                mapped_account = new_account
                                accounts.append(new_account)
                                logger.info(f"Created account: '{account_adesk}' ({currency})")

                            if not mapped_account and accounts:
                                mapped_account = accounts[0]

                            # === PROJECT -> DIRECTION ===
                            project_raw = tx.get("project")
                            project_name = ""
                            if isinstance(project_raw, dict) and project_raw:
                                project_name = project_raw.get("name", "")

                            mapped_dir = None
                            if project_name:
                                # Try keyword matching first
                                for keyword, dir_name in project_direction_keywords.items():
                                    if keyword in project_name.lower():
                                        mapped_dir = direction_map.get(dir_name)
                                        break

                                # Try exact name match
                                if not mapped_dir:
                                    mapped_dir = direction_map.get(project_name.lower())

                                # Auto-create direction from project
                                if not mapped_dir:
                                    new_dir = {
                                        "id": str(uuid.uuid4()),
                                        "name": project_name,
                                        "color": "gray",
                                        "description": "Импортировано из Adesk",
                                        "is_active": True,
                                        "user_id": user_id
                                    }
                                    await db.directions.insert_one(new_dir)
                                    direction_map[project_name.lower()] = new_dir
                                    mapped_dir = new_dir
                                    directions.append(new_dir)
                                    logger.info(f"Created direction from project: '{project_name}'")

                            if not mapped_dir:
                                mapped_dir = direction_map.get("общее") or (directions[0] if directions else None)

                            # === CATEGORY ===
                            cat_raw = tx.get("category") or {}
                            cat_adesk = cat_raw.get("name", "") if isinstance(cat_raw, dict) else ""
                            cat_adesk_type = cat_raw.get("type") if isinstance(cat_raw, dict) else None

                            mapped_cat = category_map.get(cat_adesk.lower()) if cat_adesk else None

                            if cat_adesk and not mapped_cat:
                                if cat_adesk_type == 1:
                                    cat_type = "income"
                                elif cat_adesk_type == 2:
                                    cat_type = "expense"
                                else:
                                    cat_type = "expense" if t_type in ("transfer", "expense") else t_type

                                new_cat = {
                                    "id": str(uuid.uuid4()),
                                    "name": cat_adesk,
                                    "type": cat_type,
                                    "group": "Импорт из Adesk",
                                    "is_active": True,
                                    "user_id": user_id
                                }
                                await db.categories.insert_one(new_cat)
                                category_map[cat_adesk.lower()] = new_cat
                                mapped_cat = new_cat
                                logger.info(f"Created category: '{cat_adesk}' ({cat_type})")

                            # === CONTRACTOR ===
                            contr_raw = tx.get("contractor") or {}
                            contractor_adesk = contr_raw.get("name", "") if isinstance(contr_raw, dict) else ""

                            mapped_contractor = contractor_map.get(contractor_adesk.lower()) if contractor_adesk else None

                            if contractor_adesk and not mapped_contractor:
                                new_contractor = {
                                    "id": str(uuid.uuid4()),
                                    "name": contractor_adesk,
                                    "type": "client" if t_type == "income" else "supplier",
                                    "group": "Импорт из Adesk",
                                    "is_active": True,
                                    "user_id": user_id
                                }
                                await db.contractors.insert_one(new_contractor)
                                contractor_map[contractor_adesk.lower()] = new_contractor
                                mapped_contractor = new_contractor
                                logger.info(f"Created contractor: '{contractor_adesk}'")

                            # === DETERMINE STATUS ===
                            status = "ready"
                            error_reason = None

                            if not mapped_cat:
                                status = "needs_review"
                                error_reason = "Не указана категория"
                            elif not mapped_dir:
                                status = "needs_review"
                                error_reason = "Не указано направление"
                            elif not mapped_account:
                                status = "needs_review"
                                error_reason = "Не указан счёт"

                            description = tx.get("description", "") or tx.get("comment", "") or ""

                            # === AUTO-IMPORT or CREATE DRAFT ===
                            if mapped_cat and mapped_dir and mapped_account:
                                transaction = {
                                    "id": str(uuid.uuid4()),
                                    "date": parsed_date,
                                    "type": t_type,
                                    "amount": amount,
                                    "currency": currency,
                                    "exchange_rate": exchange_rate,
                                    "is_transfer": is_transfer,
                                    "category_id": mapped_cat["id"],
                                    "category_name": mapped_cat["name"],
                                    "direction_id": mapped_dir["id"],
                                    "direction_name": mapped_dir["name"],
                                    "account_id": mapped_account["id"],
                                    "account_name": mapped_account["name"],
                                    "contractor_id": mapped_contractor["id"] if mapped_contractor else None,
                                    "contractor_name": mapped_contractor["name"] if mapped_contractor else None,
                                    "project_id": None,
                                    "description": description,
                                    "status": "fact",
                                    "source": "adesk_migration",
                                    "adesk_id": adesk_id,
                                    "balance_after": 0,
                                    "user_id": user_id,
                                    "created_at": datetime.now(timezone.utc).isoformat()
                                }

                                await db.transactions.insert_one(transaction)
                                await update_account_balance(mapped_account["id"], user_id)
                                auto_imported += 1
                            else:
                                draft = {
                                    "id": str(uuid.uuid4()),
                                    "created_at": datetime.now(timezone.utc).isoformat(),
                                    "adesk_id": adesk_id,
                                    "date": parsed_date,
                                    "type": t_type,
                                    "amount": amount,
                                    "currency": currency,
                                    "category_adesk": cat_adesk,
                                    "category_id": mapped_cat["id"] if mapped_cat else None,
                                    "category_name": mapped_cat["name"] if mapped_cat else None,
                                    "project_adesk": project_name,
                                    "direction_id": mapped_dir["id"] if mapped_dir else None,
                                    "direction_name": mapped_dir["name"] if mapped_dir else None,
                                    "contractor_adesk": contractor_adesk,
                                    "contractor_id": mapped_contractor["id"] if mapped_contractor else None,
                                    "contractor_name": mapped_contractor["name"] if mapped_contractor else None,
                                    "account_adesk": account_adesk,
                                    "account_id": mapped_account["id"] if mapped_account else None,
                                    "account_name": mapped_account["name"] if mapped_account else None,
                                    "description": description,
                                    "status": status,
                                    "error_reason": error_reason,
                                    "user_id": user_id,
                                    "batch_id": batch_id
                                }
                                await db.adesk_drafts.insert_one(draft)
                                drafts_created += 1

                        except Exception as e:
                            logger.error(f"Error processing Adesk tx {tx.get('id')}: {e}", exc_info=True)
                            errors += 1

                    start_offset += len(transactions)

                    if len(transactions) < page_size:
                        break

            review_count = await db.adesk_drafts.count_documents(
                {"batch_id": batch_id, "status": "needs_review"}
            )

            return {
                "status": "success",
                "batch_id": batch_id,
                "imported": auto_imported,
                "drafts_created": drafts_created,
                "needs_review": review_count,
                "errors": errors,
                "message": f"Импортировано: {auto_imported}, на проверку: {review_count}, ошибок: {errors}"
            }

    except Exception as e:
        logger.error(f"Migration error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Ошибка миграции: {str(e)}")


# === DRAFTS CRUD ===

@router.get("/adesk/drafts")
async def get_adesk_drafts(
    batch_id: Optional[str] = None,
    status: Optional[str] = None,
    page: int = 1,
    limit: int = 50,
    current_user: dict = Depends(get_current_user)
):
    query = {"user_id": current_user["user_id"]}
    if batch_id:
        query["batch_id"] = batch_id
    if status:
        query["status"] = status

    total = await db.adesk_drafts.count_documents(query)
    drafts = await db.adesk_drafts.find(query, {"_id": 0}).sort("date", -1).skip((page - 1) * limit).limit(limit).to_list(limit)

    stats = {
        "total": total,
        "ready": await db.adesk_drafts.count_documents({**query, "status": "ready"}),
        "needs_review": await db.adesk_drafts.count_documents({**query, "status": "needs_review"}),
        "error": await db.adesk_drafts.count_documents({**query, "status": "error"}),
        "imported": await db.adesk_drafts.count_documents({**query, "status": "imported"})
    }

    return {"drafts": drafts, "stats": stats, "page": page, "limit": limit, "total": total}


@router.put("/adesk/drafts/{draft_id}")
async def update_adesk_draft(
    draft_id: str,
    data: AdeskDraftUpdate,
    current_user: dict = Depends(get_current_user)
):
    draft = await db.adesk_drafts.find_one(
        {"id": draft_id, "user_id": current_user["user_id"]}, {"_id": 0}
    )
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")

    update_data = {}

    if data.category_id:
        cat = await db.categories.find_one({"id": data.category_id}, {"_id": 0})
        if cat:
            update_data["category_id"] = cat["id"]
            update_data["category_name"] = cat["name"]

    if data.direction_id:
        dir_obj = await db.directions.find_one({"id": data.direction_id}, {"_id": 0})
        if dir_obj:
            update_data["direction_id"] = dir_obj["id"]
            update_data["direction_name"] = dir_obj["name"]

    if data.contractor_id:
        contractor = await db.contractors.find_one({"id": data.contractor_id}, {"_id": 0})
        if contractor:
            update_data["contractor_id"] = contractor["id"]
            update_data["contractor_name"] = contractor["name"]

    if data.account_id:
        account = await db.accounts.find_one({"id": data.account_id}, {"_id": 0})
        if account:
            update_data["account_id"] = account["id"]
            update_data["account_name"] = account["name"]

    if data.description is not None:
        update_data["description"] = data.description

    draft_updated = {**draft, **update_data}
    if draft_updated.get("category_id") and draft_updated.get("direction_id") and draft_updated.get("account_id"):
        update_data["status"] = "ready"

    await db.adesk_drafts.update_one({"id": draft_id}, {"$set": update_data})
    return {"status": "updated"}


@router.post("/adesk/drafts/bulk-update")
async def bulk_update_adesk_drafts(
    data: AdeskBulkUpdate,
    current_user: dict = Depends(get_current_user)
):
    update_data = {}

    if data.category_id:
        cat = await db.categories.find_one({"id": data.category_id}, {"_id": 0})
        if cat:
            update_data["category_id"] = cat["id"]
            update_data["category_name"] = cat["name"]

    if data.direction_id:
        dir_obj = await db.directions.find_one({"id": data.direction_id}, {"_id": 0})
        if dir_obj:
            update_data["direction_id"] = dir_obj["id"]
            update_data["direction_name"] = dir_obj["name"]

    if data.contractor_id:
        contractor = await db.contractors.find_one({"id": data.contractor_id}, {"_id": 0})
        if contractor:
            update_data["contractor_id"] = contractor["id"]
            update_data["contractor_name"] = contractor["name"]

    if data.account_id:
        account = await db.accounts.find_one({"id": data.account_id}, {"_id": 0})
        if account:
            update_data["account_id"] = account["id"]
            update_data["account_name"] = account["name"]

    if update_data:
        await db.adesk_drafts.update_many(
            {"id": {"$in": data.draft_ids}, "user_id": current_user["user_id"]},
            {"$set": update_data}
        )

        for draft_id in data.draft_ids:
            draft = await db.adesk_drafts.find_one({"id": draft_id}, {"_id": 0})
            if draft and draft.get("category_id") and draft.get("direction_id") and draft.get("account_id"):
                await db.adesk_drafts.update_one({"id": draft_id}, {"$set": {"status": "ready"}})

    return {"status": "updated", "count": len(data.draft_ids)}


@router.delete("/adesk/drafts/all")
async def delete_all_adesk_drafts(current_user: dict = Depends(get_current_user)):
    user_id = current_user["user_id"]
    drafts_result = await db.adesk_drafts.delete_many({"user_id": user_id})
    trans_result = await db.transactions.delete_many({"user_id": user_id, "source": "adesk_migration"})

    # Recalculate all account balances
    accounts = await db.accounts.find({"user_id": user_id, "is_active": True}, {"_id": 0, "id": 1}).to_list(50)
    for acc in accounts:
        await update_account_balance(acc["id"], user_id)

    return {
        "status": "deleted",
        "drafts_deleted": drafts_result.deleted_count,
        "transactions_deleted": trans_result.deleted_count
    }


@router.post("/adesk/confirm-ready")
async def confirm_ready_drafts(
    batch_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user["user_id"]
    query = {"user_id": user_id, "status": "ready"}
    if batch_id:
        query["batch_id"] = batch_id

    ready_drafts = await db.adesk_drafts.find(query, {"_id": 0}).to_list(10000)

    imported = 0
    duplicates = 0
    errors = 0

    for draft in ready_drafts:
        try:
            existing = await db.transactions.find_one({
                "user_id": user_id,
                "adesk_id": draft.get("adesk_id"),
            })
            if existing:
                await db.adesk_drafts.update_one(
                    {"id": draft["id"]},
                    {"$set": {"status": "error", "error_reason": "Дубликат операции"}}
                )
                duplicates += 1
                continue

            transaction = {
                "id": str(uuid.uuid4()),
                "date": draft["date"],
                "type": draft["type"],
                "amount": draft["amount"],
                "currency": draft.get("currency", "PLN"),
                "category_id": draft["category_id"],
                "category_name": draft["category_name"],
                "direction_id": draft["direction_id"],
                "direction_name": draft["direction_name"],
                "account_id": draft["account_id"],
                "account_name": draft["account_name"],
                "contractor_id": draft.get("contractor_id"),
                "contractor_name": draft.get("contractor_name"),
                "description": draft.get("description", ""),
                "status": "fact",
                "source": "adesk_migration",
                "adesk_id": draft.get("adesk_id"),
                "balance_after": 0,
                "user_id": user_id,
                "created_at": datetime.now(timezone.utc).isoformat()
            }

            await db.transactions.insert_one(transaction)

            if draft["account_id"]:
                await update_account_balance(draft["account_id"], user_id)

            await db.adesk_drafts.update_one(
                {"id": draft["id"]},
                {"$set": {"status": "imported"}}
            )
            imported += 1

        except Exception as e:
            logger.error(f"Error importing draft {draft['id']}: {e}")
            errors += 1

    return {"status": "success", "imported": imported, "duplicates": duplicates, "errors": errors}


@router.delete("/adesk/drafts/{draft_id}")
async def delete_adesk_draft(draft_id: str, current_user: dict = Depends(get_current_user)):
    await db.adesk_drafts.delete_one({"id": draft_id, "user_id": current_user["user_id"]})
    return {"status": "deleted"}


@router.delete("/adesk/drafts")
async def delete_all_drafts(
    batch_id: Optional[str] = None,
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {"user_id": current_user["user_id"]}
    if batch_id:
        query["batch_id"] = batch_id
    if status:
        query["status"] = status
    result = await db.adesk_drafts.delete_many(query)
    return {"status": "deleted", "count": result.deleted_count}


@router.get("/adesk/export-problems")
async def export_problem_drafts(
    batch_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {
        "user_id": current_user["user_id"],
        "status": {"$in": ["needs_review", "error"]}
    }
    if batch_id:
        query["batch_id"] = batch_id

    drafts = await db.adesk_drafts.find(query, {"_id": 0}).to_list(10000)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Дата", "Тип", "Сумма", "Валюта", "Категория Adesk", "Категория WM",
        "Проект Adesk", "Направление WM", "Контрагент Adesk", "Контрагент WM",
        "Счёт Adesk", "Счёт WM", "Описание", "Статус", "Причина ошибки"
    ])

    for d in drafts:
        writer.writerow([
            d.get("date"), d.get("type"), d.get("amount"), d.get("currency"),
            d.get("category_adesk"), d.get("category_name") or "-",
            d.get("project_adesk"), d.get("direction_name") or "-",
            d.get("contractor_adesk"), d.get("contractor_name") or "-",
            d.get("account_adesk"), d.get("account_name") or "-",
            d.get("description"), d.get("status"), d.get("error_reason") or "-"
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=adesk_problems.csv"}
    )
