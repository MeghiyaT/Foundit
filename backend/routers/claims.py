"""
Foundit — Claims Router
Blockchain-based item claim with admin approval gate

Flow:
  1. Owner initiates claim → secret code generated → stored as hash
  2. Admin approves claim after verifying legitimacy
  3. Finder submits secret code + blockchain tx hash → claim completed → item closed

Anti-scam:
  - Admin must approve before completion (prevents token farming)
  - Secret code shared in person (prevents remote fraud)
  - 1-hour expiry on claims
  - Minimum 24-hour item age before claiming
  - Rate limiting: max 2 claims per user per month
"""

import logging
import secrets
import hashlib
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from routers.auth import get_current_user, UserProfile
from database import get_supabase_client
from schemas.claim import ClaimCreate, ClaimComplete, ClaimResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/claims", tags=["claims"])

CLAIM_EXPIRY_HOURS = 1
MIN_ITEM_AGE_HOURS = 24
MAX_CLAIMS_PER_MONTH = 2


def _generate_secret() -> str:
    """Generate a 6-character alphanumeric secret code."""
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # No ambiguous chars (0/O, 1/I)
    return "".join(secrets.choice(alphabet) for _ in range(6))


def _hash_secret(secret: str) -> str:
    """SHA-256 hash of the secret code."""
    return hashlib.sha256(secret.upper().encode()).hexdigest()


