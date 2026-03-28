"""Exchange rate service — fetches EUR/PLN from NBP API with manual override."""
from fastapi import APIRouter, Depends
from datetime import datetime, timezone
import logging
import httpx

from database import db
from auth import get_current_user

router = APIRouter(prefix="/api")
logger = logging.getLogger(__name__)

NBP_EUR_URL = "https://api.nbp.pl/api/exchangerates/rates/a/eur/last/"


async def get_nbp_rate() -> float:
    """Fetch current EUR/PLN rate from NBP."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(NBP_EUR_URL, headers={"Accept": "application/json"})
            if resp.status_code == 200:
                data = resp.json()
                rate = data["rates"][0]["mid"]
                return round(float(rate), 4)
    except Exception as e:
        logger.error(f"NBP API error: {e}")
    return 0


@router.get("/exchange-rate")
async def get_exchange_rate(current_user: dict = Depends(get_current_user)):
    """Get current EUR/PLN rate (manual override or NBP)."""
    settings = await db.integration_settings.find_one(
        {"user_id": current_user["user_id"]},
        {"_id": 0},
    )

    manual_rate = None
    if settings:
        manual_rate = settings.get("manual_eur_pln_rate")

    nbp_rate = await get_nbp_rate()

    effective_rate = manual_rate if manual_rate else nbp_rate

    return {
        "eur_pln": effective_rate,
        "nbp_rate": nbp_rate,
        "manual_rate": manual_rate,
        "source": "manual" if manual_rate else "nbp",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }


@router.put("/exchange-rate")
async def set_exchange_rate(
    data: dict,
    current_user: dict = Depends(get_current_user),
):
    """Set manual EUR/PLN rate override. Pass null to use NBP auto."""
    rate = data.get("manual_rate")

    if rate is not None:
        rate = round(float(rate), 4)

    await db.integration_settings.update_one(
        {"user_id": current_user["user_id"]},
        {"$set": {"manual_eur_pln_rate": rate}},
        upsert=True,
    )

    return {"status": "saved", "manual_rate": rate}
