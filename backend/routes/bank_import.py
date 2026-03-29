from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from typing import Optional
from datetime import datetime, timezone
import uuid
import re
import io
import logging

from database import db
from auth import get_current_user

router = APIRouter(prefix="/api")
logger = logging.getLogger(__name__)


def _parse_polish_number(s: str) -> float:
    """Parse a Polish-formatted number like '1 234,56' or '-421,20'."""
    s = s.strip().replace(" ", "").replace(",", ".")
    return float(s)


def parse_pdf_statement(pdf_bytes: bytes) -> dict:
    """Parse a PKO BP bank statement PDF and extract transactions."""
    import pdfplumber

    pdf = pdfplumber.open(io.BytesIO(pdf_bytes))
    full_text = ""
    for page in pdf.pages:
        full_text += (page.extract_text() or "") + "\n"
    pdf.close()

    lines = full_text.split("\n")

    # Extract metadata from first page
    currency = "PLN"
    account_number = ""
    account_holder = ""
    period = ""

    for line in lines[:30]:
        if "Waluta rachunku:" in line:
            if "EUR" in line:
                currency = "EUR"
            elif "USD" in line:
                currency = "USD"
            else:
                currency = "PLN"

        m = re.search(r'Nr rachunku/karty:\s*(\d[\d\s]+\d)', line)
        if m:
            account_number = m.group(1).strip()

        m = re.search(r'Nr IBAN:\s*\w{2}\s*(\d[\d\s]+\d)', line)
        if m and not account_number:
            account_number = m.group(1).strip()

        if "WYCIĄG za okres" in line:
            m2 = re.search(r'(\d{2}\.\d{2}\.\d{4})\s*-\s*(\d{2}\.\d{2}\.\d{4})', line)
            if m2:
                period = f"{m2.group(1)} - {m2.group(2)}"

        if "W.M. GROUP" in line:
            account_holder = "W.M. GROUP SP. Z O.O."

    # Parse transactions
    # PKO BP format per transaction:
    # Line 1: DD.MM.YYYY  <identifier>  <OPERATION TYPE>  <amount>  <balance>
    # Line 2: DD.MM.YYYY  <description text>
    # Line 3+: continuation of description

    # Pattern for transaction header line:
    # Date + ID + Operation type + Amount (with optional spaces as thousands sep) + Balance
    header_pattern = re.compile(
        r'^(\d{2}\.\d{2}\.\d{4})\s+'  # operation date
        r'(\w+)\s+'                     # identifier
        r'(.+?)\s+'                     # operation type
        r'(-?[\d\s]+,\d{2})\s+'        # amount
        r'(-?[\d\s]+,\d{2})\s*$'       # balance
    )

    # Date-only line pattern (value date + description start)
    date_line_pattern = re.compile(r'^(\d{2}\.\d{2}\.\d{4})\s+(.*)')

    transactions = []
    i = 0

    while i < len(lines):
        line = lines[i].strip()
        header_match = header_pattern.match(line)

        if header_match:
            op_date = header_match.group(1)
            op_type_raw = header_match.group(3).strip()
            amount = _parse_polish_number(header_match.group(4))
            balance = _parse_polish_number(header_match.group(5))

            # Read description lines (next line starts with value date)
            desc_parts = []
            i += 1
            value_date = None

            while i < len(lines):
                next_line = lines[i].strip()
                if not next_line:
                    i += 1
                    continue

                # Check if this is a new transaction header
                if header_pattern.match(next_line):
                    break

                # Check for "Saldo z przeniesienia" (page break carry-over)
                if "Saldo z przeniesienia" in next_line:
                    i += 1
                    continue

                # Skip page headers
                if any(skip in next_line for skip in [
                    "www.pkobp.pl", "WYCIĄG za okres", "Nr:", "Nr rachunku",
                    "Data operacji", "Data waluty", "Opis operacji",
                    "Identyfikator operacji", "strona", "infolinia",
                    "w pozostałych", "+48 81", "brak opłat"
                ]):
                    i += 1
                    continue

                # First description line starts with value date
                date_match = date_line_pattern.match(next_line)
                if date_match and not value_date:
                    value_date = date_match.group(1)
                    desc_text = date_match.group(2).strip()
                    if desc_text:
                        desc_parts.append(desc_text)
                    i += 1
                    continue

                # Continuation lines
                desc_parts.append(next_line)
                i += 1

            full_desc = " ".join(desc_parts)

            # Determine transaction type
            tx_type = "income" if amount > 0 else "expense"

            # Parse counterparty and purpose
            counterparty, payment_purpose = _extract_counterparty(op_type_raw, full_desc)

            # Translate operation type
            op_label = _translate_op_type(op_type_raw)

            # Convert date
            try:
                dt = datetime.strptime(op_date, "%d.%m.%Y")
                iso_date = dt.strftime("%Y-%m-%d")
            except ValueError:
                iso_date = op_date

            transactions.append({
                "date": iso_date,
                "original_date": op_date,
                "operation_type": op_label,
                "operation_type_raw": op_type_raw,
                "description": full_desc[:500],
                "counterparty": counterparty,
                "payment_purpose": payment_purpose[:500] if payment_purpose else "",
                "amount": abs(amount),
                "type": tx_type,
                "currency": currency,
                "balance_after": balance,
            })
            continue

        i += 1

    return {
        "account_number": account_number,
        "account_holder": account_holder,
        "currency": currency,
        "period": period,
        "transactions_count": len(transactions),
        "transactions": transactions,
    }


