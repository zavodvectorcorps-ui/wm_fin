from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
import logging
import os
from pathlib import Path

from database import db
from auth import get_current_user

router = APIRouter(prefix="/api")
logger = logging.getLogger(__name__)

SERVICE_ACCOUNT_PATH = Path(__file__).parent.parent / "smart-acrobat-482112-r8-082f29684368.json"


def get_gspread_client():
    try:
        import gspread
        from oauth2client.service_account import ServiceAccountCredentials

        if not SERVICE_ACCOUNT_PATH.exists():
            logger.warning("Google service account JSON not found")
            return None

        scope = [
            "https://spreadsheets.google.com/feeds",
            "https://www.googleapis.com/auth/drive"
        ]
        creds = ServiceAccountCredentials.from_json_keyfile_name(str(SERVICE_ACCOUNT_PATH), scope)
        return gspread.authorize(creds)
    except Exception as e:
        logger.error(f"Failed to create gspread client: {e}")
        return None


async def backup_to_google_sheets(user_id: str, spreadsheet_url: str):
    gc = get_gspread_client()
    if not gc:
        return {"status": "error", "message": "Google Sheets not configured"}

    try:
        sh = gc.open_by_url(spreadsheet_url)

        transactions = await db.transactions.find(
            {"user_id": user_id, "status": "fact"},
            {"_id": 0}
        ).sort("date", -1).to_list(50000)

        try:
            ws = sh.worksheet("Транзакции")
            ws.clear()
        except Exception:
            ws = sh.add_worksheet(title="Транзакции", rows=str(len(transactions) + 1), cols="15")

        headers = [
            "Дата", "Тип", "Сумма", "Валюта", "Категория", "Направление",
            "Счёт", "Контрагент", "Описание", "Источник", "Статус"
        ]

        rows = [headers]
        for t in transactions:
            rows.append([
                t.get("date", ""),
                t.get("type", ""),
                str(t.get("amount", 0)),
                t.get("currency", "PLN"),
                t.get("category_name", ""),
                t.get("direction_name", ""),
                t.get("account_name", ""),
                t.get("contractor_name", ""),
                t.get("description", ""),
                t.get("source", ""),
                t.get("status", "")
            ])

        ws.update(range_name="A1", values=rows)

        accounts = await db.accounts.find({"user_id": user_id, "is_active": True}, {"_id": 0}).to_list(50)

        try:
            ws_accounts = sh.worksheet("Счета")
            ws_accounts.clear()
        except Exception:
            ws_accounts = sh.add_worksheet(title="Счета", rows=str(len(accounts) + 1), cols="6")

        acc_headers = ["Название", "Тип", "Валюта", "Банк", "Начальный баланс", "Текущий баланс"]
        acc_rows = [acc_headers]
        for a in accounts:
            acc_rows.append([
                a.get("name", ""),
                a.get("type", ""),
                a.get("currency", "PLN"),
                a.get("bank", ""),
                str(a.get("initial_balance", 0)),
                str(a.get("current_balance", 0))
            ])

        ws_accounts.update(range_name="A1", values=acc_rows)

        return {
            "status": "success",
            "message": f"Backup completed: {len(transactions)} transactions, {len(accounts)} accounts",
            "transactions_count": len(transactions),
            "accounts_count": len(accounts)
        }

    except Exception as e:
        logger.error(f"Google Sheets backup error: {e}")
        return {"status": "error", "message": str(e)}


@router.post("/backup/google-sheets")
async def trigger_backup(current_user: dict = Depends(get_current_user)):
    settings = await db.integration_settings.find_one(
        {"user_id": current_user["user_id"]},
        {"_id": 0}
    )

    spreadsheet_url = settings.get("google_sheets_url") if settings else None

    if not spreadsheet_url:
        raise HTTPException(status_code=400, detail="Google Sheets URL не настроен")

    result = await backup_to_google_sheets(current_user["user_id"], spreadsheet_url)
    return result


@router.get("/backup/status")
async def get_backup_status(current_user: dict = Depends(get_current_user)):
    gc = get_gspread_client()
    if not gc:
        return {
            "configured": False,
            "message": "Google Sheets не настроен"
        }

    settings = await db.integration_settings.find_one(
        {"user_id": current_user["user_id"]},
        {"_id": 0}
    )

    spreadsheet_url = settings.get("google_sheets_url") if settings else None

    return {
        "configured": bool(spreadsheet_url),
        "spreadsheet_url": spreadsheet_url,
        "service_account_exists": SERVICE_ACCOUNT_PATH.exists(),
        "message": "Google Sheets настроен" if spreadsheet_url else "Укажите URL таблицы в настройках интеграций"
    }
