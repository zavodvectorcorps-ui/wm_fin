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
from models import AdeskConnectionTest, AdeskMigrationStart

router = APIRouter(prefix="/api")
logger = logging.getLogger(__name__)


def normalize_currency(raw) -> str:
    if isinstance(raw, (int, float)):
        return {1: "RUB", 2: "USD", 3: "EUR", 4: "PLN"}.get(int(raw), "PLN")
    if not isinstance(raw, str) or not raw.strip():
        return "PLN"
    norm = raw.strip().upper()
    if norm in ["PLN", "ZŁ", "ZL", "ZLOTY"]:
        return "PLN"
    if norm in ["EUR", "EURO", "€"]:
        return "EUR"
    if norm in ["USD", "DOLLAR", "$"]:
        return "USD"
    return norm if norm in ["PLN", "EUR", "USD"] else "PLN"


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
                    "length": 1,
                    "start": 0
                }
            )
            if response.status_code == 200:
                result = response.json()
                total = 0
                if isinstance(result, dict):
                    total = result.get("recordsFiltered", result.get("recordsTotal", 0))
                elif isinstance(result, list):
                    total = len(result)
                return {"status": "success", "message": f"Подключение успешно. Всего операций: {total}", "transactions_count": total}
            elif response.status_code in (401, 403):
                return {"status": "error", "message": "Неверный API токен"}
            else:
                return {"status": "error", "message": f"Ошибка API: {response.status_code}"}
    except httpx.TimeoutException:
        return {"status": "error", "message": "Таймаут подключения"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.post("/adesk/start-migration")
async def start_adesk_migration(
    data: AdeskMigrationStart,
    current_user: dict = Depends(get_current_user)
):
    """Import all Adesk transactions into archive (drafts collection only)"""
    batch_id = str(uuid.uuid4())
    user_id = current_user["user_id"]

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            imported = 0
            errors = 0
            seen_ids = set()
            start_offset = 0
            page_size = 1000

            # Date filter applied after fetching (range=all_time works reliably)
            filter_date_from = data.date_from
            filter_date_to = data.date_to

            while True:
                response = await client.get(
                    "https://api.adesk.ru/v1/transactions",
                    params={
                        "api_token": data.api_token,
                        "range": "all_time",
                        "length": page_size,
                        "start": start_offset
                    }
                )

                logger.info(f"Adesk fetch start={start_offset}: status={response.status_code}")

                if response.status_code != 200:
                    logger.error(f"Adesk error: {response.text[:500]}")
                    break

                result = response.json()

                # Parse response — Adesk uses {success, transactions, recordsFiltered}
                if isinstance(result, list):
                    transactions = result
                elif isinstance(result, dict):
                    transactions = result.get("transactions", result.get("data", result.get("items", [])))
                else:
                    transactions = []

                logger.info(f"Adesk offset={start_offset}: got {len(transactions)} transactions")

                if not transactions:
                    break

                # Log first transaction structure
                if start_offset == 0:
                    sample = transactions[0]
                    logger.info(f"Sample keys: {list(sample.keys())}")
                    logger.info(f"Sample bankAccount: {sample.get('bankAccount')}")
                    logger.info(f"Sample project: {sample.get('project')}")
                    logger.info(f"Sample: type={sample.get('type')}, isTransfer={sample.get('isTransfer')}, dateIso={sample.get('dateIso')}")

                # Infinite loop prevention
                new_count = 0
                for tx in transactions:
                    tid = str(tx.get("id", ""))
                    if tid not in seen_ids:
                        new_count += 1
                    seen_ids.add(tid)

                if new_count == 0:
                    logger.info("All transactions on this page already seen, stopping")
                    break

                if start_offset > 50000:
                    logger.warning("Offset limit reached, stopping")
                    break

                # Process each transaction into archive
                for tx in transactions:
                    try:
                        adesk_id = str(tx.get("id", ""))

                        # Skip duplicates
                        existing = await db.adesk_drafts.find_one({"adesk_id": adesk_id, "user_id": user_id})
                        if existing:
                            continue

                        # Type
                        is_transfer = tx.get("isTransfer") == True
                        if is_transfer:
                            t_type = "transfer"
                        elif tx.get("type") == 1:
                            t_type = "income"
                        else:
                            t_type = "expense"

                        # Amount
                        raw_amount = tx.get("amount", 0)
                        if isinstance(raw_amount, str):
                            raw_amount = raw_amount.replace(",", ".").replace(" ", "")
                        amount = abs(float(raw_amount))

                        # Date
                        date_iso = tx.get("dateIso", "") or tx.get("date", "")
                        if date_iso and "T" in date_iso:
                            parsed_date = date_iso[:10]
                        elif date_iso and "." in date_iso:
                            parts = date_iso.split(".")
                            if len(parts) == 3:
                                if len(parts[0]) == 4:
                                    parsed_date = f"{parts[0]}-{parts[1]}-{parts[2]}"
                                else:
                                    parsed_date = f"{parts[2]}-{parts[1]}-{parts[0]}"
                            else:
                                parsed_date = date_iso[:10]
                        else:
                            parsed_date = date_iso[:10] if date_iso else data.date_from

                        # Filter by date range
                        if parsed_date < filter_date_from or parsed_date > filter_date_to:
                            continue


                        # Bank account + currency
                        bank = tx.get("bankAccount") or {}
                        account_name = bank.get("name", "") if isinstance(bank, dict) else ""
                        raw_currency = bank.get("currency", "") if isinstance(bank, dict) else ""
                        currency = normalize_currency(raw_currency)
                        if currency == "PLN" and account_name:
                            acn = account_name.lower()
                            if "eur" in acn or "евро" in acn:
                                currency = "EUR"
                            elif "usd" in acn or "доллар" in acn:
                                currency = "USD"

                        exchange_rate = tx.get("exchangeRate", 1.0)
                        account_balance = bank.get("amount", "") if isinstance(bank, dict) else ""

                        # Project
                        project_raw = tx.get("project")
                        project_name = ""
                        if isinstance(project_raw, dict) and project_raw:
                            project_name = project_raw.get("name", "")

                        # Category
                        cat_raw = tx.get("category") or {}
                        category_name = cat_raw.get("name", "") if isinstance(cat_raw, dict) else ""

                        # Contractor
                        contr_raw = tx.get("contractor") or {}
                        contractor_name = contr_raw.get("name", "") if isinstance(contr_raw, dict) else ""

                        description = tx.get("description", "") or tx.get("comment", "") or ""

                        # Store as archive entry
                        draft = {
                            "id": str(uuid.uuid4()),
                            "created_at": datetime.now(timezone.utc).isoformat(),
                            "adesk_id": adesk_id,
                            "date": parsed_date,
                            "type": t_type,
                            "amount": amount,
                            "currency": currency,
                            "exchange_rate": exchange_rate,
                            "is_transfer": is_transfer,
                            "account_name": account_name,
                            "account_balance": str(account_balance),
                            "project_name": project_name,
                            "category_name": category_name,
                            "contractor_name": contractor_name,
                            "description": description,
                            "user_id": user_id,
                            "batch_id": batch_id
                        }

                        await db.adesk_drafts.insert_one(draft)
                        imported += 1

                    except Exception as e:
                        logger.error(f"Error processing tx {tx.get('id')}: {e}")
                        errors += 1

                start_offset += len(transactions)
                if len(transactions) < page_size:
                    break

            # Stats
            by_currency = {}
            by_type = {}
            by_account = {}
            drafts = await db.adesk_drafts.find({"batch_id": batch_id}, {"_id": 0, "currency": 1, "type": 1, "account_name": 1, "amount": 1}).to_list(50000)
            for d in drafts:
                cur = d.get("currency", "PLN")
                by_currency[cur] = by_currency.get(cur, 0) + 1
                tp = d.get("type", "?")
                by_type[tp] = by_type.get(tp, 0) + 1
                acc = d.get("account_name", "?")
                if acc not in by_account:
                    by_account[acc] = {"count": 0, "income": 0, "expense": 0}
                by_account[acc]["count"] += 1
                if tp == "income":
                    by_account[acc]["income"] += d.get("amount", 0)
                elif tp == "expense":
                    by_account[acc]["expense"] += d.get("amount", 0)

            return {
                "status": "success",
                "batch_id": batch_id,
                "imported": imported,
                "errors": errors,
                "by_currency": by_currency,
                "by_type": by_type,
                "by_account": by_account,
                "message": f"Загружено {imported} операций в архив"
            }

    except Exception as e:
        logger.error(f"Migration error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Ошибка: {str(e)}")


@router.get("/adesk/drafts")
async def get_adesk_drafts(
    batch_id: Optional[str] = None,
    currency: Optional[str] = None,
    type: Optional[str] = None,
    account_name: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    search: Optional[str] = None,
    page: int = 1,
    limit: int = 50,
    current_user: dict = Depends(get_current_user)
):
    query = {"user_id": current_user["user_id"]}
    if batch_id:
        query["batch_id"] = batch_id
    if currency:
        query["currency"] = currency
    if type:
        query["type"] = type
    if account_name:
        query["account_name"] = account_name
    if date_from:
        query.setdefault("date", {})["$gte"] = date_from
    if date_to:
        query.setdefault("date", {})["$lte"] = date_to
    if search:
        query["$or"] = [
            {"description": {"$regex": search, "$options": "i"}},
            {"contractor_name": {"$regex": search, "$options": "i"}},
            {"category_name": {"$regex": search, "$options": "i"}},
        ]

    total = await db.adesk_drafts.count_documents(query)
    drafts = await db.adesk_drafts.find(query, {"_id": 0}).sort("date", -1).skip((page - 1) * limit).limit(limit).to_list(limit)

    # Summary stats
    all_drafts = await db.adesk_drafts.find(
        {"user_id": current_user["user_id"]},
        {"_id": 0, "currency": 1, "type": 1, "amount": 1, "account_name": 1}
    ).to_list(50000)

    total_income = {"PLN": 0, "EUR": 0, "USD": 0}
    total_expense = {"PLN": 0, "EUR": 0, "USD": 0}
    accounts = set()
    for d in all_drafts:
        cur = d.get("currency", "PLN")
        if cur not in total_income:
            total_income[cur] = 0
            total_expense[cur] = 0
        if d.get("type") == "income":
            total_income[cur] += d.get("amount", 0)
        elif d.get("type") == "expense":
            total_expense[cur] += d.get("amount", 0)
        if d.get("account_name"):
            accounts.add(d["account_name"])

    return {
        "drafts": drafts,
        "page": page,
        "limit": limit,
        "total": total,
        "summary": {
            "total_records": len(all_drafts),
            "income": total_income,
            "expense": total_expense,
            "accounts": sorted(accounts)
        }
    }


@router.get("/adesk/summary")
async def get_adesk_summary(current_user: dict = Depends(get_current_user)):
    """Get aggregated summary of all Adesk archive data"""
    all_drafts = await db.adesk_drafts.find(
        {"user_id": current_user["user_id"]},
        {"_id": 0}
    ).to_list(50000)

    if not all_drafts:
        return {"total": 0, "by_account": {}, "by_project": {}, "by_currency": {}, "by_month": {}}

    by_account = {}
    by_project = {}
    by_currency = {}
    by_month = {}

    for d in all_drafts:
        amount = d.get("amount", 0)
        cur = d.get("currency", "PLN")
        t_type = d.get("type", "expense")
        acc = d.get("account_name", "Неизвестный")
        proj = d.get("project_name", "") or "Без проекта"
        month = d.get("date", "")[:7] if d.get("date") else "?"

        # By account
        if acc not in by_account:
            by_account[acc] = {"currency": cur, "income": 0, "expense": 0, "transfer": 0, "count": 0}
        by_account[acc]["count"] += 1
        by_account[acc][t_type] = by_account[acc].get(t_type, 0) + amount

        # By project
        if proj not in by_project:
            by_project[proj] = {"income": 0, "expense": 0, "count": 0}
        by_project[proj]["count"] += 1
        if t_type in ("income", "expense"):
            by_project[proj][t_type] += amount

        # By currency
        if cur not in by_currency:
            by_currency[cur] = {"income": 0, "expense": 0, "transfer": 0, "count": 0}
        by_currency[cur]["count"] += 1
        by_currency[cur][t_type] = by_currency[cur].get(t_type, 0) + amount

        # By month
        if month not in by_month:
            by_month[month] = {"income": 0, "expense": 0, "transfer": 0}
        by_month[month][t_type] = by_month[month].get(t_type, 0) + amount

    return {
        "total": len(all_drafts),
        "by_account": by_account,
        "by_project": by_project,
        "by_currency": by_currency,
        "by_month": dict(sorted(by_month.items()))
    }


@router.delete("/adesk/drafts/all")
async def delete_all_adesk_drafts(current_user: dict = Depends(get_current_user)):
    result = await db.adesk_drafts.delete_many({"user_id": current_user["user_id"]})
    return {"status": "deleted", "count": result.deleted_count}


@router.delete("/adesk/drafts/{draft_id}")
async def delete_adesk_draft(draft_id: str, current_user: dict = Depends(get_current_user)):
    await db.adesk_drafts.delete_one({"id": draft_id, "user_id": current_user["user_id"]})
    return {"status": "deleted"}


@router.get("/adesk/export")
async def export_adesk_archive(
    currency: Optional[str] = None,
    type: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Export Adesk archive as CSV"""
    query = {"user_id": current_user["user_id"]}
    if currency:
        query["currency"] = currency
    if type:
        query["type"] = type

    drafts = await db.adesk_drafts.find(query, {"_id": 0}).sort("date", 1).to_list(50000)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Дата", "Тип", "Сумма", "Валюта", "Курс", "Счёт", "Проект",
        "Категория", "Контрагент", "Описание", "Перевод"
    ])

    for d in drafts:
        writer.writerow([
            d.get("date", ""),
            d.get("type", ""),
            d.get("amount", 0),
            d.get("currency", "PLN"),
            d.get("exchange_rate", 1.0),
            d.get("account_name", ""),
            d.get("project_name", ""),
            d.get("category_name", ""),
            d.get("contractor_name", ""),
            d.get("description", ""),
            "Да" if d.get("is_transfer") else "Нет"
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=adesk_archive.csv"}
    )