def _translate_op_type(raw: str) -> str:
    mapping = {
        "PRZELEW WYCHODZĄCY": "Исходящий перевод",
        "PRZELEW PRZYCHODZĄCY": "Входящий перевод",
        "PRZELEW NATYCHMIASTOWY PRZYCHODZ.": "Мгновенный входящий перевод",
        "ZAKUP PRZY UŻYCIU KARTY": "Оплата картой",
        "ZAKUP W TERMINALU-KOD MOBILNY": "Оплата в терминале",
        "PŁATNOŚĆ WEB - KOD MOBILNY": "Онлайн-оплата",
        "UZNANIE OPERACJĄ SKARBOWĄ": "Валютный приход",
        "OBCIĄŻENIE OPERACJĄ SKARBOWĄ": "Валютный расход",
        "WYPŁATA W BANKOMACIE-KOD MOBILNY": "Снятие в банкомате",
        "WYPŁATA W BANKOMACIE": "Снятие в банкомате",
        "WPŁATA GOTÓWKI - KOD MOBILNY": "Внесение наличных",
        "OBC. PROW. OD WYSYŁ. PRZEL. ZAGR": "Комиссия банка",
        "PRZEJĘCIE ODPOWIEDZIALNOŚCI": "Комиссия/Страховка",
    }
    for k, v in mapping.items():
        if k in raw:
            return v
    return raw


def _extract_counterparty(op_type_raw: str, desc: str) -> tuple:
    """Extract counterparty name and payment purpose from description."""
    counterparty = ""
    payment_purpose = desc

    # For outgoing transfers: look for counterparty after account number
    if "PRZELEW WYCHODZĄCY" in op_type_raw:
        # Pattern: <invoice_info> <account_26_digits> <COUNTERPARTY_NAME>
        m = re.search(
            r'(\d{2}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4})\s+(.+?)(?:\s+Ref\.|\s*$)',
            desc
        )
        if m:
            counterparty = m.group(2).strip()
            # Payment purpose is the text before the account number
            before = desc[:m.start()].strip()
            if before:
                payment_purpose = before

    # For incoming transfers
    elif "PRZYCHODZĄCY" in op_type_raw or "PRZELEW NATYCHMIASTOWY" in op_type_raw:
        m = re.search(
            r'(\d{2}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4})\s+(.+?)(?:\s+(?:UL\.|AL\.|Data|Konstitucijos))',
            desc
        )
        if m:
            counterparty = m.group(2).strip()
        # Get payment purpose - text before account number
        m2 = re.search(r'^(.+?)\s+\d{2}\s?\d{4}\s?\d{4}', desc)
        if m2:
            payment_purpose = m2.group(1).strip()

    # For card payments: location
    elif "ZAKUP PRZY UŻYCIU KARTY" in op_type_raw or "ZAKUP W TERMINALU" in op_type_raw:
        loc_match = re.search(r'Lokalizacja:\s*(.+?)(?:\s+(?:Nr ref:|PL|IE|AE|LT|DE)\b)', desc)
        if loc_match:
            counterparty = loc_match.group(1).strip()
            # Clean trailing country codes
            counterparty = re.sub(r'\s+(PL|IE|AE|LT|DE)\s*$', '', counterparty).strip()
            # Remove city names at end for cleaner grouping
            counterparty = re.sub(r',?\s*(WARSZAWA|DUBLIN|RASZYN|POZNAŃ)\s*$', '', counterparty).strip()

    # For web payments: location (website)
    elif "PŁATNOŚĆ WEB" in op_type_raw:
        loc_match = re.search(r'Lokalizacja:\s*(.+?)(?:\s+Nr ref:)', desc)
        if loc_match:
            counterparty = loc_match.group(1).strip()

    # For currency operations
    elif "OPERACJĄ SKARBOWĄ" in op_type_raw:
        fx_match = re.search(r'(FX\d+\s+\w+/\w+\s+[\d,]+)', desc)
        if fx_match:
            payment_purpose = fx_match.group(1)
        counterparty = "W.M. GROUP (FX)"

    # For ATM
    elif "BANKOMACIE" in op_type_raw:
        loc_match = re.search(r'Lokalizacja:\s*(.+?)(?:\s+(?:Nr ref:|PL)\b)', desc)
        if loc_match:
            counterparty = "Банкомат: " + loc_match.group(1).strip()

    # For cash deposit
    elif "WPŁATA" in op_type_raw:
        counterparty = "Внесение наличных"
        payment_purpose = desc

    return counterparty, payment_purpose


