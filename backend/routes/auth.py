from fastapi import APIRouter, HTTPException, Depends
from typing import List
from datetime import datetime, timezone
import uuid

from database import db
from auth import (
    get_current_user, require_superadmin, hash_password, verify_password,
    create_token, SUPERADMIN_LOGIN, SUPERADMIN_PASSWORD, SUPERADMIN_ID
)
from models import UserCreate, UserLogin, User, AdminUserCreate, AdminUserUpdate

router = APIRouter(prefix="/api")


async def seed_user_data(user_id: str):
    directions = [
        {"id": str(uuid.uuid4()), "name": "Теплицы", "color": "blue", "description": "Производство и продажа теплиц", "is_active": True, "user_id": user_id},
        {"id": str(uuid.uuid4()), "name": "Сауны", "color": "orange", "description": "Производство и продажа саун", "is_active": True, "user_id": user_id},
        {"id": str(uuid.uuid4()), "name": "Купели", "color": "green", "description": "Производство и продажа купелей", "is_active": True, "user_id": user_id},
        {"id": str(uuid.uuid4()), "name": "Общее", "color": "gray", "description": "Общие операции бизнеса", "is_active": True, "user_id": user_id},
    ]
    await db.directions.insert_many(directions)

    income_categories = [
        {"id": str(uuid.uuid4()), "name": "Приход от клиентов", "type": "income", "group": "Выручка", "is_active": True, "user_id": user_id},
        {"id": str(uuid.uuid4()), "name": "Предоплата от клиентов", "type": "income", "group": "Выручка", "is_active": True, "user_id": user_id},
        {"id": str(uuid.uuid4()), "name": "Доплата по заказу", "type": "income", "group": "Выручка", "is_active": True, "user_id": user_id},
        {"id": str(uuid.uuid4()), "name": "Возврат от поставщика", "type": "income", "group": "Прочие доходы", "is_active": True, "user_id": user_id},
        {"id": str(uuid.uuid4()), "name": "Прочий приход", "type": "income", "group": "Прочие доходы", "is_active": True, "user_id": user_id},
    ]
    await db.categories.insert_many(income_categories)

    expense_categories = [
        {"id": str(uuid.uuid4()), "name": "Закупка материалов", "type": "expense", "group": "Себестоимость", "is_active": True, "user_id": user_id},
        {"id": str(uuid.uuid4()), "name": "Производство", "type": "expense", "group": "Себестоимость", "is_active": True, "user_id": user_id},
        {"id": str(uuid.uuid4()), "name": "Логистика/Доставка", "type": "expense", "group": "Себестоимость", "is_active": True, "user_id": user_id},
        {"id": str(uuid.uuid4()), "name": "Аренда", "type": "expense", "group": "Операционные расходы", "is_active": True, "user_id": user_id},
        {"id": str(uuid.uuid4()), "name": "Зарплата", "type": "expense", "group": "Операционные расходы", "is_active": True, "user_id": user_id},
        {"id": str(uuid.uuid4()), "name": "Реклама и маркетинг", "type": "expense", "group": "Операционные расходы", "is_active": True, "user_id": user_id},
        {"id": str(uuid.uuid4()), "name": "Связь и интернет", "type": "expense", "group": "Операционные расходы", "is_active": True, "user_id": user_id},
        {"id": str(uuid.uuid4()), "name": "Офисные расходы", "type": "expense", "group": "Операционные расходы", "is_active": True, "user_id": user_id},
        {"id": str(uuid.uuid4()), "name": "Инструменты и оборудование", "type": "expense", "group": "Операционные расходы", "is_active": True, "user_id": user_id},
        {"id": str(uuid.uuid4()), "name": "Налоги", "type": "expense", "group": "Налоги и сборы", "is_active": True, "user_id": user_id},
        {"id": str(uuid.uuid4()), "name": "Бухгалтерские услуги", "type": "expense", "group": "Налоги и сборы", "is_active": True, "user_id": user_id},
        {"id": str(uuid.uuid4()), "name": "Прочий расход", "type": "expense", "group": "Прочие расходы", "is_active": True, "user_id": user_id},
    ]
    await db.categories.insert_many(expense_categories)

    accounts = [
        {"id": str(uuid.uuid4()), "name": "Cash PL", "type": "cash", "currency": "PLN", "bank": None, "initial_balance": 0, "current_balance": 0, "is_active": True, "user_id": user_id},
        {"id": str(uuid.uuid4()), "name": "mBank PLN", "type": "checking", "currency": "PLN", "bank": "mBank", "initial_balance": 0, "current_balance": 0, "is_active": True, "user_id": user_id},
        {"id": str(uuid.uuid4()), "name": "mBank EUR", "type": "checking", "currency": "EUR", "bank": "mBank", "initial_balance": 0, "current_balance": 0, "is_active": True, "user_id": user_id},
    ]
    await db.accounts.insert_many(accounts)


