"""
Telegram Webhook handler for WM Finance cash bot.

Flow:
1. /start → Welcome + type buttons (Расход / Приход)
2. Pick type → Direction buttons
3. Pick direction → Enter amount + description
4. "1000 Антон Ск" → Creates transaction on Cash PL
5. Photo/PDF → Gemini OCR → finds matching transactions → user taps to link
"""
from fastapi import APIRouter, Request, HTTPException, Depends
from datetime import datetime, timezone, timedelta
from pathlib import Path
import uuid
import os
import re
import logging
import httpx

from database import db
from auth import get_current_user
from models import Transaction, Document
from services.balance import update_account_balance
from routes.receipts import _extract_with_gemini, _safe_date, _safe_amount, MIME_BY_EXT

router = APIRouter(prefix="/api")
logger = logging.getLogger(__name__)

UPLOADS_DIR = Path(__file__).parent.parent / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)


async def get_bot_config():
    """Get bot token and owner user_id from the first configured integration."""
    settings = await db.integration_settings.find_one(
        {"telegram_bot_token": {"$ne": None, "$exists": True}},
        {"_id": 0},
    )
    if not settings or not settings.get("telegram_bot_token"):
        return None
    return settings


async def send_telegram(bot_token: str, chat_id, text: str, reply_markup=None, parse_mode="HTML"):
    """Send a message via Telegram Bot API."""
    payload = {"chat_id": chat_id, "text": text, "parse_mode": parse_mode}
    if reply_markup:
        payload["reply_markup"] = reply_markup
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"https://api.telegram.org/bot{bot_token}/sendMessage", json=payload,
            )
            if resp.status_code != 200:
                logger.error(f"Telegram send error: {resp.text}")
    except Exception as e:
        logger.error(f"Telegram send exception: {e}")


async def answer_callback(bot_token: str, callback_id: str, text: str = ""):
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            await client.post(
                f"https://api.telegram.org/bot{bot_token}/answerCallbackQuery",
                json={"callback_query_id": callback_id, "text": text},
            )
    except Exception:
        pass