def group_similar_transactions(transactions: list) -> list:
    """Group transactions by similar counterparty/description patterns."""
    groups = {}

    for idx, t in enumerate(transactions):
        cp = (t.get("counterparty") or "").strip()
        tx_type = t["type"]

        # Generate group key
        group_key = None
        group_label = None

        if "TikTok" in t.get("description", "") or "TIKTOK" in cp.upper():
            group_key = "TIKTOK_ADS|" + tx_type
            group_label = "TikTok Ads"
        elif "GOOGLE *ADS" in t.get("description", "") or "GOOGLE" in cp.upper():
            group_key = "GOOGLE_ADS|" + tx_type
            group_label = "Google Ads"
        elif "FACEBK" in t.get("description", "") or "fb.me" in t.get("description", ""):
            group_key = "FACEBOOK_ADS|" + tx_type
            group_label = "Facebook Ads"
        elif "CASTORAMA" in t.get("description", ""):
            group_key = "CASTORAMA|" + tx_type
            group_label = "Castorama"
        elif "e100.eu" in t.get("description", ""):
            group_key = "E100_FUEL|" + tx_type
            group_label = "E100 Топливо"
        elif "olx.pl" in t.get("description", ""):
            group_key = "OLX|" + tx_type
            group_label = "OLX"
        elif "otomoto" in t.get("description", ""):
            group_key = "OTOMOTO|" + tx_type
            group_label = "Otomoto"
        elif "allegro" in t.get("description", "").lower():
            group_key = "ALLEGRO|" + tx_type
            group_label = "Allegro"
        elif "BANKOMACIE" in t.get("description", ""):
            group_key = "ATM|" + tx_type
            group_label = "Снятие в банкомате"
        elif "OPERACJĄ SKARBOWĄ" in t.get("description", ""):
            group_key = "FX_OPERATION|" + tx_type
            group_label = "Валютные операции"
        elif "PIEKARNIA" in t.get("description", ""):
            group_key = "PIEKARNIA|" + tx_type
            group_label = "Пекарня (PIEKARNIA)"
        elif cp:
            normalized_cp = re.sub(r'\s+', ' ', cp).upper()[:50]
            group_key = f"CP:{normalized_cp}|{tx_type}"
            group_label = cp
        else:
            group_key = f"OP:{t.get('operation_type', '')}|{tx_type}"
            group_label = t.get("operation_type", "Другое")

        if group_key not in groups:
            groups[group_key] = {
                "group_key": group_key,
                "label": group_label,
                "type": tx_type,
                "count": 0,
                "total_amount": 0,
                "indices": [],
            }
        groups[group_key]["count"] += 1
        groups[group_key]["total_amount"] += t["amount"]
        groups[group_key]["indices"].append(idx)

    # Return groups with >1 transaction for batch editing
    result = [g for g in groups.values() if g["count"] > 1]
    result.sort(key=lambda x: x["count"], reverse=True)
    return result


