"""
Foundit — Claims Router
OTP-based item claim verification
"""

import logging
from fastapi import APIRouter, Depends, HTTPException
from routers.auth import get_current_user, UserProfile
from database import get_supabase_client
from services import otp_service
from schemas.claim import ClaimCreate, ClaimVerify, ClaimResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/claims", tags=["claims"])


@router.post("", response_model=ClaimResponse)
async def initiate_claim(
    payload: ClaimCreate,
    user: UserProfile = Depends(get_current_user),
):
    """
    Initiate a claim for an item.
    1. Validate item exists and is matched
    2. Generate OTP, hash and store it
    3. Send OTP to claimant's email
    """
    supabase = get_supabase_client()

    # Validate item
    item_res = supabase.table("items").select("*").eq("id", payload.item_id).execute()
    if not item_res.data:
        raise HTTPException(status_code=404, detail="Item not found.")
    item = item_res.data[0]

    if item["status"] == "closed":
        raise HTTPException(status_code=400, detail="This item has already been claimed.")

    # Generate OTP
    otp = otp_service.generate_otp()
    otp_hash = otp_service.hash_otp(otp)
    expires_at = otp_service.otp_expires_at()

    # Store claim
    claim_data = {
        "item_id": payload.item_id,
        "claimant_id": user.id,
        "otp_hash": otp_hash,
        "otp_expires_at": expires_at.isoformat(),
        "verified": False,
    }
    result = supabase.table("claims").insert(claim_data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create claim.")

    claim = result.data[0]

    # Send OTP email
    otp_service.send_otp_email(user.email, otp, item["title"])

    return ClaimResponse(
        id=claim["id"],
        item_id=claim["item_id"],
        claimant_id=claim["claimant_id"],
        verified=False,
    )


@router.post("/{claim_id}/verify")
async def verify_claim(
    claim_id: str,
    payload: ClaimVerify,
    user: UserProfile = Depends(get_current_user),
):
    """
    Verify OTP and close the item.
    On success, item is marked 'closed'.
    """
    from datetime import datetime, timezone

    supabase = get_supabase_client()

    # Fetch claim
    claim_res = supabase.table("claims").select("*").eq("id", claim_id).execute()
    if not claim_res.data:
        raise HTTPException(status_code=404, detail="Claim not found.")
    claim = claim_res.data[0]

    if claim["claimant_id"] != user.id:
        raise HTTPException(status_code=403, detail="Not authorized.")
    if claim["verified"]:
        raise HTTPException(status_code=400, detail="Claim already verified.")

    # Check expiry and hash
    expires_at = datetime.fromisoformat(claim["otp_expires_at"])
    submitted_hash = otp_service.hash_otp(payload.otp)
    logger.info(f"OTP verify attempt — claim {claim_id}")
    logger.info(f"  Submitted OTP: {payload.otp}  hash: {submitted_hash[:12]}...")
    logger.info(f"  Stored hash:   {claim['otp_hash'][:12]}...  expires: {claim['otp_expires_at']}")
    if not otp_service.verify_otp(payload.otp, claim["otp_hash"], expires_at):
        raise HTTPException(status_code=400, detail="Invalid or expired OTP.")

    # Mark claim verified
    supabase.table("claims").update({"verified": True}).eq("id", claim_id).execute()

    # Close the item
    supabase.table("items").update({"status": "closed"}).eq("id", claim["item_id"]).execute()

    return {"message": "Claim verified. Item is now closed.", "claim_id": claim_id}