@router.post("", response_model=ClaimResponse)
async def initiate_claim(
    payload: ClaimCreate,
    user: UserProfile = Depends(get_current_user),
):
    """
    Owner initiates a claim for an item.
    Returns a secret code that must be shared with the finder IN PERSON.
    """
    supabase = get_supabase_client()

    # 1. Validate item exists and is claimable
    item_res = supabase.table("items").select("*").eq("id", payload.item_id).execute()
    if not item_res.data:
        raise HTTPException(status_code=404, detail="Item not found.")
    item = item_res.data[0]

    if item["status"] == "closed":
        raise HTTPException(status_code=400, detail="This item has already been claimed.")

    # 2. Check minimum item age (24 hours)
    created_at = datetime.fromisoformat(item["created_at"].replace("Z", "+00:00"))
    now = datetime.now(tz=timezone.utc)
    age_hours = (now - created_at).total_seconds() / 3600
    if age_hours < MIN_ITEM_AGE_HOURS:
        remaining = round(MIN_ITEM_AGE_HOURS - age_hours, 1)
        raise HTTPException(
            status_code=400,
            detail=f"Items must be posted for at least 24 hours before claiming. {remaining}h remaining.",
        )

    # 3. Rate limit: max claims per month (as owner/claimant)
    month_ago = (now - timedelta(days=30)).isoformat()
    owner_claims = supabase.table("claims").select("id", count="exact") \
        .eq("claimant_id", user.id) \
        .gte("created_at", month_ago) \
        .in_("status", ["pending", "approved", "completed"]) \
        .execute()
    if (owner_claims.count or 0) >= MAX_CLAIMS_PER_MONTH:
        raise HTTPException(
            status_code=429,
            detail=f"You can only initiate {MAX_CLAIMS_PER_MONTH} claims per month.",
        )

    # 4. Check no active claim already exists for this item
    existing = supabase.table("claims").select("id") \
        .eq("item_id", payload.item_id) \
        .in_("status", ["pending", "approved"]) \
        .execute()
    if existing.data:
        raise HTTPException(status_code=400, detail="An active claim already exists for this item.")

    # 5. Generate secret code
    secret = _generate_secret()
    secret_hash = _hash_secret(secret)
    expires_at = now + timedelta(hours=CLAIM_EXPIRY_HOURS)

    # 6. Store claim
    claim_data = {
        "item_id": payload.item_id,
        "claimant_id": user.id,
        "finder_id": payload.finder_id,
        "secret_hash": secret_hash,
        "status": "pending",
        "expires_at": expires_at.isoformat(),
        "owner_wallet": payload.owner_wallet,
        "verified": False,
    }
    result = supabase.table("claims").insert(claim_data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create claim.")

    claim = result.data[0]
    logger.info(f"Claim initiated: {claim['id']} for item {payload.item_id} by {user.id}")

    return ClaimResponse(
        id=claim["id"],
        item_id=claim["item_id"],
        claimant_id=claim["claimant_id"],
        finder_id=claim.get("finder_id"),
        status="pending",
        secret_code=secret,  # Only returned once to the owner!
        expires_at=expires_at,
        owner_wallet=payload.owner_wallet,
    )


@router.get("/{claim_id}")
async def get_claim(
    claim_id: str,
    user: UserProfile = Depends(get_current_user),
):
    """Get claim status. Accessible by owner, finder, or admin."""
    supabase = get_supabase_client()

    claim_res = supabase.table("claims").select("*").eq("id", claim_id).execute()
    if not claim_res.data:
        raise HTTPException(status_code=404, detail="Claim not found.")
    claim = claim_res.data[0]

    # Only owner, finder, or admin can view
    if claim["claimant_id"] != user.id and claim.get("finder_id") != user.id and user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized.")

    # Check if expired
    if claim["status"] in ("pending", "approved") and claim.get("expires_at"):
        expires = datetime.fromisoformat(claim["expires_at"].replace("Z", "+00:00"))
        if datetime.now(tz=timezone.utc) > expires:
            supabase.table("claims").update({"status": "expired"}).eq("id", claim_id).execute()
            claim["status"] = "expired"

    return claim


@router.get("/item/{item_id}")
async def get_item_claims(
    item_id: str,
    user: UserProfile = Depends(get_current_user),
):
    """Get all claims for a specific item."""
    supabase = get_supabase_client()

    claims_res = supabase.table("claims").select("*") \
        .eq("item_id", item_id) \
        .order("created_at", desc=True) \
        .execute()

    return {"claims": claims_res.data or []}


@router.post("/{claim_id}/approve")
async def approve_claim(
    claim_id: str,
    user: UserProfile = Depends(get_current_user),
):
    """Admin approves a pending claim after verifying legitimacy."""
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required.")

    supabase = get_supabase_client()

    claim_res = supabase.table("claims").select("*").eq("id", claim_id).execute()
    if not claim_res.data:
        raise HTTPException(status_code=404, detail="Claim not found.")
    claim = claim_res.data[0]

    if claim["status"] != "pending":
        raise HTTPException(status_code=400, detail=f"Claim is {claim['status']}, not pending.")

    # Check expiry
    if claim.get("expires_at"):
        expires = datetime.fromisoformat(claim["expires_at"].replace("Z", "+00:00"))
        if datetime.now(tz=timezone.utc) > expires:
            supabase.table("claims").update({"status": "expired"}).eq("id", claim_id).execute()
            raise HTTPException(status_code=400, detail="Claim has expired.")

    # Approve and extend expiry by another hour
    new_expiry = datetime.now(tz=timezone.utc) + timedelta(hours=CLAIM_EXPIRY_HOURS)
    supabase.table("claims").update({
        "status": "approved",
        "expires_at": new_expiry.isoformat(),
    }).eq("id", claim_id).execute()

    logger.info(f"Claim {claim_id} approved by admin {user.id}")
    return {"message": "Claim approved.", "claim_id": claim_id, "expires_at": new_expiry.isoformat()}


@router.post("/{claim_id}/reject")
async def reject_claim(
    claim_id: str,
    user: UserProfile = Depends(get_current_user),
):
    """Admin rejects a suspicious claim."""
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required.")

    supabase = get_supabase_client()

    claim_res = supabase.table("claims").select("*").eq("id", claim_id).execute()
    if not claim_res.data:
        raise HTTPException(status_code=404, detail="Claim not found.")
    claim = claim_res.data[0]

    if claim["status"] not in ("pending", "approved"):
        raise HTTPException(status_code=400, detail=f"Cannot reject a {claim['status']} claim.")

    supabase.table("claims").update({"status": "rejected"}).eq("id", claim_id).execute()

    logger.info(f"Claim {claim_id} rejected by admin {user.id}")
    return {"message": "Claim rejected.", "claim_id": claim_id}


@router.post("/{claim_id}/complete")
async def complete_claim(
    claim_id: str,
    payload: ClaimComplete,
    user: UserProfile = Depends(get_current_user),
):
    """
    Finder completes the claim by providing the secret code and blockchain tx hash.
    On success, item status is set to 'closed' (disappears from public feed).
    """
    supabase = get_supabase_client()

    # Fetch claim
    claim_res = supabase.table("claims").select("*").eq("id", claim_id).execute()
    if not claim_res.data:
        raise HTTPException(status_code=404, detail="Claim not found.")
    claim = claim_res.data[0]

    # Validate: must be the designated finder
    if claim.get("finder_id") != user.id:
        raise HTTPException(status_code=403, detail="Only the designated finder can complete this claim.")

    # Must be approved by admin
    if claim["status"] != "approved":
        if claim["status"] == "pending":
            raise HTTPException(status_code=400, detail="Claim is still awaiting admin approval.")
        raise HTTPException(status_code=400, detail=f"Claim is {claim['status']}.")

    # Check expiry
    if claim.get("expires_at"):
        expires = datetime.fromisoformat(claim["expires_at"].replace("Z", "+00:00"))
        if datetime.now(tz=timezone.utc) > expires:
            supabase.table("claims").update({"status": "expired"}).eq("id", claim_id).execute()
            raise HTTPException(status_code=400, detail="Claim has expired. Please initiate a new claim.")

    # Verify secret code
    submitted_hash = _hash_secret(payload.secret_code)
    if submitted_hash != claim["secret_hash"]:
        logger.warning(f"Invalid secret code for claim {claim_id}")
        raise HTTPException(status_code=400, detail="Invalid secret code.")

    # Calculate diminishing reward
    finder_claims = supabase.table("claims").select("id", count="exact") \
        .eq("finder_id", user.id) \
        .eq("status", "completed") \
        .execute()
    past_count = finder_claims.count or 0

    reward_tiers = [10, 8, 5, 3, 1]
    reward = reward_tiers[min(past_count, len(reward_tiers) - 1)]

    # Mark claim completed
    supabase.table("claims").update({
        "status": "completed",
        "verified": True,
        "tx_hash": payload.tx_hash,
        "finder_wallet": payload.finder_wallet,
        "reward_amount": reward,
        "nft_tx_hash": payload.tx_hash,  # Legacy field
    }).eq("id", claim_id).execute()

    # Close the item — it will disappear from the public feed
    supabase.table("items").update({"status": "closed"}).eq("id", claim["item_id"]).execute()

    # Store finder's wallet address on user profile if not set
    user_res = supabase.table("users").select("wallet_address").eq("id", user.id).execute()
    if user_res.data and not user_res.data[0].get("wallet_address"):
        supabase.table("users").update({"wallet_address": payload.finder_wallet}).eq("id", user.id).execute()

    logger.info(f"Claim {claim_id} completed. Finder {user.id} awarded {reward} FNDT. Tx: {payload.tx_hash}")

    return {
        "message": "Claim completed! Item has been marked as resolved.",
        "claim_id": claim_id,
        "reward_amount": reward,
        "tx_hash": payload.tx_hash,
    }
