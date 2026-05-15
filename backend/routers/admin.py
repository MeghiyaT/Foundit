"""
Foundit — Admin Router
Security office dashboard endpoints
"""

from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from routers.auth import get_current_user, UserProfile
from database import get_supabase_client
from routers.claims import _claim_for_response

router = APIRouter(prefix="/admin", tags=["admin"])


def require_admin(user: UserProfile = Depends(get_current_user)) -> UserProfile:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required.")
    return user


@router.get("/items")
async def admin_list_items(
    status: Optional[str] = Query(None),
    type: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    _admin: UserProfile = Depends(require_admin),
):
    """All items with filters — admin only."""
    supabase = get_supabase_client()
    query = supabase.table("items").select("*, users(email, name, roll_no)")

    if status:
        query = query.eq("status", status)
    if type in ("lost", "found"):
        query = query.eq("type", type)

    offset = (page - 1) * limit
    query = query.order("created_at", desc=True).range(offset, offset + limit - 1)
    result = query.execute()
    return {"items": result.data or [], "page": page, "limit": limit}


@router.get("/stats")
async def admin_stats(_admin: UserProfile = Depends(require_admin)):
    """System statistics for the admin dashboard."""
    supabase = get_supabase_client()

    total_res = supabase.table("items").select("id", count="exact").execute()
    total = total_res.count or 0

    open_res = supabase.table("items").select("id", count="exact").eq("status", "open").execute()
    open_count = open_res.count or 0

    matched_res = supabase.table("items").select("id", count="exact").eq("status", "matched").execute()
    matched_count = matched_res.count or 0

    closed_res = supabase.table("items").select("id", count="exact").eq("status", "closed").execute()
    closed_count = closed_res.count or 0

    matches_total = supabase.table("matches").select("id", count="exact").execute()
    matches_count = matches_total.count or 0

    resolution_rate = round(closed_count / total * 100) if total > 0 else 0

    return {
        "total_items": total,
        "open": open_count,
        "matched": matched_count,
        "closed": closed_count,
        "total_matches": matches_count,
        "resolution_rate": resolution_rate,
    }


@router.post("/items/{item_id}/close")
async def close_item(item_id: UUID, _admin: UserProfile = Depends(require_admin)):
    """Admin closes an item manually."""
    supabase = get_supabase_client()
    result = supabase.table("items").update({"status": "closed"}).eq("id", item_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Item not found.")
    return result.data[0]


@router.delete("/items/{item_id}")
async def admin_delete_item(item_id: UUID, _admin: UserProfile = Depends(require_admin)):
    """Admin deletes any item."""
    supabase = get_supabase_client()
    supabase.table("items").delete().eq("id", item_id).execute()
    return {"message": "Deleted."}


@router.get("/claims")
async def admin_list_claims(
    status: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    _admin: UserProfile = Depends(require_admin),
):
    """List all claims with optional status filter — admin only."""
    supabase = get_supabase_client()
    query = supabase.table("claims").select("*, items(title, image_url, type), claimant:users!claimant_id(email, name), finder:users!finder_id(email, name)")

    if status:
        query = query.eq("status", status)

    offset = (page - 1) * limit
    query = query.order("created_at", desc=True).range(offset, offset + limit - 1)
    result = query.execute()

    claims = [_claim_for_response(c) for c in (result.data or [])]
    return {"claims": claims, "page": page, "limit": limit}

@router.post("/claims/{claim_id}/cancel")
async def admin_cancel_claim(
    claim_id: UUID,
    _admin: UserProfile = Depends(require_admin),
):
    """Admin cancels an approved claim, resetting it so users can re-initiate."""
    supabase = get_supabase_client()
    result = supabase.table("claims") \
        .update({"status": "rejected"}) \
        .eq("id", claim_id) \
        .in_("status", ["approved", "pending"]) \
        .execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Claim not found or already completed.")
    return {"message": "Claim cancelled.", "claim": result.data[0]}
