from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional

from database import db
from auth import get_current_user
from models import Project, ProjectCreate, AutoRule, AutoRuleCreate

router = APIRouter(prefix="/api")


@router.get("/projects", response_model=List[Project])
async def get_projects(
    status: Optional[str] = None,
    direction_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {"user_id": current_user["user_id"]}
    if status:
        query["status"] = status
    if direction_id:
        query["direction_id"] = direction_id

    projects = await db.projects.find(query, {"_id": 0}).to_list(500)
    return projects


@router.get("/projects/{project_id}")
async def get_project(project_id: str, current_user: dict = Depends(get_current_user)):
    project = await db.projects.find_one({"id": project_id, "user_id": current_user["user_id"]}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    transactions = await db.transactions.find(
        {"project_id": project_id, "user_id": current_user["user_id"]},
        {"_id": 0}
    ).sort("date", -1).to_list(100)

    actual_income = sum(t["amount"] for t in transactions if t["type"] == "income")
    actual_expense = sum(t["amount"] for t in transactions if t["type"] == "expense")

    project["transactions"] = transactions
    project["actual_amount"] = actual_income - actual_expense
    project["total_income"] = actual_income
    project["total_expense"] = actual_expense

    return project


@router.post("/projects", response_model=Project)
async def create_project(data: ProjectCreate, current_user: dict = Depends(get_current_user)):
    direction = await db.directions.find_one({"id": data.direction_id}, {"_id": 0, "name": 1})
    direction_name = direction["name"] if direction else None

    contractor_name = None
    if data.contractor_id:
        contractor = await db.contractors.find_one({"id": data.contractor_id}, {"_id": 0, "name": 1})
        contractor_name = contractor["name"] if contractor else None

    project = Project(**data.model_dump(), user_id=current_user["user_id"], direction_name=direction_name, contractor_name=contractor_name)
    await db.projects.insert_one(project.model_dump())
    return project


@router.put("/projects/{project_id}", response_model=Project)
async def update_project(project_id: str, data: ProjectCreate, current_user: dict = Depends(get_current_user)):
    result = await db.projects.update_one(
        {"id": project_id, "user_id": current_user["user_id"]},
        {"$set": data.model_dump()}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Project not found")
    project = await db.projects.find_one({"id": project_id}, {"_id": 0})
    return project


@router.delete("/projects/{project_id}")
async def delete_project(project_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.projects.delete_one({"id": project_id, "user_id": current_user["user_id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"status": "deleted"}


# Auto Rules
@router.get("/auto-rules", response_model=List[AutoRule])
async def get_auto_rules(current_user: dict = Depends(get_current_user)):
    rules = await db.auto_rules.find({"user_id": current_user["user_id"]}, {"_id": 0}).to_list(100)
    return rules


@router.post("/auto-rules", response_model=AutoRule)
async def create_auto_rule(data: AutoRuleCreate, current_user: dict = Depends(get_current_user)):
    rule = AutoRule(**data.model_dump(), user_id=current_user["user_id"])
    await db.auto_rules.insert_one(rule.model_dump())
    return rule


@router.put("/auto-rules/{rule_id}", response_model=AutoRule)
async def update_auto_rule(rule_id: str, data: AutoRuleCreate, current_user: dict = Depends(get_current_user)):
    result = await db.auto_rules.update_one(
        {"id": rule_id, "user_id": current_user["user_id"]},
        {"$set": data.model_dump()}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Rule not found")
    rule = await db.auto_rules.find_one({"id": rule_id}, {"_id": 0})
    return rule


@router.delete("/auto-rules/{rule_id}")
async def delete_auto_rule(rule_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.auto_rules.delete_one({"id": rule_id, "user_id": current_user["user_id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Rule not found")
    return {"status": "deleted"}


@router.get("/auto-rules/suggestions")
async def auto_rule_suggestions(
    limit: int = 10,
    current_user: dict = Depends(get_current_user)
):
    """Suggest auto-rule patterns by mining uncategorized transactions.

    Algorithm:
    - Take all transactions without category_id (income/expense only — transfers skipped).
    - Extract significant tokens from descriptions (length ≥ 4, alphabetic).
    - Group transactions by each token, count occurrences.
    - Exclude tokens already covered by an active rule.
    - Sort by (count desc, total_amount desc), return top `limit`.
    """
    user_id = current_user["user_id"]
    limit = max(1, min(limit, 30))

    # Existing rule patterns to avoid duplicates
    existing_rules = await db.auto_rules.find(
        {"user_id": user_id, "is_active": True},
        {"_id": 0, "pattern": 1}
    ).to_list(None)
    existing_patterns = {(r.get("pattern") or "").lower().strip() for r in existing_rules}

    # Uncategorized transactions (no category_id) and type in income/expense
    txs = await db.transactions.find(
        {"user_id": user_id,
         "type": {"$in": ["income", "expense"]},
         "$or": [{"category_id": None}, {"category_id": {"$exists": False}}, {"category_id": ""}],
         "description": {"$exists": True, "$ne": ""}},
        {"_id": 0, "id": 1, "description": 1, "amount": 1, "amount_base": 1, "type": 1}
    ).to_list(5000)

    import re
    STOP = {
        "tytuł", "tytul", "przelew", "platnosc", "platność", "platność",
        "operacja", "transakcja", "polecenie", "spolka", "spółka",
        "from", "the", "for", "with", "ltd", "sro",
        "оплата", "перевод", "платеж", "оплата", "счет", "счёт",
        "общее", "теплицы", "сауны", "купели",
    }

    token_groups: dict = {}  # token_lower -> {count, total, samples:set, ids}
    for t in txs:
        desc = (t.get("description") or "").strip()
        if not desc:
            continue
        # Split by non-alphanumeric, keep words ≥ 4 chars, drop pure digits
        words = re.split(r"[^\w]+", desc, flags=re.UNICODE)
        seen_in_tx: set = set()
        for w in words:
            wl = w.lower().strip()
            if len(wl) < 4:
                continue
            if wl.isdigit():
                continue
            if wl in STOP:
                continue
            if wl in existing_patterns or any(wl in p or p in wl for p in existing_patterns):
                continue
            if wl in seen_in_tx:
                continue
            seen_in_tx.add(wl)
            g = token_groups.setdefault(
                wl, {"count": 0, "total": 0.0, "samples": [], "ids": []}
            )
            g["count"] += 1
            amt = t.get("amount_base") if t.get("amount_base") is not None else t.get("amount", 0)
            g["total"] += abs(amt or 0)
            if len(g["samples"]) < 3 and desc not in g["samples"]:
                g["samples"].append(desc)
            g["ids"].append(t["id"])

    # Need at least 2 transactions to be worth suggesting
    candidates = [
        {"pattern": tok.upper() if tok.isascii() else tok,
         "pattern_raw": tok,
         "count": g["count"],
         "total_amount": round(g["total"], 2),
         "samples": g["samples"]}
        for tok, g in token_groups.items()
        if g["count"] >= 2
    ]
    candidates.sort(key=lambda x: (-x["count"], -x["total_amount"]))
    return {"suggestions": candidates[:limit], "total_uncategorized": len(txs)}

