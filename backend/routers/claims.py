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
"""

import logging
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

from eth_hash.auto import keccak as eth_keccak
from fastapi import APIRouter, Depends, HTTPException
from routers.auth import get_current_user, UserProfile
from database import get_supabase_client
from schemas.claim import ClaimCreate, ClaimComplete, ClaimResponse
from services.email_service import (
    notify_claim_initiated,
    notify_claim_approved,
    notify_claim_completed,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/claims", tags=["claims"])

CLAIM_EXPIRY_HOURS = 1


def _claim_for_response(row: dict) -> dict:
    """Strip server-only fields from claim JSON."""
    out = dict(row)
    out.pop("secret_hash", None)
    return out


def _generate_secret() -> str:
    """Generate a 6-character alphanumeric secret code."""
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # No ambiguous chars (0/O, 1/I)
    return "".join(secrets.choice(alphabet) for _ in range(6))


def _hash_secret(secret: str) -> str:
    """
    keccak256 hash of the uppercased secret — mirrors the on-chain hashing in
    HandoverRegistry.completeClaim which computes:
        secretHashProof == keccak256(abi.encodePacked(rawSecret.toUpperCase()))

    Using the same algorithm ensures the backend's off-chain verification is
    consistent with the smart contract's on-chain check.
    """
    encoded = secret.upper().encode("utf-8")
    return eth_keccak(encoded).hex()


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

    if item.get("user_id") != user.id:
        raise HTTPException(
            status_code=403,
            detail="Only the item owner can initiate a claim for this item.",
        )

    if payload.finder_id == user.id:
        raise HTTPException(
            status_code=400,
            detail="Finder must be a different user than the item owner.",
        )

    if item["status"] == "closed":
        raise HTTPException(status_code=400, detail="This item has already been claimed.")

    finder_row = supabase.table("users").select("id").eq("id", payload.finder_id).limit(1).execute()
    if not finder_row.data:
        raise HTTPException(status_code=400, detail="Invalid finder user.")

    # 2. Check no active claim already exists for this item
    existing = supabase.table("claims").select("id") \
        .eq("item_id", payload.item_id) \
        .in_("status", ["pending", "approved"]) \
        .execute()
    if existing.data:
        raise HTTPException(status_code=400, detail="An active claim already exists for this item.")

    # 3. Generate secret code
    now = datetime.now(tz=timezone.utc)
    secret = _generate_secret()
    secret_hash = _hash_secret(secret)
    expires_at = now + timedelta(hours=CLAIM_EXPIRY_HOURS)

    # 4. Store claim
    claim_data = {
        "item_id": str(payload.item_id),
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

    # Notify admin(s) by email
    try:
        admins = supabase.table("users").select("email").eq("role", "admin").execute()
        for admin in (admins.data or []):
            notify_claim_initiated(
                admin_email=admin["email"],
                item_title=item["title"],
                owner_email=user.email,
                claim_id=str(claim["id"]),
            )
    except Exception as email_err:
        logger.warning("Claim initiated email failed: %s", email_err)

    return ClaimResponse(
        id=str(claim["id"]),
        item_id=str(claim["item_id"]),
        claimant_id=claim["claimant_id"],
        finder_id=claim.get("finder_id"),
        status="pending",
        secret_code=secret,  # Only returned once to the owner!
        expires_at=expires_at,
        owner_wallet=payload.owner_wallet,
    )


@router.get("/{claim_id}")
async def get_claim(
    claim_id: UUID,
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

    return _claim_for_response(claim)


@router.get("/item/{item_id}")
async def get_item_claims(
    item_id: UUID,
    user: UserProfile = Depends(get_current_user),
):
    """List claims for an item: item owner and admin see all; finder sees only their rows."""
    supabase = get_supabase_client()

    item_res = supabase.table("items").select("id, user_id").eq("id", item_id).execute()
    if not item_res.data:
        raise HTTPException(status_code=404, detail="Item not found.")
    item_owner_id = item_res.data[0].get("user_id")

    claims_res = supabase.table("claims").select("*") \
        .eq("item_id", item_id) \
        .order("created_at", desc=True) \
        .execute()
    rows = claims_res.data or []

    if user.role == "admin" or item_owner_id == user.id:
        return {"claims": [_claim_for_response(c) for c in rows]}

    finder_rows = [c for c in rows if c.get("finder_id") == user.id]
    if not finder_rows:
        raise HTTPException(status_code=403, detail="Not authorized to view claims for this item.")

    return {"claims": [_claim_for_response(c) for c in finder_rows]}


@router.post("/{claim_id}/approve")
async def approve_claim(
    claim_id: UUID,
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

    # Notify finder by email
    try:
        finder_id = claim.get("finder_id")
        if finder_id:
            finder_res = supabase.table("users").select("email").eq("id", finder_id).execute()
            if finder_res.data:
                item_res2 = supabase.table("items").select("title").eq("id", claim["item_id"]).execute()
                item_title = item_res2.data[0]["title"] if item_res2.data else "your item"
                notify_claim_approved(
                    finder_email=finder_res.data[0]["email"],
                    item_title=item_title,
                    claim_id=str(claim_id),
                )
    except Exception as email_err:
        logger.warning("Claim approved email failed: %s", email_err)

    return {"message": "Claim approved.", "claim_id": claim_id, "expires_at": new_expiry.isoformat()}


@router.post("/{claim_id}/reject")
async def reject_claim(
    claim_id: UUID,
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

    # Only pending claims can be rejected — mirrors the smart contract guard.
    # Approved claims may only expire naturally; rejecting an approved claim
    # after the finder has been shown the secret would be an admin rug-pull.
    if claim["status"] != "pending":
        raise HTTPException(
            status_code=400,
            detail=(
                f"Cannot reject a {claim['status']} claim. "
                "Only pending claims can be rejected."
            ),
        )

    supabase.table("claims").update({"status": "rejected"}).eq("id", claim_id).execute()

    logger.info(f"Claim {claim_id} rejected by admin {user.id}")
    return {"message": "Claim rejected.", "claim_id": claim_id}


@router.post("/{claim_id}/complete")
async def complete_claim(
    claim_id: UUID,
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
    tx = payload.tx_hash or "offchain"
    supabase.table("claims").update({
        "status": "completed",
        "verified": True,
        "tx_hash": tx,
        "finder_wallet": payload.finder_wallet,
        "reward_amount": reward,
        "nft_tx_hash": tx,  # Legacy field
    }).eq("id", claim_id).execute()

    # Close the item — it will disappear from the public feed
    supabase.table("items").update({"status": "closed"}).eq("id", claim["item_id"]).execute()

    # Store finder's wallet address on user profile if not set
    user_res = supabase.table("users").select("wallet_address").eq("id", user.id).execute()
    if user_res.data and not user_res.data[0].get("wallet_address"):
        supabase.table("users").update({"wallet_address": payload.finder_wallet}).eq("id", user.id).execute()

    logger.info(f"Claim {claim_id} completed. Finder {user.id} awarded {reward} FNDT. Tx: {payload.tx_hash or 'offchain'}")

    # Notify item owner by email
    try:
        owner_id = claim.get("claimant_id")
        if owner_id:
            owner_res = supabase.table("users").select("email").eq("id", owner_id).execute()
            if owner_res.data:
                item_res2 = supabase.table("items").select("title").eq("id", claim["item_id"]).execute()
                item_title = item_res2.data[0]["title"] if item_res2.data else "your item"
                notify_claim_completed(
                    owner_email=owner_res.data[0]["email"],
                    item_title=item_title,
                    finder_name=user.name or user.email.split("@")[0],
                    reward_amount=reward,
                )
    except Exception as email_err:
        logger.warning("Claim completed email failed: %s", email_err)

    return {
        "message": "Claim completed! Item has been marked as resolved.",
        "claim_id": claim_id,
        "reward_amount": reward,
        "tx_hash": payload.tx_hash or "offchain",
    }