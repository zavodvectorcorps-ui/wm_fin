"""
MongoDB index initialization.

Called once on app startup. Idempotent — MongoDB skips creation if an
equivalent index already exists. Adds compound indexes for the highest-traffic
queries so pagination, filtering and aggregation stay fast as data grows.
"""

import logging

logger = logging.getLogger(__name__)


async def ensure_indexes(db) -> None:
    """Create / verify all collection indexes used by hot queries."""
    plans: list[tuple[str, list, dict]] = [
        # transactions ------------------------------------------------------
        # Hot: list with pagination sorted by date desc.
        ("transactions", [("user_id", 1), ("date", -1), ("created_at", -1)], {}),
        # Hot: status filter (fact/planned), needs_review queue.
        ("transactions", [("user_id", 1), ("status", 1), ("date", -1)], {}),
        # Hot: filter by account or counter-account (transfers).
        ("transactions", [("user_id", 1), ("account_id", 1), ("date", -1)], {}),
        ("transactions", [("user_id", 1), ("to_account_id", 1), ("date", -1)], {}),
        # Hot: analytics by category / direction.
        ("transactions", [("user_id", 1), ("category_id", 1), ("date", -1)], {}),
        ("transactions", [("user_id", 1), ("direction_id", 1), ("date", -1)], {}),
        # Hot: text search on description.
        ("transactions", [("user_id", 1), ("description", 1)], {}),
        # Lookups by external id (telegram, sheets, recurring).
        ("transactions", [("id", 1)], {"unique": True}),

        # accounts ----------------------------------------------------------
        ("accounts", [("user_id", 1), ("is_active", 1)], {}),
        ("accounts", [("user_id", 1), ("is_loan", 1)], {}),
        ("accounts", [("id", 1)], {"unique": True}),

        # documents ---------------------------------------------------------
        ("documents", [("user_id", 1), ("status", 1), ("created_at", -1)], {}),
        ("documents", [("user_id", 1), ("transaction_id", 1)], {}),
        ("documents", [("user_id", 1), ("period", 1)], {}),
        ("documents", [("user_id", 1), ("folder_id", 1)], {}),
        ("documents", [("user_id", 1), ("type", 1), ("document_date", -1)], {}),

        # categories / contractors / folders --------------------------------
        ("categories", [("user_id", 1), ("type", 1), ("is_active", 1)], {}),
        ("contractors", [("user_id", 1), ("name", 1)], {}),
        ("document_folders", [("user_id", 1)], {}),
        ("directions", [("user_id", 1)], {}),

        # planned payments / salaries / recurring ---------------------------
        ("planned_payments", [("user_id", 1), ("status", 1), ("date", 1)], {}),
        ("salary_accruals", [("user_id", 1), ("month", -1)], {}),
        ("recurring_expenses", [("user_id", 1), ("is_active", 1)], {}),

        # auto-rules --------------------------------------------------------
        ("auto_rules", [("user_id", 1), ("is_active", 1), ("priority", -1)], {}),
    ]

    created = 0
    skipped = 0
    failed = 0
    for coll, keys, opts in plans:
        try:
            await db[coll].create_index(keys, **opts)
            created += 1
        except Exception as e:
            # create_index is idempotent but may fail on conflicting unique constraints
            failed += 1
            logger.warning(f"Index on {coll} {keys} failed: {e}")
    logger.info(f"Indexes: ensured={created} skipped={skipped} failed={failed}")