async def telegram_download_file(bot_token: str, file_id: str, suggested_ext: str) -> tuple[Path, str] | tuple[None, None]:
    """Download a Telegram file by file_id. Returns (local_path, mime) or (None, None)."""
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.get(
                f"https://api.telegram.org/bot{bot_token}/getFile",
                params={"file_id": file_id},
            )
            if r.status_code != 200:
                return None, None
            file_path_remote = r.json().get("result", {}).get("file_path")
            if not file_path_remote:
                return None, None
            r2 = await client.get(
                f"https://api.telegram.org/file/bot{bot_token}/{file_path_remote}",
            )
            if r2.status_code != 200:
                return None, None
            content = r2.content
        ext = suggested_ext.lower() if suggested_ext else os.path.splitext(file_path_remote)[1].lower()
        if not ext or ext not in {".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".pdf"}:
            ext = ".jpg"
        local_name = f"{uuid.uuid4()}{ext}"
        local_path = UPLOADS_DIR / local_name
        with open(local_path, "wb") as f:
            f.write(content)
        mime = MIME_BY_EXT.get(ext, "application/octet-stream")
        return local_path, mime
    except Exception as e:
        logger.error(f"Telegram download error: {e}")
        return None, None


async def process_receipt_for_bot(bot_token: str, chat_id, owner_user_id: str, local_path: Path, mime: str, original_filename: str):
    """OCR + match. Returns dict with extracted+candidates+document_id."""
    extracted = await _extract_with_gemini(local_path, mime)
    ext_date = _safe_date(extracted.get("date"))
    ext_amount = _safe_amount(extracted.get("amount"))
    ext_currency = extracted.get("currency")
    if isinstance(ext_currency, str):
        ext_currency = ext_currency.upper().strip() or None
    if ext_currency and ext_currency not in {"PLN", "EUR", "USD"}:
        ext_currency = None
    ext_merchant = (extracted.get("merchant") or "")[:60] or None

    candidates = []
    if ext_date and ext_amount and ext_amount > 0:
        target = datetime.strptime(ext_date, "%Y-%m-%d")
        date_from = (target - timedelta(days=3)).strftime("%Y-%m-%d")
        date_to = (target + timedelta(days=3)).strftime("%Y-%m-%d")
        amt_min = ext_amount * 0.9
        amt_max = ext_amount * 1.1
        q = {
            "user_id": owner_user_id,
            "date": {"$gte": date_from, "$lte": date_to},
            "amount": {"$gte": amt_min, "$lte": amt_max},
            "type": {"$in": ["expense", "income"]},
        }
        if ext_currency:
            q["currency"] = ext_currency
        cursor = db.transactions.find(q, {"_id": 0}).sort("date", 1).limit(20)
        async for tx in cursor:
            try:
                tx_date = datetime.strptime(tx.get("date", "")[:10], "%Y-%m-%d")
                day_dist = abs((tx_date - target).days)
            except Exception:
                day_dist = 99
            amt_delta = abs((tx.get("amount") or 0) - ext_amount) / max(ext_amount, 0.01)
            score = day_dist + amt_delta * 10
            tx["_match_score"] = round(score, 3)
            tx["_day_distance"] = day_dist
            candidates.append(tx)
        candidates.sort(key=lambda x: x["_match_score"])
        candidates = candidates[:5]

    safe_filename = local_path.name
    description_val = ext_merchant or "Чек из Telegram (AI)"
    doc = Document(
        document_date=ext_date,
        type="receipt",
        file_name=original_filename or safe_filename,
        file_url=f"/api/documents/file/{safe_filename}",
        file_size=local_path.stat().st_size,
        mime_type=mime,
        transaction_id=None,
        direction_id=None,
        period=ext_date[:7] if ext_date else None,
        status="pending",
        source="ai-receipt",
        description=description_val,
        user_id=owner_user_id,
    ).model_dump()
    doc["ai_extracted"] = {
        "date": ext_date, "amount": ext_amount,
        "currency": ext_currency, "merchant": ext_merchant,
    }
    await db.documents.insert_one(doc)
    return {
        "document_id": doc["id"],
        "extracted": doc["ai_extracted"],
        "candidates": candidates,
    }


def type_keyboard():
    """Income/Expense selection buttons."""
    return {"inline_keyboard": [
        [
            {"text": "Расход", "callback_data": "type:expense"},
            {"text": "Приход", "callback_data": "type:income"},
        ]
    ]}


async def directions_keyboard(user_id: str):
    """Direction selection buttons."""
    directions = await db.directions.find(
        {"user_id": user_id, "is_active": True}, {"_id": 0},
    ).to_list(20)
    buttons = []
    row = []
    for d in directions:
        row.append({"text": d["name"], "callback_data": f"dir:{d['id']}:{d['name']}"})
        if len(row) == 2:
            buttons.append(row)
            row = []
    if row:
        buttons.append(row)
    return {"inline_keyboard": buttons}


async def get_or_create_bot_user(chat_id: int, telegram_user: dict, owner_user_id: str):
    bot_user = await db.telegram_bot_users.find_one({"chat_id": chat_id}, {"_id": 0})
    if not bot_user:
        bot_user = {
            "id": str(uuid.uuid4()),
            "chat_id": chat_id,
            "telegram_username": telegram_user.get("username", ""),
            "telegram_first_name": telegram_user.get("first_name", ""),
            "owner_user_id": owner_user_id,
            "current_type": "",
            "current_direction_id": "",
            "current_direction_name": "",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.telegram_bot_users.insert_one(bot_user)
        bot_user.pop("_id", None)
    return bot_user


async def update_bot_user(chat_id: int, fields: dict):
    await db.telegram_bot_users.update_one({"chat_id": chat_id}, {"$set": fields})


def parse_amount_text(text: str):
    """Parse '1000 Антон Ск' or '1000/ description'."""
    text = text.strip()
    match = re.match(r'^(\d+(?:[.,]\d+)?)\s*/?\s*(.*)', text)
    if not match:
        return None
    amount_str = match.group(1).replace(",", ".")
    description = match.group(2).strip()
    try:
        amount = float(amount_str)
    except ValueError:
        return None
    if amount <= 0:
        return None
    return {"amount": amount, "description": description}


@router.post("/telegram/webhook")
async def telegram_webhook(request: Request):
    try:
        update = await request.json()
    except Exception:
        return {"ok": True}

    config = await get_bot_config()
    if not config:
        return {"ok": True}

    bot_token = config["telegram_bot_token"]
    owner_user_id = config["user_id"]

    # === CALLBACK QUERIES ===
    if "callback_query" in update:
        cb = update["callback_query"]
        chat_id = cb["message"]["chat"]["id"]
        data = cb.get("data", "")
        tg_user = cb.get("from", {})

        bot_user = await get_or_create_bot_user(chat_id, tg_user, owner_user_id)

        # Step 1 result: Type selected
        if data.startswith("type:"):
            tx_type = data.split(":")[1]
            type_label = "Расход" if tx_type == "expense" else "Приход"
            await update_bot_user(chat_id, {"current_type": tx_type, "current_direction_id": "", "current_direction_name": ""})
            keyboard = await directions_keyboard(owner_user_id)
            await send_telegram(
                bot_token, chat_id,
                f"<b>{type_label}</b>\n\nВыберите направление:",
                reply_markup=keyboard,
            )
            await answer_callback(bot_token, cb["id"], type_label)
            return {"ok": True}

        # Step 2 result: Direction selected
        if data.startswith("dir:"):
            parts = data.split(":", 2)
            if len(parts) == 3:
                direction_id, direction_name = parts[1], parts[2]
                await update_bot_user(chat_id, {
                    "current_direction_id": direction_id,
                    "current_direction_name": direction_name,
                })

                # Reload user to get current_type
                bot_user = await db.telegram_bot_users.find_one({"chat_id": chat_id}, {"_id": 0})
                type_label = "Расход" if bot_user.get("current_type") == "expense" else "Приход"

                await send_telegram(
                    bot_token, chat_id,
                    f"<b>{type_label} / {direction_name}</b>\n\n"
                    f"Введите сумму и описание:\n"
                    f"<code>1000 Антон зп</code>\n"
                    f"<code>5000 продажа теплицы</code>",
                )
                await answer_callback(bot_token, cb["id"], direction_name)
            return {"ok": True}

        return {"ok": True}

    # === TEXT MESSAGES ===
    message = update.get("message")
    if not message:
        return {"ok": True}

    chat_id = message["chat"]["id"]
    text = (message.get("text") or "").strip()
    tg_user = message.get("from", {})

    # === PHOTO / DOCUMENT (RECEIPT) — SIMPLE UPLOAD MODE ===
    # The manager just dumps receipts here. We OCR them, save with status=pending
    # and the OWNER will match them later in the web UI via "Проанализировать чеки".
    photo_list = message.get("photo")
    doc_msg = message.get("document")
    if photo_list or doc_msg:
        bot_user = await get_or_create_bot_user(chat_id, tg_user, owner_user_id)
        if photo_list:
            largest = sorted(photo_list, key=lambda p: p.get("file_size", 0))[-1]
            file_id = largest["file_id"]
            ext = ".jpg"
            original_name = "telegram_photo.jpg"
        else:
            file_id = doc_msg["file_id"]
            mime_in = (doc_msg.get("mime_type") or "").lower()
            original_name = doc_msg.get("file_name") or "telegram_document"
            if "pdf" in mime_in:
                ext = ".pdf"
            elif "png" in mime_in:
                ext = ".png"
            elif "webp" in mime_in:
                ext = ".webp"
            elif "heic" in mime_in or "heif" in mime_in:
                ext = ".heic"
            elif "jpeg" in mime_in or "jpg" in mime_in:
                ext = ".jpg"
            else:
                await send_telegram(
                    bot_token, chat_id,
                    "❌ Поддерживаются только JPG/PNG/WEBP/HEIC/PDF",
                )
                return {"ok": True}

        local_path, mime = await telegram_download_file(bot_token, file_id, ext)
        if not local_path:
            await send_telegram(bot_token, chat_id, "❌ Не удалось скачать файл из Telegram")
            return {"ok": True}

        try:
            result = await process_receipt_for_bot(
                bot_token, chat_id, owner_user_id, local_path, mime, original_name
            )
        except Exception as e:
            logger.exception("Receipt processing failed")
            await send_telegram(bot_token, chat_id, f"❌ Ошибка распознавания: {str(e)[:200]}")
            return {"ok": True}

        ext_d = result["extracted"]
        amount_str = f"{ext_d['amount']:,.2f} {ext_d.get('currency') or '?'}" if ext_d.get("amount") else "—"
        date_str = ext_d.get("date") or "—"
        merch_str = ext_d.get("merchant") or ""

        # Count receipts pending for this period (so manager sees progress)
        period = (ext_d.get("date") or "")[:7]
        pending_count = await db.documents.count_documents({
            "user_id": owner_user_id,
            "type": "receipt",
            "status": "pending",
            "transaction_id": None,
        })

        lines = [
            "✅ <b>Чек сохранён</b>",
            f"📅 Дата: <b>{date_str}</b>",
            f"💰 Сумма: <b>{amount_str}</b>",
        ]
        if merch_str:
            lines.append(f"🏪 {merch_str}")
        if period:
            lines.append(f"\n📂 Период: <b>{period}</b>")
        lines.append(f"\n📥 Всего непривязанных чеков: <b>{pending_count}</b>")
        lines.append("\nЧек будет привязан к операции после анализа в веб-сервисе.")
        await send_telegram(bot_token, chat_id, "\n".join(lines))
        return {"ok": True}

    if not text:
        return {"ok": True}

    bot_user = await get_or_create_bot_user(chat_id, tg_user, owner_user_id)

    # === COMMANDS ===
    if text == "/start":
        await update_bot_user(chat_id, {"current_type": "", "current_direction_id": "", "current_direction_name": ""})
        await send_telegram(
            bot_token, chat_id,
            f"<b>WM Finance — Касса</b>\n\n"
            f"Привет, {tg_user.get('first_name', '')}!\n"
            f"Выберите тип операции:",
            reply_markup=type_keyboard(),
        )
        return {"ok": True}

    if text in ("/new", "/add"):
        await update_bot_user(chat_id, {"current_type": "", "current_direction_id": "", "current_direction_name": ""})
        await send_telegram(
            bot_token, chat_id,
            "Выберите тип операции:",
            reply_markup=type_keyboard(),
        )
        return {"ok": True}

    if text in ("/direction", "/dir"):
        keyboard = await directions_keyboard(owner_user_id)
        await send_telegram(bot_token, chat_id, "Выберите направление:", reply_markup=keyboard)
        return {"ok": True}

    if text == "/balance":
        accounts = await db.accounts.find(
            {"user_id": owner_user_id, "is_active": True}, {"_id": 0},
        ).to_list(50)
        lines = ["<b>Балансы счетов:</b>\n"]
        total = 0
        for a in accounts:
            bal = a.get("current_balance", 0)
            lines.append(f"• {a['name']}: {bal:,.2f} {a.get('currency', 'PLN')}")
            total += bal
        lines.append(f"\n<b>Итого: {total:,.2f} zł</b>")
        await send_telegram(bot_token, chat_id, "\n".join(lines))
        return {"ok": True}

    if text == "/last":
        txs = await db.transactions.find(
            {"user_id": owner_user_id, "source": "telegram_cash"},
            {"_id": 0},
        ).sort("created_at", -1).to_list(5)
        if not txs:
            await send_telegram(bot_token, chat_id, "Нет операций из бота")
        else:
            lines = ["<b>Последние 5 операций (касса):</b>\n"]
            for t in txs:
                sign = "+" if t["type"] == "income" else "-"
                lines.append(
                    f"• {t['date']} | {sign}{t['amount']:,.0f} zł | {t.get('description', '')} "
                    f"[{t.get('direction_name', '')}]"
                )
            await send_telegram(bot_token, chat_id, "\n".join(lines))
        return {"ok": True}

    if text == "/help":
        await send_telegram(
            bot_token, chat_id,
            "<b>Команды:</b>\n"
            "/start — новая операция\n"
            "/new — новая операция\n"
            "/direction — сменить направление\n"
            "/balance — балансы всех счетов\n"
            "/last — последние 5 операций\n"
            "/help — помощь\n\n"
            "<b>Как записать операцию:</b>\n"
            "1. Нажмите Расход или Приход\n"
            "2. Выберите направление\n"
            "3. Введите <code>сумма описание</code>",
        )
        return {"ok": True}

    # === TRANSACTION RECORDING ===
    # Check that type and direction are selected
    if not bot_user.get("current_type"):
        await send_telegram(
            bot_token, chat_id,
            "Сначала выберите тип операции:",
            reply_markup=type_keyboard(),
        )
        return {"ok": True}

    if not bot_user.get("current_direction_id"):
        keyboard = await directions_keyboard(owner_user_id)
        await send_telegram(
            bot_token, chat_id,
            "Выберите направление:",
            reply_markup=keyboard,
        )
        return {"ok": True}

    parsed = parse_amount_text(text)
    if not parsed:
        await send_telegram(
            bot_token, chat_id,
            "Не удалось распознать. Формат: <code>1000 описание</code>",
        )
        return {"ok": True}

    # Find Cash account
    account = await db.accounts.find_one(
        {"user_id": owner_user_id, "name": {"$regex": "cash", "$options": "i"}},
        {"_id": 0},
    )
    if not account:
        await send_telegram(bot_token, chat_id, "Счёт Cash не найден.")
        return {"ok": True}

    tx_type = bot_user["current_type"]

    # Auto-category from rules
    category_id, category_name = "", ""
    if parsed["description"]:
        desc_upper = parsed["description"].strip().upper()
        rule = await db.contractor_category_rules.find_one(
            {"user_id": owner_user_id, "contractor_name_upper": desc_upper}, {"_id": 0},
        )
        if rule:
            cat = await db.categories.find_one(
                {"id": rule["category_id"], "user_id": owner_user_id}, {"_id": 0},
            )
            if cat:
                category_id, category_name = cat["id"], cat["name"]

    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    transaction = Transaction(
        date=date_str,
        type=tx_type,
        amount=parsed["amount"],
        currency=account.get("currency", "PLN"),
        direction_id=bot_user["current_direction_id"],
        direction_name=bot_user["current_direction_name"],
        category_id=category_id,
        category_name=category_name,
        account_id=account["id"],
        account_name=account["name"],
        description=parsed["description"] or "Операция из Telegram",
        comment=f"Telegram: @{tg_user.get('username', '')} ({tg_user.get('first_name', '')})",
        source="telegram_cash",
        status="fact",
        needs_review=not bool(category_id),
        user_id=owner_user_id,
    )

    await db.transactions.insert_one(transaction.model_dump())
    await update_account_balance(account["id"], owner_user_id)

    updated = await db.accounts.find_one({"id": account["id"], "user_id": owner_user_id}, {"_id": 0})
    new_balance = updated.get("current_balance", 0) if updated else 0

    sign = "+" if tx_type == "income" else "-"
    type_label = "Приход" if tx_type == "income" else "Расход"
    cat_info = f"\nКатегория: {category_name}" if category_name else ""

    await send_telegram(
        bot_token, chat_id,
        f"<b>{type_label}</b> {sign}{parsed['amount']:,.0f} {account.get('currency', 'PLN')}\n"
        f"Описание: {parsed['description']}\n"
        f"Направление: {bot_user['current_direction_name']}\n"
        f"Счёт: {account['name']}"
        f"{cat_info}\n\n"
        f"Баланс: <b>{new_balance:,.2f} {account.get('currency', 'PLN')}</b>",
        reply_markup=type_keyboard(),
    )

    # Reset state for next operation
    await update_bot_user(chat_id, {"current_type": "", "current_direction_id": "", "current_direction_name": ""})

    return {"ok": True}


@router.post("/telegram/setup-webhook")
async def setup_webhook(data: dict, current_user: dict = Depends(get_current_user)):
    settings = await db.integration_settings.find_one(
        {"user_id": current_user["user_id"]}, {"_id": 0},
    )
    if not settings or not settings.get("telegram_bot_token"):
        raise HTTPException(status_code=400, detail="Telegram Bot Token не настроен")

    bot_token = settings["telegram_bot_token"]
    webhook_url = data.get("webhook_url", "").strip()
    if not webhook_url:
        raise HTTPException(status_code=400, detail="Укажите URL вебхука")

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"https://api.telegram.org/bot{bot_token}/setWebhook",
                json={"url": webhook_url},
            )
            result = resp.json()
            if result.get("ok"):
                return {"status": "success", "message": "Вебхук установлен", "url": webhook_url}
            return {"status": "error", "message": result.get("description", "Ошибка")}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/telegram/remove-webhook")
async def remove_webhook(current_user: dict = Depends(get_current_user)):
    settings = await db.integration_settings.find_one(
        {"user_id": current_user["user_id"]}, {"_id": 0},
    )
    if not settings or not settings.get("telegram_bot_token"):
        raise HTTPException(status_code=400, detail="Telegram Bot Token не настроен")

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"https://api.telegram.org/bot{settings['telegram_bot_token']}/deleteWebhook",
            )
            result = resp.json()
            return {"status": "success" if result.get("ok") else "error", "message": result.get("description", "")}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/telegram/webhook-info")
