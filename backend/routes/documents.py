from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form, Query, Body
from fastapi.responses import StreamingResponse
from typing import List, Optional
from pathlib import Path
import uuid
import os
import io
import zipfile

from database import db
from auth import get_current_user
from models import Document, DocumentCreate, DocumentFolder

router = APIRouter(prefix="/api")

UPLOADS_DIR = Path(__file__).parent.parent / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)


# ─── Folders ───────────────────────────────────────────────────────────────

@router.get("/documents/folders")
async def get_folders(current_user: dict = Depends(get_current_user)):
    folders = await db.document_folders.find(
        {"user_id": current_user["user_id"]}, {"_id": 0}
    ).sort("name", 1).to_list(200)
    return folders


@router.post("/documents/folders")
async def create_folder(
    data: dict = Body(...),
    current_user: dict = Depends(get_current_user),
):
    folder = DocumentFolder(
        name=data["name"],
        parent_id=data.get("parent_id"),
        color=data.get("color", "#6366f1"),
        user_id=current_user["user_id"],
    )
    doc = folder.model_dump()
    await db.document_folders.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/documents/folders/{folder_id}")
async def update_folder(
    folder_id: str,
    data: dict = Body(...),
    current_user: dict = Depends(get_current_user),
):
    update = {}
    if "name" in data:
        update["name"] = data["name"]
    if "color" in data:
        update["color"] = data["color"]
    if "parent_id" in data:
        update["parent_id"] = data["parent_id"]

    result = await db.document_folders.update_one(
        {"id": folder_id, "user_id": current_user["user_id"]},
        {"$set": update},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Folder not found")
    folder = await db.document_folders.find_one({"id": folder_id}, {"_id": 0})
    return folder


@router.delete("/documents/folders/{folder_id}")
async def delete_folder(folder_id: str, current_user: dict = Depends(get_current_user)):
    # Unassign documents from this folder
    await db.documents.update_many(
        {"folder_id": folder_id, "user_id": current_user["user_id"]},
        {"$set": {"folder_id": None}},
    )
    result = await db.document_folders.delete_one(
        {"id": folder_id, "user_id": current_user["user_id"]}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Folder not found")
    return {"status": "deleted"}


# ─── Documents ─────────────────────────────────────────────────────────────

@router.get("/documents", response_model=List[Document])
async def get_documents(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    type: Optional[str] = None,
    status: Optional[str] = None,
    direction_id: Optional[str] = None,
    folder_id: Optional[str] = None,
    period: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    query = {"user_id": current_user["user_id"]}

    if date_from:
        query["document_date"] = {"$gte": date_from}
    if date_to:
        if "document_date" in query:
            query["document_date"]["$lte"] = date_to
        else:
            query["document_date"] = {"$lte": date_to}
    if type:
        query["type"] = type
    if status:
        query["status"] = status
    if direction_id:
        query["direction_id"] = direction_id
    if folder_id:
        query["folder_id"] = folder_id
    if period:
        query["period"] = period

    documents = await db.documents.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return documents


@router.get("/documents/pending", response_model=List[Document])
async def get_pending_documents(current_user: dict = Depends(get_current_user)):
    documents = await db.documents.find(
        {"user_id": current_user["user_id"], "status": "pending"},
        {"_id": 0},
    ).sort("created_at", -1).to_list(100)
    return documents


@router.post("/documents/upload")
async def upload_document(
    file: UploadFile = File(...),
    document_date: Optional[str] = Form(None),
    type: str = Form("other"),
    direction_id: Optional[str] = Form(None),
    contractor_id: Optional[str] = Form(None),
    transaction_id: Optional[str] = Form(None),
    folder_id: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    current_user: dict = Depends(get_current_user),
):
    allowed_types = [".pdf", ".png", ".jpg", ".jpeg", ".xlsx", ".xls"]
    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in allowed_types:
        raise HTTPException(status_code=400, detail=f"File type {file_ext} not allowed")

    file_id = str(uuid.uuid4())
    safe_filename = f"{file_id}{file_ext}"
    file_path = UPLOADS_DIR / safe_filename

    content = await file.read()
    file_size = len(content)

    with open(file_path, "wb") as f:
        f.write(content)

    direction_name = None
    if direction_id:
        direction = await db.directions.find_one({"id": direction_id}, {"_id": 0, "name": 1})
        direction_name = direction["name"] if direction else None

    contractor_name = None
    if contractor_id:
        contractor = await db.contractors.find_one({"id": contractor_id}, {"_id": 0, "name": 1})
        contractor_name = contractor["name"] if contractor else None

    period_val = None
    if document_date:
        period_val = document_date[:7]

    status_val = "linked" if transaction_id else "pending"

    document = Document(
        document_date=document_date,
        type=type,
        file_name=file.filename,
        file_url=f"/api/documents/file/{safe_filename}",
        file_size=file_size,
        mime_type=file.content_type or "",
        transaction_id=transaction_id,
        contractor_id=contractor_id,
        contractor_name=contractor_name,
        direction_id=direction_id,
        direction_name=direction_name,
        folder_id=folder_id if folder_id and folder_id != "none" else None,
        period=period_val,
        status=status_val,
        source="manual",
        description=description,
        user_id=current_user["user_id"],
    )

    doc = document.model_dump()
    await db.documents.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("/documents/file/{filename}")
async def get_document_file(filename: str):
    file_path = UPLOADS_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    ext = os.path.splitext(filename)[1].lower()
    content_types = {
        ".pdf": "application/pdf",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ".xls": "application/vnd.ms-excel",
    }
    content_type = content_types.get(ext, "application/octet-stream")

    with open(file_path, "rb") as f:
        content = f.read()

    return StreamingResponse(
        io.BytesIO(content),
        media_type=content_type,
        headers={"Content-Disposition": f"inline; filename={filename}"},
    )


@router.put("/documents/{document_id}")
async def update_document(
    document_id: str,
    data: DocumentCreate,
    current_user: dict = Depends(get_current_user),
):
    update_data = data.model_dump(exclude_unset=True)

    if data.direction_id:
        direction = await db.directions.find_one({"id": data.direction_id}, {"_id": 0, "name": 1})
        update_data["direction_name"] = direction["name"] if direction else None

    if data.contractor_id:
        contractor = await db.contractors.find_one({"id": data.contractor_id}, {"_id": 0, "name": 1})
        update_data["contractor_name"] = contractor["name"] if contractor else None

    update_data["status"] = "linked" if data.transaction_id else "pending"

    result = await db.documents.update_one(
        {"id": document_id, "user_id": current_user["user_id"]},
        {"$set": update_data},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Document not found")

    document = await db.documents.find_one({"id": document_id}, {"_id": 0})
    return document


@router.post("/documents/{document_id}/process")
async def process_document(
    document_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Mark document as processed without linking to a transaction."""
    result = await db.documents.update_one(
        {"id": document_id, "user_id": current_user["user_id"]},
        {"$set": {"status": "processed"}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Document not found")
    document = await db.documents.find_one({"id": document_id}, {"_id": 0})
    return document


@router.post("/documents/{document_id}/move")
async def move_document_to_folder(
    document_id: str,
    data: dict = Body(...),
    current_user: dict = Depends(get_current_user),
):
    """Move document to a folder."""
    folder_id = data.get("folder_id")
    result = await db.documents.update_one(
        {"id": document_id, "user_id": current_user["user_id"]},
        {"$set": {"folder_id": folder_id}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Document not found")
    document = await db.documents.find_one({"id": document_id}, {"_id": 0})
    return document


@router.delete("/documents/{document_id}")
async def delete_document(document_id: str, current_user: dict = Depends(get_current_user)):
    document = await db.documents.find_one(
        {"id": document_id, "user_id": current_user["user_id"]},
        {"_id": 0},
    )
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    if document.get("file_url"):
        filename = document["file_url"].split("/")[-1]
        file_path = UPLOADS_DIR / filename
        if file_path.exists():
            file_path.unlink()

    await db.documents.delete_one({"id": document_id})
    return {"status": "deleted"}


@router.post("/documents/{document_id}/link-transaction")
async def link_document_to_transaction(
    document_id: str,
    transaction_id: str,
    current_user: dict = Depends(get_current_user),
):
    document = await db.documents.find_one({"id": document_id, "user_id": current_user["user_id"]}, {"_id": 0})
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    transaction = await db.transactions.find_one({"id": transaction_id, "user_id": current_user["user_id"]}, {"_id": 0})
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")

    await db.documents.update_one(
        {"id": document_id},
        {"$set": {"transaction_id": transaction_id, "status": "linked"}},
    )

    return {"status": "linked", "document_id": document_id, "transaction_id": transaction_id}


@router.delete("/documents/{document_id}/unlink")
async def unlink_document_from_transaction(
    document_id: str,
    current_user: dict = Depends(get_current_user),
):
    await db.documents.update_one(
        {"id": document_id, "user_id": current_user["user_id"]},
        {"$set": {"transaction_id": None, "status": "pending"}},
    )
    return {"status": "unlinked"}


@router.get("/transactions/{transaction_id}/documents")
async def get_transaction_documents(
    transaction_id: str,
    current_user: dict = Depends(get_current_user),
):
    documents = await db.documents.find(
        {"transaction_id": transaction_id, "user_id": current_user["user_id"]},
        {"_id": 0},
    ).to_list(100)
    return documents


@router.get("/documents/export")
async def export_documents(
    period: Optional[str] = Query(None, description="Period in YYYY-MM format. Omit for all."),
    types: Optional[str] = Query(None, description="Comma-separated document types"),
    current_user: dict = Depends(get_current_user),
):
    query: dict = {"user_id": current_user["user_id"]}

    if period:
        # Match by `period` OR by `document_date` prefix OR — if both are missing —
        # by `created_at` prefix. This makes exports robust even for AI-uploaded
        # receipts whose date couldn't be recognised.
        query["$or"] = [
            {"period": period},
            {"document_date": {"$regex": f"^{period}"}},
            {
                "period": {"$in": [None, ""]},
                "document_date": {"$in": [None, ""]},
                "created_at": {"$regex": f"^{period}"},
            },
        ]

    if types:
        type_list = types.split(",")
        query["type"] = {"$in": type_list}

    documents = await db.documents.find(query, {"_id": 0}).to_list(2000)

    if not documents:
        raise HTTPException(status_code=404, detail="No documents found for export")

    zip_buffer = io.BytesIO()

    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        for doc in documents:
            if doc.get("file_url"):
                filename = doc["file_url"].split("/")[-1]
                file_path = UPLOADS_DIR / filename

                if file_path.exists():
                    folder = "прочее"
                    if doc["type"] in ["invoice", "receipt"]:
                        folder = "расходы" if doc.get("transaction_id") else "доходы"
                    elif doc["type"] == "bank_statement":
                        folder = "выписки"
                    elif doc["type"] in ["contract", "act"]:
                        folder = "договоры"

                    archive_name = f"{folder}/{doc.get('file_name') or filename}"
                    zip_file.write(file_path, archive_name)

    zip_buffer.seek(0)

    fname_part = period or "all"
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="documents_{fname_part}.zip"'},
    )


@router.get("/documents/by-transaction/{transaction_id}", response_model=List[Document])
async def get_documents_by_transaction(
    transaction_id: str,
    current_user: dict = Depends(get_current_user),
):
    documents = await db.documents.find(
        {"user_id": current_user["user_id"], "transaction_id": transaction_id},
        {"_id": 0},
    ).to_list(100)
    return documents