@router.post("/bank-import/parse")
async def parse_bank_statement(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Parse a PDF bank statement and return extracted transactions for review."""
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Поддерживаются только PDF файлы")

    content = await file.read()
    if len(content) > 20 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Файл слишком большой (макс. 20 МБ)")

    try:
        result = parse_pdf_statement(content)
    except Exception as e:
        logger.error(f"PDF parse error: {e}", exc_info=True)
        raise HTTPException(status_code=400, detail=f"Ошибка парсинга PDF: {str(e)}")

    if not result["transactions"]:
        raise HTTPException(status_code=400, detail="Не удалось извлечь операции из PDF")

    # Auto-match contractors
    contractors = await db.contractors.find(
        {"user_id": current_user["user_id"], "is_active": True},
        {"_id": 0, "id": 1, "name": 1}
    ).to_list(500)

    contractor_map = {c["name"].upper(): c for c in contractors}

    # Load contractor → category rules
    rules = await db.contractor_category_rules.find(
        {"user_id": current_user["user_id"]},
        {"_id": 0}
    ).to_list(1000)
    rules_map = {r["contractor_name_upper"]: r for r in rules}

    # Load auto_rules (pattern-based)
    auto_rules = await db.auto_rules.find(
        {"user_id": current_user["user_id"], "is_active": True},
        {"_id": 0}
    ).to_list(100)

    # Collect unique new counterparties
    new_counterparties = {}
    auto_rules_matched = 0

    for t in result["transactions"]:
        t["matched_contractor_id"] = None
        t["matched_contractor_name"] = None
        t["auto_category_id"] = None
        t["auto_direction_id"] = None
        t["auto_contractor_id"] = None
        t["matched_rule_pattern"] = None
        cp = (t.get("counterparty") or "").upper().strip()
        if cp:
            if cp in contractor_map:
                t["matched_contractor_id"] = contractor_map[cp]["id"]
                t["matched_contractor_name"] = contractor_map[cp]["name"]
            else:
                for name, c in contractor_map.items():
                    if name in cp or cp in name:
                        t["matched_contractor_id"] = c["id"]
                        t["matched_contractor_name"] = c["name"]
                        cp = name  # use matched key for rules lookup
                        break

            # Apply contractor → category rules
            rule = rules_map.get(cp)
            if rule:
                t["auto_category_id"] = rule.get("category_id")
                t["auto_direction_id"] = rule.get("direction_id")

            # Track new counterparties (not matched to existing contractors)
            if not t["matched_contractor_id"] and t.get("counterparty"):
                raw_cp = t["counterparty"].strip()
                if raw_cp and raw_cp.upper() not in new_counterparties:
                    new_counterparties[raw_cp.upper()] = raw_cp

        # Apply auto_rules (pattern matching on description + counterparty)
        search_text = (t.get("description", "") + " " + t.get("counterparty", "") + " " + t.get("payment_purpose", "")).lower()
        for ar in auto_rules:
            if ar["pattern"].lower() in search_text:
                if ar.get("category_id") and not t["auto_category_id"]:
                    t["auto_category_id"] = ar["category_id"]
                if ar.get("direction_id") and not t["auto_direction_id"]:
                    t["auto_direction_id"] = ar["direction_id"]
                if ar.get("contractor_id") and not t["matched_contractor_id"]:
                    t["auto_contractor_id"] = ar["contractor_id"]
                t["matched_rule_pattern"] = ar["pattern"]
                auto_rules_matched += 1
                break

    result["new_counterparties"] = list(new_counterparties.values())
    result["auto_rules_matched"] = auto_rules_matched

    # Check for duplicates
    if result["transactions"]:
        date_from = min(t["date"] for t in result["transactions"])
        date_to = max(t["date"] for t in result["transactions"])
        existing = await db.transactions.find(
            {
                "user_id": current_user["user_id"],
                "date": {"$gte": date_from, "$lte": date_to},
                "source": "import"
            },
            {"_id": 0, "date": 1, "amount": 1}
        ).to_list(10000)
        existing_set = {(e["date"], e["amount"]) for e in existing}

        for t in result["transactions"]:
            t["is_duplicate"] = (t["date"], t["amount"]) in existing_set
    else:
        for t in result["transactions"]:
            t["is_duplicate"] = False

    # Generate groups and mark which need rules
    result["groups"] = group_similar_transactions(result["transactions"])

    # Mark groups that already have auto-rules
    rule_patterns = {ar["pattern"].lower() for ar in auto_rules}
    for g in result["groups"]:
        label_lower = g["label"].lower()
        g["has_rule"] = any(p in label_lower or label_lower in p for p in rule_patterns)
        # Also check if all items in group already have category assigned
        g["all_categorized"] = all(
            result["transactions"][i].get("auto_category_id") for i in g["indices"]
        )
    result["suggested_rules"] = [
        g for g in result["groups"]
        if g["count"] >= 3 and not g["has_rule"] and not g["all_categorized"]
    ]

    return result


@router.post("/bank-import/confirm")
async def confirm_bank_import(
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Import confirmed transactions into the system."""
    account_id = data.get("account_id")
    direction_id = data.get("direction_id")
    transactions_data = data.get("transactions", [])
    new_contractors_to_create = data.get("new_contractors", [])

    if not account_id:
        raise HTTPException(status_code=400, detail="Выберите счёт")
    if not direction_id:
        raise HTTPException(status_code=400, detail="Выберите направление по умолчанию")
    if not transactions_data:
        raise HTTPException(status_code=400, detail="Нет операций для импорта")

    account = await db.accounts.find_one(
        {"id": account_id, "user_id": current_user["user_id"]},
        {"_id": 0}
    )
    if not account:
        raise HTTPException(status_code=404, detail="Счёт не найден")

    direction = await db.directions.find_one({"id": direction_id}, {"_id": 0, "name": 1})
    default_direction_name = direction["name"] if direction else ""

    # Auto-create new contractors
    created_contractor_map = {}
    for cp_name in new_contractors_to_create:
        cp_name = cp_name.strip()
        if not cp_name:
            continue
        existing = await db.contractors.find_one(
            {"user_id": current_user["user_id"], "name": {"$regex": f"^{re.escape(cp_name)}$", "$options": "i"}},
            {"_id": 0, "id": 1}
        )
        if existing:
            created_contractor_map[cp_name.upper()] = existing["id"]
        else:
            new_id = str(uuid.uuid4())
            contractor_doc = {
                "id": new_id,
                "name": cp_name,
                "type": "supplier",
                "is_active": True,
                "user_id": current_user["user_id"],
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.contractors.insert_one(contractor_doc)
            created_contractor_map[cp_name.upper()] = new_id

    imported = 0
    rules_to_save = []
    transfer_target_accounts = set()

    for t in transactions_data:
        t_direction_id = t.get("direction_id") or direction_id
        t_direction_name = default_direction_name
        if t_direction_id != direction_id:
            d = await db.directions.find_one({"id": t_direction_id}, {"_id": 0, "name": 1})
            t_direction_name = d["name"] if d else ""

        # Resolve contractor — check auto-created first
        contractor_id = t.get("contractor_id")
        contractor_name = t.get("counterparty", "")
        if not contractor_id and contractor_name:
            contractor_id = created_contractor_map.get(contractor_name.upper())
        if contractor_id:
            c = await db.contractors.find_one({"id": contractor_id}, {"_id": 0, "name": 1})
            if c:
                contractor_name = c["name"]

        category_name = None
        category_id = t.get("category_id")
        if category_id:
            cat = await db.categories.find_one({"id": category_id}, {"_id": 0, "name": 1})
            category_name = cat["name"] if cat else None

        # Collect rules: contractor + category mapping
        if contractor_name and category_id:
            rules_to_save.append({
                "contractor_name_upper": contractor_name.upper().strip(),
                "category_id": category_id,
                "direction_id": t_direction_id if t_direction_id != direction_id else None,
            })

        transaction = {
            "id": str(uuid.uuid4()),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "date": t["date"],
            "type": t.get("type", "expense"),
            "amount": abs(float(t["amount"])),
            "currency": t.get("currency", "PLN"),
            "category_id": category_id,
            "category_name": category_name,
            "direction_id": t_direction_id,
            "direction_name": t_direction_name,
            "account_id": account_id,
            "account_name": account["name"],
            "to_account_id": t.get("to_account_id") or None,
            "contractor_id": contractor_id,
            "contractor_name": contractor_name,
            "description": t.get("payment_purpose") or t.get("description", ""),
            "comment": t.get("comment", ""),
            "source": "import",
            "status": "fact",
            "is_recurring": False,
            "needs_review": bool(t.get("needs_review", False)),
            "balance_after": 0,
            "user_id": current_user["user_id"],
        }

        await db.transactions.insert_one(transaction)
        imported += 1

        # Update target account balance for transfers
        if t.get("type") == "transfer" and t.get("to_account_id"):
            transfer_target_accounts.add(t["to_account_id"])

    # Save contractor → category rules (upsert)
    for rule in rules_to_save:
        update_fields = {"category_id": rule["category_id"]}
        if rule.get("direction_id"):
            update_fields["direction_id"] = rule["direction_id"]
        await db.contractor_category_rules.update_one(
            {
                "user_id": current_user["user_id"],
                "contractor_name_upper": rule["contractor_name_upper"],
            },
            {"$set": update_fields, "$setOnInsert": {
                "user_id": current_user["user_id"],
                "contractor_name_upper": rule["contractor_name_upper"],
                "created_at": datetime.now(timezone.utc).isoformat(),
            }},
            upsert=True,
        )

    # Update account balance
    from services.balance import update_account_balance
    await update_account_balance(account_id, current_user["user_id"])
    for target_id in transfer_target_accounts:
        await update_account_balance(target_id, current_user["user_id"])

    return {
        "status": "success",
        "imported": imported,
        "account_name": account["name"],
        "contractors_created": len(created_contractor_map),
    }
