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
