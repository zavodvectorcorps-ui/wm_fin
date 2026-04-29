"""
WM Finance — Manual triggers for Google Drive backups.
"""
from fastapi import APIRouter, Depends, HTTPException

from auth import get_current_user, require_superadmin
from services.google_drive_backup import backup_to_drive, _notify_telegram

router = APIRouter(prefix="/api")


@router.post("/admin/drive-backup/now")
async def trigger_drive_backup(
    full: bool = False,
    notify: bool = True,
    current_user: dict = Depends(require_superadmin),
):
    """Запустить бэкап в Drive прямо сейчас. ?full=true — с uploads."""
    result = await backup_to_drive(current_user["user_id"], full=full)
    if notify:
        await _notify_telegram(current_user["user_id"], result)
    if result.get("status") != "ok":
        raise HTTPException(status_code=500, detail=result.get("message"))
    return result
