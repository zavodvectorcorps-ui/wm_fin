from fastapi import APIRouter, Depends
from datetime import datetime, timezone

from database import db
from auth import get_current_user

router = APIRouter(prefix="/api")


@router.get("/notifications")
async def get_notifications(current_user: dict = Depends(get_current_user)):
    notifications = []

    overdue_payments = await db.planned_payments.find(
        {"user_id": current_user["user_id"], "status": "overdue"},
        {"_id": 0}
    ).to_list(100)

    if overdue_payments:
        notifications.append({
            "id": "overdue_payments",
            "type": "overdue_payment",
            "title": f"Просроченные платежи: {len(overdue_payments)}",
            "message": f"У вас {len(overdue_payments)} просроченных платежей на сумму {sum(p['amount'] for p in overdue_payments):,.2f} PLN",
            "is_read": False,
            "link": "/planning/calendar",
            "created_at": datetime.now(timezone.utc).isoformat()
        })

    pending_docs = await db.documents.count_documents(
        {"user_id": current_user["user_id"], "status": "pending"}
    )

    if pending_docs > 0:
        notifications.append({
            "id": "pending_docs",
            "type": "document_pending",
            "title": f"Документы без привязки: {pending_docs}",
            "message": f"{pending_docs} документов требуют обработки",
            "is_read": False,
            "link": "/documents?status=pending",
            "created_at": datetime.now(timezone.utc).isoformat()
        })

    accounts = await db.accounts.find(
        {"user_id": current_user["user_id"], "is_active": True},
        {"_id": 0}
    ).to_list(100)

    for account in accounts:
        if account.get("current_balance", 0) < 0:
            notifications.append({
                "id": f"low_balance_{account['id']}",
                "type": "low_balance",
                "title": f"Отрицательный баланс: {account['name']}",
                "message": f"Баланс счёта {account['name']}: {account['current_balance']:,.2f} {account['currency']}",
                "is_read": False,
                "link": "/settings",
                "created_at": datetime.now(timezone.utc).isoformat()
            })

    stored = await db.notifications.find(
        {"user_id": current_user["user_id"]},
        {"_id": 0}
    ).sort("created_at", -1).to_list(50)

    notifications.extend(stored)

    return {
        "notifications": notifications,
        "unread_count": len([n for n in notifications if not n.get("is_read", False)])
    }


@router.put("/notifications/{notification_id}/read")
async def mark_notification_read(notification_id: str, current_user: dict = Depends(get_current_user)):
    await db.notifications.update_one(
        {"id": notification_id, "user_id": current_user["user_id"]},
        {"$set": {"is_read": True}}
    )
    return {"status": "ok"}
