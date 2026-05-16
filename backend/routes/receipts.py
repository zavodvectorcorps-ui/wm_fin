"""
Receipt OCR & smart-match.

Flow:
1. User uploads receipt image (JPG/PNG/WEBP/HEIC) or PDF.
2. We call Gemini vision (gemini-2.5-pro) to extract date + total amount + currency.
3. We search transactions in DB within ±3 days of the extracted date and ±10% of
   the amount. The most-likely candidates are returned to the frontend together
   with the freshly-created Document row.
4. Frontend then asks the user to confirm: "Attach to this transaction?".
   On Yes → POST /api/documents/{id}/link/{transaction_id} (existing endpoint).
"""

from __future__ import annotations

import os
import re
import json
import uuid
import base64
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from dotenv import load_dotenv

from database import db
from auth import get_current_user
from models import Document

load_dotenv()

router = APIRouter(prefix="/api/receipts")

UPLOADS_DIR = Path(__file__).parent.parent / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)

ALLOWED_EXT = {".pdf", ".png", ".jpg", ".jpeg", ".webp", ".heic", ".heif"}
IMAGE_EXT = {".png", ".jpg", ".jpeg", ".webp", ".heic", ".heif"}

MIME_BY_EXT = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".heic": "image/heic",
    ".heif": "image/heif",
    ".pdf": "application/pdf",
}


SYSTEM_PROMPT = (
    "You are an OCR engine specialised in financial receipts and invoices "
    "(Polish, English, Russian, German). Extract data and reply ONLY with a "
    "JSON object — no extra commentary."
)

USER_PROMPT = (
    "Look at this receipt/invoice and extract the following fields:\n"
    "  - date: the transaction/issue date in ISO format YYYY-MM-DD\n"
    "  - amount: the FINAL total to pay (gross, with VAT), as a number\n"
    "  - currency: ISO code (PLN, EUR, USD, BYN, RUB). If unsure, return null.\n"
    "  - merchant: short merchant/issuer name (optional, up to 40 chars).\n\n"
    "If a field is unreadable or absent — return null for it.\n"
    "Respond with ONLY a valid JSON object, e.g.:\n"
    '{"date": "2025-07-15", "amount": 235.50, "currency": "PLN", "merchant": "Biedronka"}'
)


