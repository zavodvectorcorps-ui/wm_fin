"""
WM Finance - Auth Routes
"""
from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import bcrypt
import jwt
import uuid
from datetime import datetime, timezone, timedelta
import os

from models import (
    UserCreate, UserLogin, User, AdminUserCreate, AdminUserUpdate,
    SUPERADMIN_LOGIN, SUPERADMIN_PASSWORD, SUPERADMIN_ID
)
from services.database import db

router = APIRouter(prefix="/auth", tags=["auth"])
security = HTTPBearer()

JWT_SECRET = os.environ.get('JWT_SECRET', 'wmfinance-secret-key-2026')
JWT_ALGORITHM = "HS256"

# ============== AUTH HELPERS ==============

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())

def create_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "user_id": user_id,
        "email": email,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(days=30)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

# ============== SEED DATA ==============

async def seed_user_data(user_id: str):
    """Create default data for new user"""
    # Business Directions
    directions = [
        {"id": str(uuid.uuid4()), "name": "Теплицы", "color": "blue", "description": "Производство и продажа теплиц", "is_active": True, "user_id": user_id},
        {"id": str(uuid.uuid4()), "name": "Сауны", "color": "orange", "description": "Производство и продажа саун", "is_active": True, "user_id": user_id},
        {"id": str(uuid.uuid4()), "name": "Купели", "color": "green", "description": "Производство и продажа купелей", "is_active": True, "user_id": user_id},
        {"id": str(uuid.uuid4()), "name": "Общее", "color": "gray", "description": "Общие операции бизнеса", "is_active": True, "user_id": user_id},
    ]
    await db.directions.insert_many(directions)
    
    # Income Categories
    income_categories = [
        {"id": str(uuid.uuid4()), "name": "Приход от клиентов", "type": "income", "group": "Выручка", "is_active": True, "user_id": user_id},
        {"id": str(uuid.uuid4()), "name": "Предоплата от клиентов", "type": "income", "group": "Выручка", "is_active": True, "user_id": user_id},
        {"id": str(uuid.uuid4()), "name": "Доплата по заказу", "type": "income", "group": "Выручка", "is_active": True, "user_id": user_id},
        {"id": str(uuid.uuid4()), "name": "Возврат от поставщика", "type": "income", "group": "Прочие доходы", "is_active": True, "user_id": user_id},
        {"id": str(uuid.uuid4()), "name": "Прочий приход", "type": "income", "group": "Прочие доходы", "is_active": True, "user_id": user_id},
    ]
    await db.categories.insert_many(income_categories)
    
    # Expense Categories
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
    
    # Default Accounts
    accounts = [
        {"id": str(uuid.uuid4()), "name": "Cash PL", "type": "cash", "currency": "PLN", "bank": None, "initial_balance": 0, "current_balance": 0, "is_active": True, "user_id": user_id},
        {"id": str(uuid.uuid4()), "name": "mBank PLN", "type": "checking", "currency": "PLN", "bank": "mBank", "initial_balance": 0, "current_balance": 0, "is_active": True, "user_id": user_id},
        {"id": str(uuid.uuid4()), "name": "mBank EUR", "type": "checking", "currency": "EUR", "bank": "mBank", "initial_balance": 0, "current_balance": 0, "is_active": True, "user_id": user_id},
    ]
    await db.accounts.insert_many(accounts)

# ============== AUTH ROUTES ==============

@router.post("/register")
async def register(data: UserCreate):
    """Registration is disabled. Use admin panel to create users."""
    raise HTTPException(status_code=403, detail="Регистрация отключена. Обратитесь к администратору.")

@router.post("/login")
async def login(data: UserLogin):
    # Check for superadmin login
    if data.email == SUPERADMIN_LOGIN and data.password == SUPERADMIN_PASSWORD:
        # Ensure superadmin exists in DB
        superadmin = await db.users.find_one({"id": SUPERADMIN_ID}, {"_id": 0})
        if not superadmin:
            # Create superadmin user
            superadmin_data = {
                "id": SUPERADMIN_ID,
                "email": "admin@wmfinance.local",
                "name": "Super Admin",
                "role": "superadmin",
                "created_at": datetime.now(timezone.utc).isoformat(),
                "password_hash": hash_password(SUPERADMIN_PASSWORD)
            }
            await db.users.insert_one(superadmin_data)
            await seed_user_data(SUPERADMIN_ID)
            superadmin = superadmin_data
        
        token = create_token(SUPERADMIN_ID, "admin@wmfinance.local", "superadmin")
        return {"token": token, "user": {"id": SUPERADMIN_ID, "email": "admin@wmfinance.local", "name": "Super Admin", "role": "superadmin"}}
    
    # Regular email-based login
    user = await db.users.find_one({"email": data.email}, {"_id": 0})
    if not user or not verify_password(data.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    token = create_token(user["id"], user["email"], user["role"])
    return {"token": token, "user": {"id": user["id"], "email": user["email"], "name": user["name"], "role": user["role"]}}

@router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    user = await db.users.find_one({"id": current_user["user_id"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user
