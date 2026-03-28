from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
import logging
import json

from database import db
from auth import get_current_user

router = APIRouter(prefix="/api")
logger = logging.getLogger(__name__)


def get_gspread_client(service_account_info: dict):
    """Create gspread client from service account JSON stored in DB."""
    try:
        import gspread
        from google.oauth2.service_account import Credentials

        scopes = [
            "https://spreadsheets.google.com/feeds",
            "https://www.googleapis.com/auth/spreadsheets",
            "https://www.googleapis.com/auth/drive",
        ]
        creds = Credentials.from_service_account_info(service_account_info, scopes=scopes)
        return gspread.authorize(creds)
    except Exception as e:
        logger.error(f"Failed to create gspread client: {e}")
        return None


async def get_google_config(user_id: str) -> dict:
    """Get Google Sheets config from integration_settings."""
    settings = await db.integration_settings.find_one(
        {"user_id": user_id}, {"_id": 0}
    )
    if not settings:
        return {}
    return {
        "google_sheets_url": settings.get("google_sheets_url"),
        "google_service_account": settings.get("google_service_account"),
    }


async def backup_to_google_sheets(user_id: str, spreadsheet_url: str, service_account_info: dict):
    gc = get_gspread_client(service_account_info)
    if not gc:
        return {"status": "error", "message": "Не удалось подключиться к Google Sheets"}

    try:
        sh = gc.open_by_url(spreadsheet_url)

        # Backup transactions
        transactions = await db.transactions.find(
            {"user_id": user_id, "status": "fact"}, {"_id": 0}
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
                t.get("date", ""), t.get("type", ""), str(t.get("amount", 0)),
                t.get("currency", "PLN"), t.get("category_name", ""),
                t.get("direction_name", ""), t.get("account_name", ""),
                t.get("contractor_name", ""), t.get("description", ""),
                t.get("source", ""), t.get("status", "")
            ])
        ws.update(range_name="A1", values=rows)

        # Backup accounts
        accounts = await db.accounts.find(
            {"user_id": user_id, "is_active": True}, {"_id": 0}
        ).to_list(50)

        try:
            ws_accounts = sh.worksheet("Счета")
            ws_accounts.clear()
        except Exception:
            ws_accounts = sh.add_worksheet(title="Счета", rows=str(len(accounts) + 1), cols="6")

        acc_headers = ["Название", "Тип", "Валюта", "Банк", "Начальный баланс", "Текущий баланс"]
        acc_rows = [acc_headers]
        for a in accounts:
            acc_rows.append([
                a.get("name", ""), a.get("type", ""), a.get("currency", "PLN"),
                a.get("bank", ""), str(a.get("initial_balance", 0)),
                str(a.get("current_balance", 0))
            ])
        ws_accounts.update(range_name="A1", values=acc_rows)

        # Backup cash transactions to separate sheet
        cash_txs = [t for t in transactions if t.get("source") in ("telegram_cash", "cash_import")
                     or (t.get("account_name") or "").lower().startswith("cash")]

        try:
            ws_cash = sh.worksheet("Наличные")
            ws_cash.clear()
        except Exception:
            ws_cash = sh.add_worksheet(title="Наличные", rows=str(max(len(cash_txs) + 1, 2)), cols="12")

        cash_headers = [
            "Дата", "Тип", "Сумма", "Валюта", "Категория", "Направление",
            "Счёт", "Контрагент", "Описание", "Комментарий", "Источник"
        ]
        cash_rows = [cash_headers]
        for t in cash_txs:
            cash_rows.append([
                t.get("date", ""), t.get("type", ""), str(t.get("amount", 0)),
                t.get("currency", "PLN"), t.get("category_name", ""),
                t.get("direction_name", ""), t.get("account_name", ""),
                t.get("contractor_name", ""), t.get("description", ""),
                t.get("comment", ""), t.get("source", "")
            ])
        ws_cash.update(range_name="A1", values=cash_rows)

        return {
            "status": "success",
            "message": f"Бэкап выполнен: {len(transactions)} операций, {len(accounts)} счетов, {len(cash_txs)} наличных",
            "transactions_count": len(transactions),
            "accounts_count": len(accounts),
            "cash_count": len(cash_txs),
        }
    except Exception as e:
        logger.error(f"Google Sheets backup error: {e}")
        return {"status": "error", "message": str(e)}


@router.post("/backup/google-sheets")
async def trigger_backup(current_user: dict = Depends(get_current_user)):
    config = await get_google_config(current_user["user_id"])
    url = config.get("google_sheets_url")
    sa = config.get("google_service_account")

    if not url:
        raise HTTPException(status_code=400, detail="Google Sheets URL не указан")
    if not sa:
        raise HTTPException(status_code=400, detail="Service Account JSON не загружен")

    result = await backup_to_google_sheets(current_user["user_id"], url, sa)
    return result


@router.get("/backup/status")
async def get_backup_status(current_user: dict = Depends(get_current_user)):
    config = await get_google_config(current_user["user_id"])
    url = config.get("google_sheets_url")
    sa = config.get("google_service_account")

    has_url = bool(url)
    has_sa = bool(sa)
    configured = has_url and has_sa

    return {
        "configured": configured,
        "has_url": has_url,
        "has_service_account": has_sa,
        "spreadsheet_url": url if has_url else None,
        "service_account_email": sa.get("client_email") if sa else None,
        "message": "Google Sheets настроен" if configured else "Укажите URL таблицы и загрузите Service Account JSON",
    }


@router.put("/settings/integrations/google-sheets")
async def update_google_sheets_settings(
    data: dict,
    current_user: dict = Depends(get_current_user),
):
    """Save Google Sheets URL and/or Service Account JSON."""
    update_fields = {"updated_at": datetime.now(timezone.utc).isoformat()}

    if "google_sheets_url" in data:
        url = (data["google_sheets_url"] or "").strip()
        if url and "docs.google.com/spreadsheets" not in url:
            raise HTTPException(status_code=400, detail="Некорректный URL Google таблицы")
        update_fields["google_sheets_url"] = url or None

    if "google_service_account" in data:
        sa = data["google_service_account"]
        if sa:
            if isinstance(sa, str):
                try:
                    sa = json.loads(sa)
                except json.JSONDecodeError:
                    raise HTTPException(status_code=400, detail="Некорректный JSON Service Account")
            if not isinstance(sa, dict) or "client_email" not in sa or "private_key" not in sa:
                raise HTTPException(status_code=400, detail="Service Account JSON должен содержать client_email и private_key")
            update_fields["google_service_account"] = sa
        else:
            update_fields["google_service_account"] = None

    await db.integration_settings.update_one(
        {"user_id": current_user["user_id"]},
        {"$set": update_fields},
        upsert=True,
    )
    return {"status": "saved"}


@router.post("/backup/google-sheets/test")
async def test_google_sheets(current_user: dict = Depends(get_current_user)):
    """Test Google Sheets connection."""
    config = await get_google_config(current_user["user_id"])
    url = config.get("google_sheets_url")
    sa = config.get("google_service_account")

    if not url:
        return {"status": "error", "message": "URL таблицы не указан"}
    if not sa:
        return {"status": "error", "message": "Service Account не загружен"}

    gc = get_gspread_client(sa)
    if not gc:
        return {"status": "error", "message": "Не удалось создать клиент Google Sheets"}

    try:
        sh = gc.open_by_url(url)
        return {
            "status": "success",
            "message": f"Подключение успешно! Таблица: {sh.title}",
            "spreadsheet_title": sh.title,
        }
    except Exception as e:
        return {"status": "error", "message": f"Ошибка: {str(e)}"}
