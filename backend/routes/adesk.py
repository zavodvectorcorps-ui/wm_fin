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
            params = {
                "api_token": data.api_token,
                "limit": 100,
                "startDate": "01.01.2020",
                "endDate": "31.12.2026"
            }

            response = await client.get(
                "https://api.adesk.ru/v1/transactions",
                params=params
            )
            logger.info(f"Adesk API response: status={response.status_code}")

            if response.status_code == 200:
                data_response = response.json()

                if isinstance(data_response, list):
                    transactions_count = len(data_response)
                elif isinstance(data_response, dict):
                    transactions_count = len(data_response.get("data", data_response.get("items", data_response.get("transactions", []))))
                else:
                    transactions_count = 0

                return {
                    "status": "success",
                    "message": "Подключение успешно",
                    "transactions_count": transactions_count
                }
            elif response.status_code in (401, 403):
                return {"status": "error", "message": "Неверный API токен"}
            else:
                logger.error(f"Adesk API error: {response.status_code} - {response.text[:500]}")
                return {"status": "error", "message": f"Ошибка API: {response.status_code}"}

    except httpx.TimeoutException:
        return {"status": "error", "message": "Таймаут подключения к Adesk"}
    except Exception as e:
        logger.error(f"Adesk connection error: {e}")
        return {"status": "error", "message": f"Ошибка подключения: {str(e)}"}