@router.post("/auth/register")
async def register(data: UserCreate):
    raise HTTPException(status_code=403, detail="Регистрация отключена. Обратитесь к администратору.")


@router.post("/auth/login")
async def login(data: UserLogin):
    if data.email == SUPERADMIN_LOGIN and data.password == SUPERADMIN_PASSWORD:
        superadmin = await db.users.find_one({"id": SUPERADMIN_ID}, {"_id": 0})
        if not superadmin:
            superadmin_data = {
                "id": SUPERADMIN_ID,
                "email": "admin@wmfinance.local",
                "name": "Super Admin",
                "role": "superadmin",
                "workspace_id": SUPERADMIN_ID,
                "workspace_role": "owner",
                "created_at": datetime.now(timezone.utc).isoformat(),
                "password_hash": hash_password(SUPERADMIN_PASSWORD)
            }
            await db.users.insert_one(superadmin_data)
            await seed_user_data(SUPERADMIN_ID)
            superadmin = superadmin_data

        ws_id = superadmin.get("workspace_id") or SUPERADMIN_ID
        ws_role = superadmin.get("workspace_role") or "owner"
        token = create_token(SUPERADMIN_ID, "admin@wmfinance.local", "superadmin", ws_id, ws_role)
        return {"token": token, "user": {"id": SUPERADMIN_ID, "email": "admin@wmfinance.local", "name": "Super Admin", "role": "superadmin", "workspace_role": ws_role}}

    user = await db.users.find_one({"email": data.email}, {"_id": 0})
    if not user or not verify_password(data.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    ws_id = user.get("workspace_id") or user["id"]
    ws_role = user.get("workspace_role") or "owner"
    token = create_token(user["id"], user["email"], user["role"], ws_id, ws_role)
    return {
        "token": token,
        "user": {
            "id": user["id"],
            "email": user["email"],
            "name": user["name"],
            "role": user["role"],
            "workspace_role": ws_role,
        },
    }


@router.get("/auth/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    user = await db.users.find_one({"id": current_user["login_id"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user["workspace_role"] = current_user.get("workspace_role", "owner")
    return user


@router.get("/admin/users")
async def get_all_users(current_user: dict = Depends(require_superadmin)):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(1000)
    return users


@router.post("/admin/users")
async def create_user(data: AdminUserCreate, current_user: dict = Depends(require_superadmin)):
    existing = await db.users.find_one({"email": data.email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Email уже используется")

    user = User(email=data.email, name=data.name, role=data.role)
    user_dict = user.model_dump()
    user_dict["password_hash"] = hash_password(data.password)

    await db.users.insert_one(user_dict)
    await seed_user_data(user.id)

    return {"id": user.id, "email": user.email, "name": user.name, "role": user.role, "created_at": user.created_at}


@router.put("/admin/users/{user_id}")
async def update_user(user_id: str, data: AdminUserUpdate, current_user: dict = Depends(require_superadmin)):
    if user_id == SUPERADMIN_ID:
        raise HTTPException(status_code=403, detail="Нельзя редактировать супер-администратора")

    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    update_data = {}
    if data.email:
        existing = await db.users.find_one({"email": data.email, "id": {"$ne": user_id}}, {"_id": 0})
        if existing:
            raise HTTPException(status_code=400, detail="Email уже используется")
        update_data["email"] = data.email
    if data.name:
        update_data["name"] = data.name
    if data.role:
        update_data["role"] = data.role
    if data.password:
        update_data["password_hash"] = hash_password(data.password)

    if update_data:
        await db.users.update_one({"id": user_id}, {"$set": update_data})

    updated_user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    return updated_user


@router.delete("/admin/users/{user_id}")
async def delete_user(user_id: str, current_user: dict = Depends(require_superadmin)):
    if user_id == SUPERADMIN_ID:
        raise HTTPException(status_code=403, detail="Нельзя удалить супер-администратора")

    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    await db.users.delete_one({"id": user_id})
    return {"status": "deleted"}
