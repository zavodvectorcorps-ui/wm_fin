"""
WM Finance — Workspace (multi-user) management.

A workspace is "shared scope of data". The owner's user_id is the workspace_id.
All records (transactions, accounts, contractors, ...) are filtered by user_id
which is interpreted as workspace_id since auth.get_current_user maps
JWT.workspace_id → current_user["user_id"] for transparent compatibility.

Roles within a workspace:
  - owner       — only one per workspace (user who created it). Cannot be removed.
  - admin       — full access except deleting workspace / changing owner
  - manager     — can write transactions/contractors/projects/documents/planned_payments
  - accountant  — read-only + exports
  - viewer      — read-only
"""
import logging
import secrets
from datetime import datetime, timezone, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException

from database import db
from auth import (
    get_current_user, require_workspace_admin, hash_password, verify_password,
    create_token,
)
from models import (
    WorkspaceInvite, WorkspaceInviteCreate, WorkspaceMemberRoleUpdate,
    AcceptInviteRequest, User,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api")

INVITE_TTL_DAYS = 7


def _workspace_name_for_owner(owner: dict) -> str:
    if not owner:
        return "Рабочее пространство"
    return owner.get("name") or owner.get("email") or "Рабочее пространство"


# ============== Members ==============

@router.get("/workspace/info")
async def workspace_info(current_user: dict = Depends(get_current_user)):
    """Basic info about caller's workspace."""
    ws_id = current_user["workspace_id"]
    owner = await db.users.find_one({"id": ws_id}, {"_id": 0, "password_hash": 0})
    members_count = await db.users.count_documents({"workspace_id": ws_id})
    if not members_count and owner:
        members_count = 1  # legacy users with workspace_id == id but field absent
    return {
        "workspace_id": ws_id,
        "workspace_name": _workspace_name_for_owner(owner),
        "owner": owner,
        "your_role": current_user.get("workspace_role", "owner"),
        "members_count": members_count,
    }


@router.get("/workspace/members")
async def list_members(current_user: dict = Depends(get_current_user)):
    ws_id = current_user["workspace_id"]
    rows = await db.users.find(
        {"$or": [{"workspace_id": ws_id}, {"id": ws_id}]},
        {"_id": 0, "password_hash": 0}
    ).to_list(200)
    # Ensure owner is in list (legacy users without workspace_id field)
    seen_ids = {r["id"] for r in rows}
    if ws_id not in seen_ids:
        owner = await db.users.find_one({"id": ws_id}, {"_id": 0, "password_hash": 0})
        if owner:
            owner.setdefault("workspace_role", "owner")
            owner["workspace_id"] = ws_id
            rows.insert(0, owner)
    # Normalise
    for r in rows:
        r.setdefault("workspace_role", "owner" if r["id"] == ws_id else "manager")
        r["is_owner"] = r["id"] == ws_id
    return rows


@router.put("/workspace/members/{login_id}/role")
async def change_member_role(
    login_id: str,
    data: WorkspaceMemberRoleUpdate,
    current_user: dict = Depends(require_workspace_admin),
):
    ws_id = current_user["workspace_id"]
    if login_id == ws_id:
        raise HTTPException(status_code=400, detail="Нельзя изменить роль владельца")
    member = await db.users.find_one(
        {"id": login_id, "$or": [{"workspace_id": ws_id}, {"id": ws_id}]},
        {"_id": 0}
    )
    if not member:
        raise HTTPException(status_code=404, detail="Участник не найден в этом workspace")
    await db.users.update_one(
        {"id": login_id},
        {"$set": {"workspace_role": data.workspace_role}}
    )
    return {"status": "ok"}


@router.delete("/workspace/members/{login_id}")
async def remove_member(
    login_id: str,
    current_user: dict = Depends(require_workspace_admin),
):
    ws_id = current_user["workspace_id"]
    if login_id == ws_id:
        raise HTTPException(status_code=400, detail="Нельзя удалить владельца")
    if login_id == current_user["login_id"]:
        raise HTTPException(status_code=400, detail="Нельзя удалить самого себя")
    member = await db.users.find_one({"id": login_id, "workspace_id": ws_id}, {"_id": 0})
    if not member:
        raise HTTPException(status_code=404, detail="Участник не найден")
    await db.users.delete_one({"id": login_id})
    return {"status": "ok"}


# ============== Invites ==============

@router.get("/workspace/invites")
async def list_invites(current_user: dict = Depends(require_workspace_admin)):
    ws_id = current_user["workspace_id"]
    rows = await db.workspace_invites.find(
        {"workspace_id": ws_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return rows


@router.post("/workspace/invites", response_model=WorkspaceInvite)
async def create_invite(
    data: WorkspaceInviteCreate,
    current_user: dict = Depends(require_workspace_admin),
):
    ws_id = current_user["workspace_id"]
    email_norm = data.email.strip().lower()

    # Check if user with this email already exists somewhere
    existing_user = await db.users.find_one({"email": email_norm}, {"_id": 0, "id": 1, "workspace_id": 1})
    if existing_user:
        if existing_user.get("workspace_id") == ws_id or existing_user["id"] == ws_id:
            raise HTTPException(status_code=400, detail="Пользователь уже участник этого workspace")
        raise HTTPException(status_code=400, detail="Email уже зарегистрирован в другом workspace")

    # Revoke any existing pending invite for same email + workspace
    await db.workspace_invites.delete_many({
        "workspace_id": ws_id,
        "invited_email": email_norm,
        "accepted": False,
    })

    owner = await db.users.find_one({"id": ws_id}, {"_id": 0, "name": 1, "email": 1})
    me = await db.users.find_one({"id": current_user["login_id"]}, {"_id": 0, "name": 1})

    invite = WorkspaceInvite(
        workspace_id=ws_id,
        workspace_name=_workspace_name_for_owner(owner),
        invited_email=email_norm,
        invited_name=data.name,
        role=data.role,
        token=secrets.token_urlsafe(32),
        created_by_login_id=current_user["login_id"],
        created_by_name=(me or {}).get("name"),
        expires_at=(datetime.now(timezone.utc) + timedelta(days=INVITE_TTL_DAYS)).isoformat(),
    )
    await db.workspace_invites.insert_one(invite.model_dump())
    return invite


@router.delete("/workspace/invites/{invite_id}")
async def revoke_invite(
    invite_id: str,
    current_user: dict = Depends(require_workspace_admin),
):
    ws_id = current_user["workspace_id"]
    res = await db.workspace_invites.delete_one({"id": invite_id, "workspace_id": ws_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Приглашение не найдено")
    return {"status": "ok"}


# ============== Public invite endpoints ==============

@router.get("/auth/invite-info/{token}")
async def invite_info(token: str):
    """Public: read invite info before user fills the form."""
    invite = await db.workspace_invites.find_one({"token": token}, {"_id": 0})
    if not invite:
        raise HTTPException(status_code=404, detail="Приглашение не найдено или отозвано")
    if invite.get("accepted"):
        raise HTTPException(status_code=400, detail="Приглашение уже использовано")
    try:
        exp = datetime.fromisoformat(invite["expires_at"])
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
    except Exception:
        exp = datetime.now(timezone.utc) - timedelta(seconds=1)
    if exp < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Срок приглашения истёк")
    return {
        "workspace_name": invite["workspace_name"],
        "invited_email": invite["invited_email"],
        "invited_name": invite.get("invited_name"),
        "role": invite["role"],
        "created_by_name": invite.get("created_by_name"),
    }


@router.post("/auth/accept-invite")
async def accept_invite(data: AcceptInviteRequest):
    """Public: accept invite, create user account, return auth token."""
    invite = await db.workspace_invites.find_one({"token": data.token}, {"_id": 0})
    if not invite:
        raise HTTPException(status_code=404, detail="Приглашение не найдено")
    if invite.get("accepted"):
        raise HTTPException(status_code=400, detail="Приглашение уже использовано")
    try:
        exp = datetime.fromisoformat(invite["expires_at"])
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
    except Exception:
        raise HTTPException(status_code=400, detail="Некорректный срок приглашения")
    if exp < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Срок приглашения истёк")

    if not data.password or len(data.password) < 6:
        raise HTTPException(status_code=400, detail="Пароль не короче 6 символов")
    if not data.name or not data.name.strip():
        raise HTTPException(status_code=400, detail="Укажите имя")

    # Conflict: email already exists?
    existing = await db.users.find_one({"email": invite["invited_email"]}, {"_id": 0, "id": 1})
    if existing:
        raise HTTPException(status_code=400, detail="Пользователь с таким email уже существует")

    user = User(
        email=invite["invited_email"],
        name=data.name.strip(),
        role="user",
        workspace_id=invite["workspace_id"],
        workspace_role=invite["role"],
    )
    user_dict = user.model_dump()
    user_dict["password_hash"] = hash_password(data.password)
    await db.users.insert_one(user_dict)

    # Mark invite as accepted
    await db.workspace_invites.update_one(
        {"id": invite["id"]},
        {"$set": {
            "accepted": True,
            "accepted_at": datetime.now(timezone.utc).isoformat(),
            "accepted_by_login_id": user.id,
        }}
    )

    token = create_token(
        user.id, user.email, "user",
        workspace_id=invite["workspace_id"],
        workspace_role=invite["role"],
    )
    return {
        "token": token,
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "role": "user",
            "workspace_role": invite["role"],
        },
        "workspace_name": invite["workspace_name"],
    }


# ============== Migration ==============

async def migrate_users_to_workspaces():
    """Backfill workspace_id / workspace_role for legacy users that don't have them.
    Each existing user becomes the owner of their own workspace (workspace_id = id).
    Idempotent — safe to call on every startup.
    """
    cursor = db.users.find(
        {"$or": [{"workspace_id": {"$exists": False}}, {"workspace_id": None}]},
        {"_id": 0, "id": 1}
    )
    migrated = 0
    async for u in cursor:
        await db.users.update_one(
            {"id": u["id"]},
            {"$set": {
                "workspace_id": u["id"],
                "workspace_role": "owner",
            }}
        )
        migrated += 1
    if migrated:
        logger.info(f"Workspace migration: {migrated} legacy users updated")
    return migrated
