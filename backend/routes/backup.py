"""
WM Finance — Резервное копирование БД через HTTP.

Endpoints:
  GET  /api/admin/db/export  — скачать архив всех коллекций (tar.gz)
  POST /api/admin/db/import  — восстановить БД из архива
"""

import io
import json
import tarfile
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse

from auth import require_superadmin
from database import db

router = APIRouter(prefix="/api/admin/db")


class MongoEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, ObjectId):
            return {"$oid": str(obj)}
        if isinstance(obj, datetime):
            return {"$date": obj.isoformat()}
        return super().default(obj)


def _restore_types(obj):
    if isinstance(obj, dict):
        if "$oid" in obj and len(obj) == 1:
            return ObjectId(obj["$oid"])
        if "$date" in obj and len(obj) == 1:
            try:
                return datetime.fromisoformat(obj["$date"].replace("Z", "+00:00"))
            except Exception:
                return obj["$date"]
        return {k: _restore_types(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_restore_types(item) for item in obj]
    return obj


@router.get("/export")
async def export_database(_: dict = Depends(require_superadmin)):
    """Экспортирует все коллекции БД в tar.gz архив и отдаёт файлом."""
    collections = await db.list_collection_names()

    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w:gz") as tar:
        meta = {
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "db_name": db.name,
            "collections": sorted(collections),
        }
        meta_bytes = json.dumps(meta, ensure_ascii=False, indent=2).encode("utf-8")
        info = tarfile.TarInfo(name="wmfinance-db-export/_meta.json")
        info.size = len(meta_bytes)
        tar.addfile(info, io.BytesIO(meta_bytes))

        for col_name in sorted(collections):
            docs = await db[col_name].find().to_list(length=None)
            data = json.dumps(docs, cls=MongoEncoder, ensure_ascii=False).encode("utf-8")
            info = tarfile.TarInfo(name=f"wmfinance-db-export/{col_name}.json")
            info.size = len(data)
            tar.addfile(info, io.BytesIO(data))

    buffer.seek(0)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    filename = f"wmfinance-db-{timestamp}.tar.gz"
    return StreamingResponse(
        buffer,
        media_type="application/gzip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/import")
async def import_database(
    file: UploadFile = File(...),
    _: dict = Depends(require_superadmin),
):
    """Восстанавливает БД из tar.gz архива (DROP & REPLACE всех коллекций в архиве)."""
    if not file.filename.endswith((".tar.gz", ".tgz")):
        raise HTTPException(status_code=400, detail="Ожидается файл tar.gz")

    content = await file.read()
    buffer = io.BytesIO(content)

    try:
        tar = tarfile.open(fileobj=buffer, mode="r:gz")
    except tarfile.ReadError:
        raise HTTPException(status_code=400, detail="Не удалось прочитать архив")

    imported = {}
    try:
        for member in tar.getmembers():
            if not member.isfile() or not member.name.endswith(".json"):
                continue
            name = member.name.rsplit("/", 1)[-1]
            if name.startswith("_"):
                continue
            col_name = name[:-5]

            fobj = tar.extractfile(member)
            if fobj is None:
                continue
            raw = fobj.read()
            try:
                docs = json.loads(raw.decode("utf-8"))
            except json.JSONDecodeError:
                continue

            if not isinstance(docs, list) or not docs:
                imported[col_name] = 0
                continue

            restored = [_restore_types(d) for d in docs]

            await db[col_name].drop()
            await db[col_name].insert_many(restored)
            imported[col_name] = len(restored)
    finally:
        tar.close()

    return {
        "status": "ok",
        "imported": imported,
        "total_documents": sum(imported.values()),
    }


@router.get("/stats")
async def database_stats(_: dict = Depends(require_superadmin)):
    """Количество документов в каждой коллекции (для превью перед экспортом)."""
    collections = await db.list_collection_names()
    stats = {}
    total = 0
    for col_name in sorted(collections):
        count = await db[col_name].count_documents({})
        stats[col_name] = count
        total += count
    return {
        "db_name": db.name,
        "collections": stats,
        "total_documents": total,
    }