@router.post("/adesk/start-migration")
async def start_adesk_migration(
    data: AdeskMigrationStart,
    current_user: dict = Depends(get_current_user)
):
    batch_id = str(uuid.uuid4())

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            categories = await db.categories.find({"user_id": current_user["user_id"]}, {"_id": 0}).to_list(200)
            directions = await db.directions.find({"user_id": current_user["user_id"]}, {"_id": 0}).to_list(20)
            contractors = await db.contractors.find({"user_id": current_user["user_id"]}, {"_id": 0}).to_list(500)
            accounts = await db.accounts.find({"user_id": current_user["user_id"]}, {"_id": 0}).to_list(50)

            category_map = {c["name"].lower(): c for c in categories}
            direction_map = {d["name"].lower(): d for d in directions}
            contractor_map = {c["name"].lower(): c for c in contractors}
            account_map = {a["name"].lower(): a for a in accounts}

            project_direction_map = {
                "теплиц": "теплицы",
                "саун": "сауны",
                "купел": "купели",
                "бан": "сауны",
            }

            drafts_created = 0
            errors = 0

            if data.migrate_transactions:
                page = 1
                # FIX: Track all seen transaction IDs to prevent infinite loop
                seen_adesk_ids = set()

                while True:
                    start_date = data.date_from.replace("-", ".") if "-" in data.date_from else data.date_from
                    end_date = data.date_to.replace("-", ".") if "-" in data.date_to else data.date_to

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
                            "startDate": start_date,
                            "endDate": end_date,
                            "limit": 100,
                            "page": page
                        }
                    )

                    logger.info(f"Adesk migration page {page}: status={response.status_code}")

                    if response.status_code != 200:
                        logger.error(f"Adesk API error: {response.text[:500]}")
                        break

                    result = response.json()

                    if isinstance(result, list):
                        transactions = result
                    elif isinstance(result, dict):
                        transactions = result.get("data", result.get("items", result.get("transactions", [])))
                    else:
                        transactions = []

                    logger.info(f"Adesk page {page}: found {len(transactions)} transactions")

                    if not transactions:
                        break

                    # Safety: max 50 pages
                    if page > 50:
                        logger.warning("Migration stopped: reached page limit (50)")
                        break

                    # FIX: Check for duplicate page — if ALL IDs on this page were already seen, break
                    page_ids = set()
                    new_ids_on_page = 0
                    for t in transactions:
                        tid = str(t.get("id", ""))
                        page_ids.add(tid)
                        if tid not in seen_adesk_ids:
                            new_ids_on_page += 1

                    if new_ids_on_page == 0:
                        logger.info(f"Page {page}: all {len(transactions)} transactions already seen, stopping pagination")
                        break

                    seen_adesk_ids.update(page_ids)

                    for t in transactions:
                        try:
                            adesk_id = str(t.get("id", ""))

                            existing = await db.adesk_drafts.find_one({
                                "adesk_id": adesk_id,
                                "user_id": current_user["user_id"]
                            })
                            if existing:
                                continue

                            t_type = "expense"

                            if t.get("isTransfer") == True:
                                t_type = "transfer"
                            elif t.get("type") == 1:
                                t_type = "income"
                            elif t.get("type") == 2:
                                t_type = "expense"
                            else:
                                cat_type = t.get("category", {}).get("type")
                                if cat_type == 1:
                                    t_type = "income"
                                elif cat_type == 2:
                                    t_type = "expense"
                                else:
                                    raw_amount = t.get("amount", 0)
                                    if isinstance(raw_amount, str):
                                        raw_amount = float(raw_amount.replace(",", ".").replace(" ", ""))
                                    if raw_amount > 0:
                                        t_type = "income"
                                    else:
                                        t_type = "expense"

                            raw_amount = t.get("amount", 0)
                            if isinstance(raw_amount, (int, float)) and raw_amount > 0:
                                cat_name_lower = (t.get("category", {}).get("name", "") or t.get("category_name", "") or "").lower()
                                if any(kw in cat_name_lower for kw in ["приход", "доход", "выручка", "оплата от", "клиент"]):
                                    t_type = "income"

                            status = "ready"
                            error_reason = None

                            # AUTO-CREATE CATEGORY
                            cat_adesk = t.get("category", {}).get("name", "") or t.get("category_name", "") or ""
                            cat_adesk_type = t.get("category", {}).get("type")
                            mapped_cat = category_map.get(cat_adesk.lower()) if cat_adesk else None

                            if cat_adesk and not mapped_cat:
                                if cat_adesk_type == 1:
                                    cat_type = "income"
                                elif cat_adesk_type == 2:
                                    cat_type = "expense"
                                else:
                                    # Categories can only be income or expense, not transfer
                                    cat_type = "expense" if t_type == "transfer" else t_type

                                new_cat = {
                                    "id": str(uuid.uuid4()),
                                    "name": cat_adesk,
                                    "type": cat_type,
                                    "group": "Импорт из Adesk",
                                    "is_active": True,
                                    "user_id": current_user["user_id"]
                                }
                                await db.categories.insert_one(new_cat)
                                category_map[cat_adesk.lower()] = new_cat
                                mapped_cat = new_cat
                                logger.info(f"Created category: {cat_adesk} (type: {cat_type})")

                            # AUTO-CREATE DIRECTION
                            project_adesk = t.get("project", {}).get("name", "") or t.get("project_name", "") or ""
                            mapped_dir = None

                            for key, dir_name in project_direction_map.items():
                                if key in project_adesk.lower():
                                    mapped_dir = direction_map.get(dir_name)
                                    break

                            if not mapped_dir and project_adesk:
                                mapped_dir = direction_map.get(project_adesk.lower())

                            if project_adesk and not mapped_dir:
                                new_dir = {
                                    "id": str(uuid.uuid4()),
                                    "name": project_adesk,
                                    "color": "gray",
                                    "description": "Импортировано из Adesk",
                                    "is_active": True,
                                    "user_id": current_user["user_id"]
                                }
                                await db.directions.insert_one(new_dir)
                                direction_map[project_adesk.lower()] = new_dir
                                mapped_dir = new_dir
                                logger.info(f"Created direction: {project_adesk}")

                            if not mapped_dir:
                                mapped_dir = direction_map.get("общее") or (directions[0] if directions else None)

                            # AUTO-CREATE CONTRACTOR
                            contractor_adesk = t.get("contractor", {}).get("name", "") or t.get("contractor_name", "") or ""
                            mapped_contractor = contractor_map.get(contractor_adesk.lower()) if contractor_adesk else None

                            if contractor_adesk and not mapped_contractor:
                                new_contractor = {
                                    "id": str(uuid.uuid4()),
                                    "name": contractor_adesk,
                                    "type": "client" if t_type == "income" else "supplier",
                                    "group": "Импорт из Adesk",
                                    "is_active": True,
                                    "user_id": current_user["user_id"]
                                }
                                await db.contractors.insert_one(new_contractor)
                                contractor_map[contractor_adesk.lower()] = new_contractor
                                mapped_contractor = new_contractor
                                logger.info(f"Created contractor: {contractor_adesk}")

                            # AUTO-CREATE ACCOUNT + CURRENCY DETECTION
                            account_adesk = t.get("account", {}).get("name", "") or t.get("account_name", "") or ""

                            # Extract currency from multiple possible Adesk fields
                            raw_currency = (
                                t.get("account", {}).get("currency")
                                or t.get("account", {}).get("currency_code")
                                or t.get("currency")
                                or t.get("currency_code")
                                or t.get("currencyCode")
                                or ""
                            )
                            # Also check if currency is numeric ID in Adesk
                            if isinstance(raw_currency, (int, float)):
                                # Adesk may use numeric currency IDs
                                raw_currency = {1: "RUB", 2: "USD", 3: "EUR", 4: "PLN"}.get(int(raw_currency), "PLN")

                            adesk_account_currency = "PLN"  # default
                            if isinstance(raw_currency, str) and raw_currency.strip():
                                norm = raw_currency.strip().upper()
                                if norm in ["PLN", "ZŁ", "ZL", "ZLOTY", "ZŁ"]:
                                    adesk_account_currency = "PLN"
                                elif norm in ["EUR", "EURO", "€"]:
                                    adesk_account_currency = "EUR"
                                elif norm in ["USD", "DOLLAR", "$"]:
                                    adesk_account_currency = "USD"
                                else:
                                    adesk_account_currency = norm if norm in ["PLN", "EUR", "USD"] else "PLN"

                            # Fallback: detect currency from account name
                            if adesk_account_currency == "PLN" and account_adesk:
                                acn = account_adesk.lower()
                                if "eur" in acn or "евро" in acn or "€" in acn:
                                    adesk_account_currency = "EUR"
                                elif "usd" in acn or "доллар" in acn or "$" in acn:
                                    adesk_account_currency = "USD"

                            logger.info(f"Adesk tx {t.get('id')}: account='{account_adesk}', raw_currency='{raw_currency}', resolved='{adesk_account_currency}'")

                            mapped_account = account_map.get(account_adesk.lower()) if account_adesk else None

                            if account_adesk and not mapped_account:
                                acc_currency = adesk_account_currency
                                if "eur" in account_adesk.lower():
                                    acc_currency = "EUR"
                                elif "usd" in account_adesk.lower():
                                    acc_currency = "USD"
                                elif "pln" in account_adesk.lower() or "zł" in account_adesk.lower():
                                    acc_currency = "PLN"

                                new_account = {
                                    "id": str(uuid.uuid4()),
                                    "name": account_adesk,
                                    "type": "checking",
                                    "currency": acc_currency,
                                    "bank": None,
                                    "initial_balance": 0,
                                    "current_balance": 0,
                                    "is_active": True,
                                    "user_id": current_user["user_id"]
                                }
                                await db.accounts.insert_one(new_account)
                                account_map[account_adesk.lower()] = new_account
                                mapped_account = new_account
                                logger.info(f"Created account: {account_adesk} (currency: {acc_currency})")

                            if not mapped_account and accounts:
                                mapped_account = accounts[0]

                            if not mapped_cat or not mapped_dir or not mapped_account:
                                status = "needs_review"
                                if not mapped_cat:
                                    error_reason = "Не указана категория"
                                elif not mapped_dir:
                                    error_reason = "Не указано направление"
                                elif not mapped_account:
                                    error_reason = "Не указан счёт"

                            draft = {
                                "id": str(uuid.uuid4()),
                                "created_at": datetime.now(timezone.utc).isoformat(),
                                "adesk_id": str(t.get("id", "")),
                                "date": t.get("date", "")[:10] if t.get("date") else data.date_from,
                                "type": t_type,
                                "amount": abs(float(t.get("amount", 0))),
                                "currency": t.get("currency", "PLN"),
                                "category_adesk": cat_adesk,
                                "category_id": mapped_cat["id"] if mapped_cat else None,
                                "category_name": mapped_cat["name"] if mapped_cat else None,
                                "project_adesk": project_adesk,
                                "direction_id": mapped_dir["id"] if mapped_dir else None,
                                "direction_name": mapped_dir["name"] if mapped_dir else None,
                                "contractor_adesk": contractor_adesk,
                                "contractor_id": mapped_contractor["id"] if mapped_contractor else None,
                                "contractor_name": mapped_contractor["name"] if mapped_contractor else None,
                                "account_adesk": account_adesk,
                                "account_id": mapped_account["id"] if mapped_account else None,
                                "account_name": mapped_account["name"] if mapped_account else None,
                                "description": t.get("description", "") or t.get("comment", ""),
                                "status": status,
                                "error_reason": error_reason,
                                "user_id": current_user["user_id"],
                                "batch_id": batch_id
                            }

                            # AUTO-IMPORT if all fields present
                            if mapped_cat and mapped_dir and mapped_account:
                                existing_trans = await db.transactions.find_one({
                                    "adesk_id": adesk_id,
                                    "user_id": current_user["user_id"]
                                })

                                if not existing_trans:
                                    raw_date = t.get("date", "")
                                    if raw_date and "." in raw_date:
                                        parts = raw_date.split(".")
                                        if len(parts) == 3:
                                            parsed_date = f"{parts[2]}-{parts[1]}-{parts[0]}"
                                        else:
                                            parsed_date = raw_date[:10]
                                    else:
                                        parsed_date = raw_date[:10] if raw_date else data.date_from

                                    trans_currency = mapped_account.get("currency", "PLN") if mapped_account else adesk_account_currency

                                    transaction = {
                                        "id": str(uuid.uuid4()),
                                        "date": parsed_date,
                                        "type": t_type,
                                        "amount": abs(float(t.get("amount", 0))),
                                        "currency": trans_currency,
                                        "category_id": mapped_cat["id"],
                                        "category_name": mapped_cat["name"],
                                        "direction_id": mapped_dir["id"],
                                        "direction_name": mapped_dir["name"],
                                        "account_id": mapped_account["id"],
                                        "account_name": mapped_account["name"],
                                        "contractor_id": mapped_contractor["id"] if mapped_contractor else None,
                                        "contractor_name": mapped_contractor["name"] if mapped_contractor else None,
                                        "description": t.get("description", "") or t.get("comment", ""),
                                        "status": "fact",
                                        "source": "adesk_migration",
                                        "adesk_id": adesk_id,
                                        "balance_after": 0,
                                        "user_id": current_user["user_id"],
                                        "created_at": datetime.now(timezone.utc).isoformat()
                                    }

                                    # FIX: Proper transfer handling — two-sided balance update
                                    if t_type == "transfer":
                                        to_account_adesk = t.get("toAccount", {}).get("name", "") or t.get("to_account", {}).get("name", "") or t.get("accountTo", {}).get("name", "")
                                        to_account_currency = t.get("toAccount", {}).get("currency") or t.get("to_account", {}).get("currency") or adesk_account_currency

                                        mapped_to_account = account_map.get(to_account_adesk.lower()) if to_account_adesk else None

                                        if to_account_adesk and not mapped_to_account:
                                            to_acc_currency = to_account_currency.upper() if isinstance(to_account_currency, str) else "PLN"
                                            if to_acc_currency not in ["PLN", "EUR", "USD"]:
                                                to_acc_currency = "PLN"
                                            if "eur" in to_account_adesk.lower():
                                                to_acc_currency = "EUR"
                                            elif "usd" in to_account_adesk.lower():
                                                to_acc_currency = "USD"

                                            new_to_account = {
                                                "id": str(uuid.uuid4()),
                                                "name": to_account_adesk,
                                                "type": "checking",
                                                "currency": to_acc_currency,
                                                "bank": None,
                                                "initial_balance": 0,
                                                "current_balance": 0,
                                                "is_active": True,
                                                "user_id": current_user["user_id"]
                                            }
                                            await db.accounts.insert_one(new_to_account)
                                            account_map[to_account_adesk.lower()] = new_to_account
                                            mapped_to_account = new_to_account
                                            logger.info(f"Created to_account: {to_account_adesk}")

                                        if mapped_to_account:
                                            transaction["to_account_id"] = mapped_to_account["id"]
                                            transaction["to_account_name"] = mapped_to_account["name"]

                                    await db.transactions.insert_one(transaction)

                                    # Update balances using full recalc for accuracy
                                    await update_account_balance(mapped_account["id"], current_user["user_id"])
                                    if t_type == "transfer" and transaction.get("to_account_id"):
                                        await update_account_balance(transaction["to_account_id"], current_user["user_id"])

                                    drafts_created += 1
                                else:
                                    errors += 1
                            else:
                                await db.adesk_drafts.insert_one(draft)
                                drafts_created += 1

                        except Exception as e:
                            logger.error(f"Error processing Adesk transaction: {e}")
                            errors += 1

                    page += 1
                    if len(transactions) < 100:
                        break

            imported_count = await db.transactions.count_documents({
                "user_id": current_user["user_id"],
                "source": "adesk_migration",
                "created_at": {"$gte": datetime.now(timezone.utc).replace(hour=0, minute=0, second=0).isoformat()}
            })

            review_count = await db.adesk_drafts.count_documents(
                {"batch_id": batch_id, "status": "needs_review"}
            )

            return {
                "status": "success",
                "batch_id": batch_id,
                "imported": imported_count,
                "drafts_created": drafts_created,
                "needs_review": review_count,
                "errors": errors,
                "message": f"Импортировано {imported_count} операций"
            }

    except Exception as e:
        logger.error(f"Migration error: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка миграции: {str(e)}")


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

    return {
        "drafts": drafts,
        "stats": stats,
        "page": page,
        "limit": limit,
        "total": total
    }


