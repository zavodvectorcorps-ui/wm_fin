"""
WM Finance — Google Drive OAuth 2.0 integration.

Replaces broken Service Account uploads (service accounts don't have storage quota
since 2022). Users authenticate once with their personal Gmail; we store the
refresh_token and use it for scheduled backup uploads.

Flow:
  1. User pastes OAuth Client ID/Secret (obtained from Google Cloud Console)
  2. User clicks "Connect Google Drive" → frontend opens /api/settings/google-oauth/start
     which returns authorization_url → frontend redirects user to Google consent
  3. Google redirects back to /api/settings/google-oauth/callback with a code
  4. We exchange code → refresh_token, save in DB, redirect to frontend
"""
import logging
import os
from datetime import datetime, timezone, timedelta
from typing import Optional
from urllib.parse import urlencode

import jwt
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field

from auth import JWT_SECRET, JWT_ALGORITHM, get_current_user
from database import db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api")

OAUTH_SCOPES = ["https://www.googleapis.com/auth/drive.file"]
STATE_TTL_MINUTES = 15


# ============== Request / response models ==============

class OAuthConfigUpdate(BaseModel):
    client_id: Optional[str] = None
    client_secret: Optional[str] = None


class OAuthStartRequest(BaseModel):
    redirect_uri: str = Field(..., min_length=10)


# ============== Helpers ==============

def _build_state(user_id: str, redirect_uri: str) -> str:
    payload = {
        "user_id": user_id,
        "redirect_uri": redirect_uri,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=STATE_TTL_MINUTES),
        "nonce": os.urandom(8).hex(),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def _decode_state(state: str) -> dict:
    try:
        return jwt.decode(state, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=400, detail="OAuth state expired, please try again")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid OAuth state")


def _client_config(client_id: str, client_secret: str, redirect_uri: str) -> dict:
    return {
        "web": {
            "client_id": client_id,
            "client_secret": client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [redirect_uri],
        }
    }


async def _load_settings(user_id: str) -> dict:
    return await db.integration_settings.find_one(
        {"user_id": user_id},
        {"_id": 0}
    ) or {}


# ============== Endpoints ==============

@router.get("/settings/google-oauth/status")
async def oauth_status(current_user: dict = Depends(get_current_user)):
    s = await _load_settings(current_user["user_id"])
    return {
        "has_client_config": bool(s.get("google_oauth_client_id") and s.get("google_oauth_client_secret")),
        "connected": bool(s.get("google_drive_refresh_token")),
        "connected_email": s.get("google_drive_connected_email"),
        "connected_at": s.get("google_drive_connected_at"),
        "scopes": s.get("google_drive_scopes") or [],
    }


@router.put("/settings/google-oauth/config")
async def save_oauth_config(
    data: OAuthConfigUpdate,
    current_user: dict = Depends(get_current_user),
):
    update: dict = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if data.client_id is not None and data.client_id.strip():
        update["google_oauth_client_id"] = data.client_id.strip()
    if data.client_secret is not None and data.client_secret.strip():
        update["google_oauth_client_secret"] = data.client_secret.strip()

    if len(update) == 1:
        raise HTTPException(status_code=400, detail="Ничего не указано для сохранения")

    await db.integration_settings.update_one(
        {"user_id": current_user["user_id"]},
        {"$set": update},
        upsert=True,
    )
    return {"status": "ok"}


@router.post("/settings/google-oauth/start")
async def oauth_start(
    payload: OAuthStartRequest,
    current_user: dict = Depends(get_current_user),
):
    s = await _load_settings(current_user["user_id"])
    cid = s.get("google_oauth_client_id")
    csec = s.get("google_oauth_client_secret")
    if not cid or not csec:
        raise HTTPException(status_code=400, detail="Сначала сохраните OAuth Client ID и Client Secret")

    from google_auth_oauthlib.flow import Flow

    redirect_uri = payload.redirect_uri
    flow = Flow.from_client_config(
        _client_config(cid, csec, redirect_uri),
        scopes=OAUTH_SCOPES,
        redirect_uri=redirect_uri,
    )
    state = _build_state(current_user["user_id"], redirect_uri)
    authorization_url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
        state=state,
    )
    return {"authorization_url": authorization_url}


@router.get("/settings/google-oauth/callback")
async def oauth_callback(
    request: Request,
    code: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    error: Optional[str] = Query(None),
):
    """Google redirects user here after consent. Public endpoint, auth via state JWT."""
    frontend_base = os.environ.get("FRONTEND_BASE_URL") or str(request.base_url).rstrip("/")
    redirect_target = f"{frontend_base}/settings/integrations"

    def _back(params: dict) -> RedirectResponse:
        return RedirectResponse(f"{redirect_target}?{urlencode(params)}")

    if error:
        return _back({"drive_error": error})
    if not code or not state:
        return _back({"drive_error": "missing_code"})

    try:
        st = _decode_state(state)
    except HTTPException as e:
        return _back({"drive_error": str(e.detail)})

    user_id = st["user_id"]
    redirect_uri = st["redirect_uri"]

    s = await _load_settings(user_id)
    cid = s.get("google_oauth_client_id")
    csec = s.get("google_oauth_client_secret")
    if not cid or not csec:
        return _back({"drive_error": "client_config_missing"})

    try:
        from google_auth_oauthlib.flow import Flow
        flow = Flow.from_client_config(
            _client_config(cid, csec, redirect_uri),
            scopes=None,  # Accept whatever Google granted
            redirect_uri=redirect_uri,
        )
        flow.fetch_token(code=code)
        creds = flow.credentials

        if not creds.refresh_token:
            return _back({"drive_error": "no_refresh_token"})

        # Fetch connected email
        email = None
        try:
            from googleapiclient.discovery import build
            drive = build("drive", "v3", credentials=creds, cache_discovery=False)
            about = drive.about().get(fields="user(emailAddress)").execute()
            email = (about or {}).get("user", {}).get("emailAddress")
        except Exception as e:
            logger.warning(f"Could not fetch connected email: {e}")

        await db.integration_settings.update_one(
            {"user_id": user_id},
            {"$set": {
                "google_drive_refresh_token": creds.refresh_token,
                "google_drive_access_token": creds.token,
                "google_drive_token_expiry": creds.expiry.isoformat() if creds.expiry else None,
                "google_drive_scopes": list(creds.scopes or []),
                "google_drive_connected_email": email,
                "google_drive_connected_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }},
            upsert=True,
        )
        logger.info(f"Google Drive OAuth connected for user={user_id} email={email}")
        return _back({"drive_connected": "1"})
    except Exception as e:
        logger.exception("OAuth callback failed")
        return _back({"drive_error": str(e)[:200]})


@router.post("/settings/google-oauth/disconnect")
async def oauth_disconnect(current_user: dict = Depends(get_current_user)):
    await db.integration_settings.update_one(
        {"user_id": current_user["user_id"]},
        {"$unset": {
            "google_drive_refresh_token": "",
            "google_drive_access_token": "",
            "google_drive_token_expiry": "",
            "google_drive_scopes": "",
            "google_drive_connected_email": "",
            "google_drive_connected_at": "",
        }, "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"status": "ok"}