async def get_webhook_info(current_user: dict = Depends(get_current_user)):
    settings = await db.integration_settings.find_one(
        {"user_id": current_user["user_id"]}, {"_id": 0},
    )
    if not settings or not settings.get("telegram_bot_token"):
        return {"configured": False}

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"https://api.telegram.org/bot{settings['telegram_bot_token']}/getWebhookInfo",
            )
            info = resp.json().get("result", {})
            return {
                "configured": True,
                "webhook_url": info.get("url", ""),
                "pending_update_count": info.get("pending_update_count", 0),
                "last_error_message": info.get("last_error_message"),
            }
    except Exception as e:
        return {"configured": True, "error": str(e)}


@router.get("/telegram/bot-users")
async def get_bot_users(current_user: dict = Depends(get_current_user)):
    users = await db.telegram_bot_users.find(
        {"owner_user_id": current_user["user_id"]}, {"_id": 0},
    ).to_list(100)
    return {"users": users}


@router.delete("/telegram/bot-users/{chat_id}")
async def delete_bot_user(chat_id: int, current_user: dict = Depends(get_current_user)):
    """Отвязать пользователя от бота. Он сможет снова подключиться через /start,
    если ему оставить доступ к боту в Telegram."""
    res = await db.telegram_bot_users.delete_one({
        "chat_id": chat_id,
        "owner_user_id": current_user["user_id"],
    })
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Пользователь бота не найден")
    return {"status": "ok"}
