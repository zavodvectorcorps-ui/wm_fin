"""
WM Finance — автоматический бэкап в Google Drive.

Использует тот же Service Account JSON, что и Google Sheets интеграция.
Создаёт архив (БД + uploads), загружает в папку "WM Finance Backups" в Drive,
удаляет архивы старше 7 дней.

Шедулер:
  - Ежедневно в 03:00 UTC: только БД (быстро)
  - Еженедельно по воскресеньям в 03:30 UTC: полный (БД + uploads)
"""

import io
import json
import logging
import os
import tarfile
from datetime import datetime, timezone, timedelta
from typing import Optional, Tuple

from bson import ObjectId

from database import db

logger = logging.getLogger(__name__)

DRIVE_FOLDER_NAME = "WM Finance Backups"
RETENTION_DAYS = 7


# ============== Mongo serialization (то же, что в backup.py) ==============

class MongoEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, ObjectId):
            return {"$oid": str(obj)}
        if isinstance(obj, datetime):
            return {"$date": obj.isoformat()}
        return super().default(obj)


async def _build_db_archive(include_uploads: bool = False) -> Tuple[bytes, str]:
    """Создать tar.gz архив со всеми коллекциями БД (+ uploads если нужно)."""
    collections = await db.list_collection_names()
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    suffix = "full" if include_uploads else "db"
    filename = f"wmfinance-{suffix}-{timestamp}.tar.gz"

    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w:gz") as tar:
        # Meta
        meta = {
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "db_name": db.name,
            "type": suffix,
            "collections": sorted(collections),
        }
        meta_bytes = json.dumps(meta, ensure_ascii=False, indent=2).encode("utf-8")
        info = tarfile.TarInfo(name="wmfinance-export/_meta.json")
        info.size = len(meta_bytes)
        tar.addfile(info, io.BytesIO(meta_bytes))

        # Collections
        for col_name in sorted(collections):
            docs = await db[col_name].find().to_list(length=None)
            data = json.dumps(docs, cls=MongoEncoder, ensure_ascii=False).encode("utf-8")
            info = tarfile.TarInfo(name=f"wmfinance-export/db/{col_name}.json")
            info.size = len(data)
            tar.addfile(info, io.BytesIO(data))

        # Uploads (если запрошено)
        if include_uploads:
            uploads_path = os.environ.get("UPLOADS_DIR", "/app/uploads")
            if os.path.isdir(uploads_path):
                tar.add(uploads_path, arcname="wmfinance-export/uploads")

    buffer.seek(0)
    return buffer.getvalue(), filename


# ============== Google Drive helpers ==============

def _get_drive_service(settings: dict):
    """Build an authenticated Drive client.

    Preferred: OAuth 2.0 with user's refresh_token (google_drive_refresh_token in
    integration_settings). Falls back to Service Account only for read-only
    scenarios — uploads via SA will fail because service accounts have no storage
    quota (since 2022). Raises RuntimeError if no working auth is available.
    """
    from googleapiclient.discovery import build

    refresh_token = settings.get("google_drive_refresh_token")
    client_id = settings.get("google_oauth_client_id")
    client_secret = settings.get("google_oauth_client_secret")

    if refresh_token and client_id and client_secret:
        from google.oauth2.credentials import Credentials
        from google.auth.transport.requests import Request as GoogleRequest

        creds = Credentials(
            token=settings.get("google_drive_access_token"),
            refresh_token=refresh_token,
            token_uri="https://oauth2.googleapis.com/token",
            client_id=client_id,
            client_secret=client_secret,
            scopes=settings.get("google_drive_scopes") or ["https://www.googleapis.com/auth/drive.file"],
        )
        if not creds.valid:
            creds.refresh(GoogleRequest())
        return build("drive", "v3", credentials=creds, cache_discovery=False)

    raise RuntimeError(
        "Google Drive не подключён. Откройте Интеграции → Google Drive и нажмите "
        "«Подключить Google Drive» (OAuth)."
    )


def _ensure_folder(service, folder_name: str = DRIVE_FOLDER_NAME) -> str:
    """Найти или создать папку в Drive. Возвращает folder_id."""
    query = (
        f"name='{folder_name}' and "
        f"mimeType='application/vnd.google-apps.folder' and trashed=false"
    )
    res = service.files().list(q=query, fields="files(id, name)").execute()
    files = res.get("files", [])
    if files:
        return files[0]["id"]

    body = {"name": folder_name, "mimeType": "application/vnd.google-apps.folder"}
    folder = service.files().create(body=body, fields="id").execute()
    return folder["id"]


def _upload_file(service, folder_id: str, filename: str, content: bytes) -> dict:
    """Загрузить файл в указанную папку Drive."""
    from googleapiclient.http import MediaIoBaseUpload

    media = MediaIoBaseUpload(
        io.BytesIO(content),
        mimetype="application/gzip",
        resumable=False,
    )
    body = {"name": filename, "parents": [folder_id]}
    return service.files().create(
        body=body,
        media_body=media,
        fields="id, name, size, webViewLink"
    ).execute()


