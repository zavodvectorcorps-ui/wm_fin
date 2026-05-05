from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
import os
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

JWT_SECRET = os.environ.get('JWT_SECRET', 'wmfinance_secret')
JWT_ALGORITHM = "HS256"

# Superadmin credentials - defaults ensure login always works
_DEFAULT_ADMIN = "admin"
_DEFAULT_PASS = "220066mm"
_DEFAULT_ID = "superadmin-wmfinance-001"
SUPERADMIN_LOGIN = os.environ.get('SUPERADMIN_LOGIN') or _DEFAULT_ADMIN
SUPERADMIN_PASSWORD = os.environ.get('SUPERADMIN_PASSWORD') or _DEFAULT_PASS
SUPERADMIN_ID = os.environ.get('SUPERADMIN_ID') or _DEFAULT_ID

security = HTTPBearer()


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


def create_token(
    user_id: str,
    email: str,
    role: str,
    workspace_id: str = None,
    workspace_role: str = "owner",
) -> str:
    """Generate JWT.

    JWT carries:
      - login_id: actual user account (for invites/admin lookup)
      - workspace_id: scope of data access (records are filtered by this)
      - role: system role (superadmin / user / demo)
      - workspace_role: owner / admin / accountant / manager / viewer
    """
    payload = {
        "user_id": user_id,            # legacy compat: equals login_id
        "login_id": user_id,
        "workspace_id": workspace_id or user_id,
        "email": email,
        "role": role,
        "workspace_role": workspace_role,
        "exp": datetime.now(timezone.utc) + timedelta(days=30),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

    login_id = payload.get("login_id") or payload.get("user_id")
    workspace_id = payload.get("workspace_id") or login_id
    return {
        # IMPORTANT: user_id is the workspace scope (legacy field name) — all DB
        # filters use this. login_id is the actual logged-in user account.
        "user_id": workspace_id,
        "login_id": login_id,
        "workspace_id": workspace_id,
        "email": payload.get("email"),
        "role": payload.get("role"),
        "workspace_role": payload.get("workspace_role", "owner"),
    }


async def require_superadmin(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "superadmin":
        raise HTTPException(status_code=403, detail="Только для супер-администратора")
    return current_user


async def require_workspace_admin(current_user: dict = Depends(get_current_user)):
    """Owner or admin within the workspace, or system superadmin."""
    if current_user.get("role") == "superadmin":
        return current_user
    if current_user.get("workspace_role") in ("owner", "admin"):
        return current_user
    raise HTTPException(status_code=403, detail="Требуется роль владельца или администратора рабочего пространства")