@router.put("/adesk/drafts/{draft_id}")
async def update_adesk_draft(
    draft_id: str,
    data: AdeskDraftUpdate,
    current_user: dict = Depends(get_current_user)
):
    draft = await db.adesk_drafts.find_one(
        {"id": draft_id, "user_id": current_user["user_id"]},
        {"_id": 0}
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

    await db.adesk_drafts.update_one(
        {"id": draft_id},
        {"$set": update_data}
    )

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
                await db.adesk_drafts.update_one(
                    {"id": draft_id},
                    {"$set": {"status": "ready"}}
                )

    return {"status": "updated", "count": len(data.draft_ids)}


@router.delete("/adesk/drafts/all")
async def delete_all_adesk_drafts(
    current_user: dict = Depends(get_current_user)
):
    drafts_result = await db.adesk_drafts.delete_many({"user_id": current_user["user_id"]})

    trans_result = await db.transactions.delete_many({
        "user_id": current_user["user_id"],
        "source": "adesk_migration"
    })

    await db.accounts.update_many(
        {"user_id": current_user["user_id"]},
        [{"$set": {"current_balance": "$initial_balance"}}]
    )

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
    """Confirm and import all ready drafts into main database"""
    query = {"user_id": current_user["user_id"], "status": "ready"}
    if batch_id:
        query["batch_id"] = batch_id

    ready_drafts = await db.adesk_drafts.find(query, {"_id": 0}).to_list(10000)

    imported = 0
    duplicates = 0
    errors = 0

    for draft in ready_drafts:
        try:
            existing = await db.transactions.find_one({
                "user_id": current_user["user_id"],
                "date": draft["date"],
                "amount": draft["amount"],
                "account_id": draft["account_id"]
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
                "currency": draft["currency"],
                "category_id": draft["category_id"],
                "category_name": draft["category_name"],
                "direction_id": draft["direction_id"],
                "direction_name": draft["direction_name"],
                "account_id": draft["account_id"],
                "account_name": draft["account_name"],
                "contractor_id": draft["contractor_id"],
                "contractor_name": draft["contractor_name"],
                "description": draft["description"],
                "status": "fact",
                "source": "adesk_migration",
                "adesk_id": draft["adesk_id"],
                "balance_after": 0,
                "user_id": current_user["user_id"],
                "created_at": datetime.now(timezone.utc).isoformat()
            }

            await db.transactions.insert_one(transaction)

            # FIX: Use full recalc for accurate balance, handles transfers correctly
            if draft["account_id"]:
                await update_account_balance(draft["account_id"], current_user["user_id"])

            # FIX: For transfers, also update the target account
            if draft["type"] == "transfer" and draft.get("to_account_id"):
                transaction["to_account_id"] = draft["to_account_id"]
                await db.transactions.update_one(
                    {"id": transaction["id"]},
                    {"$set": {"to_account_id": draft.get("to_account_id")}}
                )
                await update_account_balance(draft["to_account_id"], current_user["user_id"])

            await db.adesk_drafts.update_one(
                {"id": draft["id"]},
                {"$set": {"status": "imported"}}
            )

            imported += 1

        except Exception as e:
            logger.error(f"Error importing draft {draft['id']}: {e}")
            errors += 1

    return {
        "status": "success",
        "imported": imported,
        "duplicates": duplicates,
        "errors": errors
    }


@router.delete("/adesk/drafts/{draft_id}")
async def delete_adesk_draft(
    draft_id: str,
    current_user: dict = Depends(get_current_user)
):
    await db.adesk_drafts.delete_one(
        {"id": draft_id, "user_id": current_user["user_id"]}
    )
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