def _cleanup_old(service, folder_id: str, days: int = RETENTION_DAYS) -> int:
    """Удалить файлы в папке старше N дней. Возвращает количество удалённых."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    cutoff_str = cutoff.strftime("%Y-%m-%dT%H:%M:%S")

    query = f"'{folder_id}' in parents and trashed=false and createdTime < '{cutoff_str}'"
    res = service.files().list(q=query, fields="files(id, name, createdTime)").execute()
    deleted = 0
    for f in res.get("files", []):
        try:
            service.files().delete(fileId=f["id"]).execute()
            deleted += 1
        except Exception as e:
            logger.warning(f"Could not delete {f['name']}: {e}")
    return deleted


# ============== Main backup function ==============

async def backup_to_drive(user_id: str, full: bool = False) -> dict:
    """
    Сделать бэкап и залить в Drive.
    full=False — только БД (быстро). full=True — БД + uploads.
    """
    settings = await db.integration_settings.find_one(
        {"user_id": user_id},
        {"_id": 0}
    ) or {}

    # OAuth must be configured
    if not settings.get("google_drive_refresh_token"):
        return {"status": "error", "message": "Google Drive не подключён (OAuth). Откройте Интеграции → Google Drive."}
    if not (settings.get("google_oauth_client_id") and settings.get("google_oauth_client_secret")):
        return {"status": "error", "message": "Не заданы OAuth Client ID / Client Secret"}

    try:
        # Build archive
        content, filename = await _build_db_archive(include_uploads=full)
        size_mb = len(content) / (1024 * 1024)

        # Upload
        service = _get_drive_service(settings)
        folder_id = _ensure_folder(service)
        uploaded = _upload_file(service, folder_id, filename, content)

        # Cleanup
        deleted = _cleanup_old(service, folder_id, RETENTION_DAYS)

        return {
            "status": "ok",
            "filename": filename,
            "size_mb": round(size_mb, 2),
            "drive_file_id": uploaded["id"],
            "drive_link": uploaded.get("webViewLink"),
            "old_files_deleted": deleted,
            "type": "full" if full else "db",
        }
    except Exception as e:
        logger.error(f"Drive backup failed: {e}")
        return {"status": "error", "message": str(e)}


# ============== Telegram notification ==============

async def _notify_telegram(user_id: str, result: dict):
    """Отправить уведомление об успехе/провале в Telegram."""
    settings = await db.integration_settings.find_one(
        {"user_id": user_id},
        {"_id": 0, "telegram_bot_token": 1, "telegram_chat_id": 1}
    )
    if not settings or not settings.get("telegram_bot_token") or not settings.get("telegram_chat_id"):
        return

    if result.get("status") == "ok":
        kind = "полный (БД + uploads)" if result.get("type") == "full" else "БД"
        text = (
            f"✅ *Бэкап в Google Drive*\n\n"
            f"Тип: {kind}\n"
            f"Файл: `{result['filename']}`\n"
            f"Размер: {result['size_mb']} MB\n"
            f"Старых архивов удалено: {result.get('old_files_deleted', 0)}\n"
            f"\n[Открыть в Drive]({result.get('drive_link', '')})"
        )
    else:
        text = (
            f"❌ *Бэкап в Google Drive провалился*\n\n"
            f"Ошибка: `{result.get('message', 'unknown')}`"
        )

    import httpx
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            await client.post(
                f"https://api.telegram.org/bot{settings['telegram_bot_token']}/sendMessage",
                json={
                    "chat_id": settings["telegram_chat_id"],
                    "text": text,
                    "parse_mode": "Markdown",
                    "disable_web_page_preview": True,
                }
            )
    except Exception as e:
        logger.error(f"Telegram notification failed: {e}")


# ============== Scheduler entry points ==============

async def scheduled_drive_backup_db():
    """Ежедневно в 03:00 UTC: только БД."""
    users = await db.integration_settings.distinct(
        "user_id",
        {"google_drive_refresh_token": {"$ne": None}}
    )
    for user_id in users:
        try:
            result = await backup_to_drive(user_id, full=False)
            await _notify_telegram(user_id, result)
            logger.info(f"Drive DB backup for {user_id}: {result.get('status')}")
        except Exception as e:
            logger.error(f"Drive DB backup error for {user_id}: {e}")


async def scheduled_drive_backup_full():
    """Еженедельно в воскресенье 03:30 UTC: полный (БД + uploads)."""
    users = await db.integration_settings.distinct(
        "user_id",
        {"google_drive_refresh_token": {"$ne": None}}
    )
    for user_id in users:
        try:
            result = await backup_to_drive(user_id, full=True)
            await _notify_telegram(user_id, result)
            logger.info(f"Drive FULL backup for {user_id}: {result.get('status')}")
        except Exception as e:
            logger.error(f"Drive FULL backup error for {user_id}: {e}")
