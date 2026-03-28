"""
Telegram Webhook handler for WM Finance cash bot.

Flow:
1. User sends /start → Welcome message + direction buttons
2. User picks direction → Stored in DB, ask for amount + description
3. User sends "1000 Антон Ск" → Creates expense on Cash PL
4. User sends "+5000 продажа" → Creates income on Cash PL
5. /balance → Current Cash PL balance
6. /last → Last 5 cash transactions
7. /direction → Change direction
"""
from fastapi import APIRouter, Request, HTTPException, Depends
from datetime import datetime, timezone
import uuid
import re
import logging
import httpx

from database import db
from auth import get_current_user
from models import Transaction
from services.balance import update_account_balance

router = APIRouter(prefix="/api")
logger = logging.getLogger(__name__)


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
    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": parse_mode,
    }
    if reply_markup:
        payload["reply_markup"] = reply_markup
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"https://api.telegram.org/bot{bot_token}/sendMessage",
                json=payload,
            )
            if resp.status_code != 200:
                logger.error(f"Telegram send error: {resp.text}")
    except Exception as e:
        logger.error(f"Telegram send exception: {e}")


async def get_directions_keyboard(user_id: str):
    """Build inline keyboard with directions."""
    directions = await db.directions.find(
        {"user_id": user_id, "is_active": True},
        {"_id": 0},
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
    """Get or create a mapping from Telegram chat_id to bot user state."""
    bot_user = await db.telegram_bot_users.find_one(
        {"chat_id": chat_id}, {"_id": 0}
    )
    if not bot_user:
        bot_user = {
            "id": str(uuid.uuid4()),
            "chat_id": chat_id,
            "telegram_username": telegram_user.get("username", ""),
            "telegram_first_name": telegram_user.get("first_name", ""),
            "owner_user_id": owner_user_id,
            "current_direction_id": "",
            "current_direction_name": "",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.telegram_bot_users.insert_one(bot_user)
        bot_user.pop("_id", None)
    return bot_user


async def update_bot_user_direction(chat_id: int, direction_id: str, direction_name: str):
    """Update user's current direction."""
    await db.telegram_bot_users.update_one(
        {"chat_id": chat_id},
        {"$set": {
            "current_direction_id": direction_id,
            "current_direction_name": direction_name,
        }},
    )


def parse_transaction_text(text: str):
    """
    Parse transaction text. Supports:
      "1000 Антон Ск"     → expense 1000, desc "Антон Ск"
      "+5000 продажа"     → income 5000, desc "продажа"
      "1000/ Антон Ск"    → expense 1000, desc "Антон Ск"
    """
    text = text.strip()

    is_income = text.startswith("+")
    if is_income:
        text = text[1:].strip()

    # Try pattern "amount/ description" or "amount description"
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

    tx_type = "income" if is_income else "expense"
    return {"type": tx_type, "amount": amount, "description": description}


@router.post("/telegram/webhook")
async def telegram_webhook(request: Request):
    """Handle incoming Telegram updates."""
    try:
        update = await request.json()
    except Exception:
        return {"ok": True}

    config = await get_bot_config()
    if not config:
        return {"ok": True}

    bot_token = config["telegram_bot_token"]
    owner_user_id = config["user_id"]

    # Handle callback queries (direction selection)
    if "callback_query" in update:
        callback = update["callback_query"]
        chat_id = callback["message"]["chat"]["id"]
        data = callback.get("data", "")

        if data.startswith("dir:"):
            parts = data.split(":", 2)
            if len(parts) == 3:
                direction_id = parts[1]
                direction_name = parts[2]
                await update_bot_user_direction(chat_id, direction_id, direction_name)
                await send_telegram(
                    bot_token, chat_id,
                    f"<b>Направление: {direction_name}</b>\n\n"
                    f"Теперь отправьте сумму и описание:\n"
                    f"• <code>1000 Антон зп</code> — расход\n"
                    f"• <code>+5000 продажа теплицы</code> — приход\n\n"
                    f"Или /direction чтобы сменить направление"
                )

                # Acknowledge callback
                try:
                    async with httpx.AsyncClient(timeout=5) as client:
                        await client.post(
                            f"https://api.telegram.org/bot{bot_token}/answerCallbackQuery",
                            json={"callback_query_id": callback["id"], "text": f"Выбрано: {direction_name}"},
                        )
                except Exception:
                    pass

        return {"ok": True}

    # Handle regular messages
    message = update.get("message")
    if not message:
        return {"ok": True}

    chat_id = message["chat"]["id"]
    text = (message.get("text") or "").strip()
    telegram_user = message.get("from", {})

    if not text:
        return {"ok": True}

    bot_user = await get_or_create_bot_user(chat_id, telegram_user, owner_user_id)

    # === COMMANDS ===

    if text == "/start":
        keyboard = await get_directions_keyboard(owner_user_id)
        await send_telegram(
            bot_token, chat_id,
            f"<b>WM Finance — Касса</b>\n\n"
            f"Привет, {telegram_user.get('first_name', '')}!\n"
            f"Выберите направление для записи операций:",
            reply_markup=keyboard,
        )
        return {"ok": True}

    if text in ("/direction", "/dir"):
        keyboard = await get_directions_keyboard(owner_user_id)
        await send_telegram(
            bot_token, chat_id,
            "Выберите направление:",
            reply_markup=keyboard,
        )
        return {"ok": True}

    if text == "/balance":
        # Show Cash PL balance
        account = await db.accounts.find_one(
            {"user_id": owner_user_id, "name": {"$regex": "cash", "$options": "i"}},
            {"_id": 0},
        )
        if account:
            bal = account.get("current_balance", 0)
            await send_telegram(
                bot_token, chat_id,
                f"<b>Баланс {account['name']}:</b> {bal:,.2f} {account.get('currency', 'PLN')}",
            )
        else:
            await send_telegram(bot_token, chat_id, "Касса не найдена")
        return {"ok": True}

    if text == "/last":
        txs = await db.transactions.find(
            {"user_id": owner_user_id, "source": "telegram_cash"},
            {"_id": 0},
        ).sort("created_at", -1).to_list(5)

        if not txs:
            await send_telegram(bot_token, chat_id, "Нет последних операций из бота")
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
            "/start — начать, выбрать направление\n"
            "/direction — сменить направление\n"
            "/balance — баланс кассы\n"
            "/last — последние 5 операций\n"
            "/help — помощь\n\n"
            "<b>Формат записи:</b>\n"
            "<code>1000 Антон зп</code> — расход\n"
            "<code>+5000 продажа</code> — приход",
        )
        return {"ok": True}

    # === TRANSACTION PARSING ===

    # Check direction is selected
    if not bot_user.get("current_direction_id"):
        keyboard = await get_directions_keyboard(owner_user_id)
        await send_telegram(
            bot_token, chat_id,
            "Сначала выберите направление:",
            reply_markup=keyboard,
        )
        return {"ok": True}

    parsed = parse_transaction_text(text)
    if not parsed:
        await send_telegram(
            bot_token, chat_id,
            "Не удалось распознать. Формат:\n"
            "<code>1000 Антон зп</code> — расход\n"
            "<code>+5000 продажа</code> — приход",
        )
        return {"ok": True}

    # Find Cash account
    account = await db.accounts.find_one(
        {"user_id": owner_user_id, "name": {"$regex": "cash", "$options": "i"}},
        {"_id": 0},
    )
    if not account:
        await send_telegram(bot_token, chat_id, "Счёт Cash не найден. Настройте в приложении.")
        return {"ok": True}

    # Try auto-category from rules
    category_id = ""
    category_name = ""
    if parsed["description"]:
        desc_upper = parsed["description"].strip().upper()
        rule = await db.contractor_category_rules.find_one(
            {"user_id": owner_user_id, "contractor_name_upper": desc_upper},
            {"_id": 0},
        )
        if rule:
            cat = await db.categories.find_one(
                {"id": rule["category_id"], "user_id": owner_user_id},
                {"_id": 0},
            )
            if cat:
                category_id = cat["id"]
                category_name = cat["name"]

    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    transaction = Transaction(
        date=date_str,
        type=parsed["type"],
        amount=parsed["amount"],
        currency=account.get("currency", "PLN"),
        direction_id=bot_user["current_direction_id"],
        direction_name=bot_user["current_direction_name"],
        category_id=category_id,
        category_name=category_name,
        account_id=account["id"],
        account_name=account["name"],
        description=parsed["description"] or "Операция из Telegram",
        comment=f"Telegram: @{telegram_user.get('username', '')} ({telegram_user.get('first_name', '')})",
        source="telegram_cash",
        status="fact",
        user_id=owner_user_id,
    )

    await db.transactions.insert_one(transaction.model_dump())
    await update_account_balance(account["id"], owner_user_id)

    # Get updated balance
    updated_account = await db.accounts.find_one(
        {"id": account["id"], "user_id": owner_user_id},
        {"_id": 0},
    )
    new_balance = updated_account.get("current_balance", 0) if updated_account else 0

    sign = "+" if parsed["type"] == "income" else "-"
    type_label = "Приход" if parsed["type"] == "income" else "Расход"
    cat_info = f"\nКатегория: {category_name}" if category_name else ""

    await send_telegram(
        bot_token, chat_id,
        f"<b>{type_label}</b> {sign}{parsed['amount']:,.0f} {account.get('currency', 'PLN')}\n"
        f"Описание: {parsed['description']}\n"
        f"Направление: {bot_user['current_direction_name']}\n"
        f"Счёт: {account['name']}"
        f"{cat_info}\n\n"
        f"Баланс: <b>{new_balance:,.2f} {account.get('currency', 'PLN')}</b>",
    )

    return {"ok": True}


@router.post("/telegram/setup-webhook")
async def setup_webhook(
    data: dict,
    current_user: dict = Depends(get_current_user),
):
    """Register the Telegram webhook URL."""
    settings = await db.integration_settings.find_one(
        {"user_id": current_user["user_id"]},
        {"_id": 0},
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
            else:
                return {"status": "error", "message": result.get("description", "Ошибка установки вебхука")}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/telegram/remove-webhook")
async def remove_webhook(current_user: dict = Depends(get_current_user)):
    """Remove the Telegram webhook."""
    settings = await db.integration_settings.find_one(
        {"user_id": current_user["user_id"]},
        {"_id": 0},
    )
    if not settings or not settings.get("telegram_bot_token"):
        raise HTTPException(status_code=400, detail="Telegram Bot Token не настроен")

    bot_token = settings["telegram_bot_token"]

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"https://api.telegram.org/bot{bot_token}/deleteWebhook",
            )
            result = resp.json()
            return {"status": "success" if result.get("ok") else "error", "message": result.get("description", "")}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/telegram/webhook-info")
async def get_webhook_info(current_user: dict = Depends(get_current_user)):
    """Get current webhook status."""
    settings = await db.integration_settings.find_one(
        {"user_id": current_user["user_id"]},
        {"_id": 0},
    )
    if not settings or not settings.get("telegram_bot_token"):
        return {"configured": False}

    bot_token = settings["telegram_bot_token"]

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"https://api.telegram.org/bot{bot_token}/getWebhookInfo",
            )
            result = resp.json()
            info = result.get("result", {})
            return {
                "configured": True,
                "webhook_url": info.get("url", ""),
                "has_custom_certificate": info.get("has_custom_certificate", False),
                "pending_update_count": info.get("pending_update_count", 0),
                "last_error_message": info.get("last_error_message"),
            }
    except Exception as e:
        return {"configured": True, "error": str(e)}


@router.get("/telegram/bot-users")
async def get_bot_users(current_user: dict = Depends(get_current_user)):
    """Get list of Telegram users linked to the bot."""
    users = await db.telegram_bot_users.find(
        {"owner_user_id": current_user["user_id"]},
        {"_id": 0},
    ).to_list(100)
    return {"users": users}
