from fastapi import APIRouter, HTTPException, Depends
from typing import List

from database import db
from auth import get_current_user
from models import BusinessDirection, DirectionCreate

router = APIRouter(prefix="/api")


@router.get("/directions", response_model=List[BusinessDirection])
async def get_directions(current_user: dict = Depends(get_current_user)):
    directions = await db.directions.find({"user_id": current_user["user_id"], "is_active": True}, {"_id": 0}).to_list(20)
    return directions


@router.post("/directions", response_model=BusinessDirection)
async def create_direction(data: DirectionCreate, current_user: dict = Depends(get_current_user)):
    direction = BusinessDirection(**data.model_dump(), user_id=current_user["user_id"])
    await db.directions.insert_one(direction.model_dump())
    return direction


@router.put("/directions/{direction_id}", response_model=BusinessDirection)
async def update_direction(direction_id: str, data: DirectionCreate, current_user: dict = Depends(get_current_user)):
    result = await db.directions.update_one(
        {"id": direction_id, "user_id": current_user["user_id"]},
        {"$set": data.model_dump()}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Direction not found")
    direction = await db.directions.find_one({"id": direction_id}, {"_id": 0})
    return direction


@router.delete("/directions/{direction_id}")
async def delete_direction(direction_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.directions.update_one(
        {"id": direction_id, "user_id": current_user["user_id"]},
        {"$set": {"is_active": False}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Direction not found")
    return {"status": "deleted"}