async def _extract_with_gemini(file_path: Path, mime_type: str) -> dict:
    """Run Gemini vision to extract date + amount. Returns parsed dict or {}."""
    try:
        from emergentintegrations.llm.chat import (
            LlmChat,
            UserMessage,
            FileContentWithMimeType,
        )
    except ImportError as e:
        raise HTTPException(status_code=500, detail=f"emergentintegrations unavailable: {e}")

    api_key = os.getenv("EMERGENT_LLM_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="EMERGENT_LLM_KEY not configured")

    chat = LlmChat(
        api_key=api_key,
        session_id=f"receipt-{uuid.uuid4()}",
        system_message=SYSTEM_PROMPT,
    ).with_model("gemini", "gemini-2.5-pro")

    file_content = FileContentWithMimeType(
        file_path=str(file_path),
        mime_type=mime_type,
    )
    msg = UserMessage(text=USER_PROMPT, file_contents=[file_content])

    try:
        raw = await chat.send_message(msg)
    except Exception as e:  # noqa
        raise HTTPException(status_code=502, detail=f"Vision LLM error: {e}")

    return _parse_json(raw)


def _parse_json(raw: str) -> dict:
    if not raw:
        return {}
    # Strip ``` code-fences if present
    cleaned = raw.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    # First try direct parse, then try to locate the first { ... } block
    try:
        return json.loads(cleaned)
    except Exception:
        m = re.search(r"\{[^{}]*\}", cleaned, re.DOTALL)
        if m:
            try:
                return json.loads(m.group(0))
            except Exception:
                return {}
    return {}


def _safe_date(s: Optional[str]) -> Optional[str]:
    if not s or not isinstance(s, str):
        return None
    try:
        return datetime.strptime(s[:10], "%Y-%m-%d").strftime("%Y-%m-%d")
    except Exception:
        return None


def _safe_amount(v) -> Optional[float]:
    if v is None:
        return None
    try:
        if isinstance(v, str):
            v = v.replace(",", ".").replace(" ", "")
        return float(v)
    except Exception:
        return None


@router.post("/upload-and-match")
async def upload_and_match(
    file: UploadFile = File(...),
    description: Optional[str] = Form(None),
    direction_id: Optional[str] = Form(None),
    current_user: dict = Depends(get_current_user),
):
    """Upload a receipt, OCR with Gemini, return Document + transaction candidates."""
    file_ext = os.path.splitext(file.filename or "")[1].lower()
    if file_ext not in ALLOWED_EXT:
        raise HTTPException(status_code=400, detail=f"File type {file_ext} not allowed")

    file_id = str(uuid.uuid4())
    safe_filename = f"{file_id}{file_ext}"
    file_path = UPLOADS_DIR / safe_filename
    content = await file.read()
    file_size = len(content)
    with open(file_path, "wb") as f:
        f.write(content)

    mime = MIME_BY_EXT.get(file_ext) or file.content_type or "application/octet-stream"

    # ---- OCR ----
    extracted = await _extract_with_gemini(file_path, mime)
    ext_date = _safe_date(extracted.get("date"))
    ext_amount = _safe_amount(extracted.get("amount"))
    ext_currency = extracted.get("currency")
    if isinstance(ext_currency, str):
        ext_currency = ext_currency.upper().strip() or None
    if ext_currency and ext_currency not in {"PLN", "EUR", "USD"}:
        ext_currency = None  # we only support these in matching
    ext_merchant = (extracted.get("merchant") or "")[:60] or None

    # ---- Match ----
    candidates: List[dict] = []
    if ext_date and ext_amount and ext_amount > 0:
        target = datetime.strptime(ext_date, "%Y-%m-%d")
        date_from = (target - timedelta(days=3)).strftime("%Y-%m-%d")
        date_to = (target + timedelta(days=3)).strftime("%Y-%m-%d")
        amt_min = ext_amount * 0.9
        amt_max = ext_amount * 1.1

        q = {
            "user_id": current_user["user_id"],
            "date": {"$gte": date_from, "$lte": date_to},
            "amount": {"$gte": amt_min, "$lte": amt_max},
            "type": {"$in": ["expense", "income"]},  # transfers don't get receipts
        }
        if ext_currency:
            q["currency"] = ext_currency

        cursor = db.transactions.find(q, {"_id": 0}).sort("date", 1).limit(20)
        async for tx in cursor:
            # Score: distance in days + relative amount delta. Lower is better.
            try:
                tx_date = datetime.strptime(tx.get("date", "")[:10], "%Y-%m-%d")
                day_dist = abs((tx_date - target).days)
            except Exception:
                day_dist = 99
            amt_delta = abs((tx.get("amount") or 0) - ext_amount) / max(ext_amount, 0.01)
            score = day_dist + amt_delta * 10  # weight amount accuracy higher
            tx["_match_score"] = round(score, 3)
            tx["_day_distance"] = day_dist
            tx["_amount_delta_pct"] = round(amt_delta * 100, 1)
            candidates.append(tx)
        candidates.sort(key=lambda x: x["_match_score"])
        candidates = candidates[:5]

    # ---- Save Document row ----
    status_val = "pending"  # user still needs to confirm — only set "linked" via /link endpoint
    description_val = description or ext_merchant or "Чек (распознано AI)"

    doc = Document(
        document_date=ext_date,
        type="receipt",
        file_name=file.filename or safe_filename,
        file_url=f"/api/documents/file/{safe_filename}",
        file_size=file_size,
        mime_type=mime,
        transaction_id=None,
        direction_id=direction_id,
        period=ext_date[:7] if ext_date else None,
        status=status_val,
        source="ai-receipt",
        description=description_val,
        user_id=current_user["user_id"],
    ).model_dump()

    # Stash AI-extracted hints so the user can see them later
    doc["ai_extracted"] = {
        "date": ext_date,
        "amount": ext_amount,
        "currency": ext_currency,
        "merchant": ext_merchant,
    }
    await db.documents.insert_one(doc)
    doc.pop("_id", None)

    return {
        "document": doc,
        "extracted": doc["ai_extracted"],
        "candidates": candidates,
        "auto_match_possible": len(candidates) > 0,
    }


@router.get("/unmatched")
async def list_unmatched(current_user: dict = Depends(get_current_user)):
    """List receipts that don't yet have an attached transaction."""
    cursor = db.documents.find(
        {
            "user_id": current_user["user_id"],
            "type": "receipt",
            "status": "pending",
            "transaction_id": None,
        },
        {"_id": 0},
    ).sort("created_at", -1).limit(200)
    items = []
    async for d in cursor:
        items.append(d)
    return {"items": items, "total": len(items)}
