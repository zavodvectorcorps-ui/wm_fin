from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional

from database import db
from auth import get_current_user
from models import Category, CategoryCreate

router = APIRouter(prefix="/api")


@router.get("/categories", response_model=List[Category])
async def get_categories(
    type: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {"user_id": current_user["user_id"], "is_active": True}
    if type:
        query["type"] = type
    categories = await db.categories.find(query, {"_id": 0}).to_list(200)
    return categories


@router.post("/categories", response_model=Category)
async def create_category(data: CategoryCreate, current_user: dict = Depends(get_current_user)):
    category = Category(**data.model_dump(), user_id=current_user["user_id"])
    await db.categories.insert_one(category.model_dump())
    return category


@router.put("/categories/{category_id}", response_model=Category)
async def update_category(category_id: str, data: CategoryCreate, current_user: dict = Depends(get_current_user)):
    result = await db.categories.update_one(
        {"id": category_id, "user_id": current_user["user_id"]},
        {"$set": data.model_dump()}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Category not found")
    category = await db.categories.find_one({"id": category_id}, {"_id": 0})
    return category


@router.delete("/categories/{category_id}")
async def delete_category(category_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.categories.update_one(
        {"id": category_id, "user_id": current_user["user_id"]},
        {"$set": {"is_active": False}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Category not found")
    return {"status": "deleted"}
