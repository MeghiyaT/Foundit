"""
Foundit — Matches Router
CLIP-based match queries and admin confirmation
"""

from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from routers.auth import get_current_user, UserProfile
from database import get_supabase_client
from routers.items import _PUBLIC_ITEM_FIELDS

router = APIRouter(prefix="/matches", tags=["matches"])

_ITEM_EMBED = f"({_PUBLIC_ITEM_FIELDS})"


@router.get("/item/{item_id}")
async def get_item_matches(item_id: UUID):
    """Get top-N AI matches for a given item."""
    supabase = get_supabase_client()

    # Fetch item type only (avoid leaking other fields)
    item_res = supabase.table("items").select("type").eq("id", item_id).execute()
    if not item_res.data:
        raise HTTPException(status_code=404, detail="Item not found.")
    item_type = item_res.data[0]["type"]

    # Fetch stored matches (nested items without embeddings)
    if item_type == "lost":
        matches_res = supabase.table("matches").select(
            f"*, found_item:items!found_item_id{_ITEM_EMBED}"
        ).eq("lost_item_id", item_id).order("similarity_score", desc=True).execute()
        return [
            {**m, "matched_item": m.get("found_item")}
            for m in (matches_res.data or [])
        ]
    else:
        matches_res = supabase.table("matches").select(
            f"*, lost_item:items!lost_item_id{_ITEM_EMBED}"
        ).eq("found_item_id", item_id).order("similarity_score", desc=True).execute()
        return [
            {**m, "matched_item": m.get("lost_item")}
            for m in (matches_res.data or [])
        ]


@router.get("/mine")
async def get_my_matches(user: UserProfile = Depends(get_current_user)):
    """Get all matches for the current user's items."""
    supabase = get_supabase_client()

    # Get user's item IDs
    user_items = supabase.table("items").select("id, type").eq("user_id", user.id).execute()
    if not user_items.data:
        return []

    lost_ids = [i["id"] for i in user_items.data if i["type"] == "lost"]
    found_ids = [i["id"] for i in user_items.data if i["type"] == "found"]

    all_matches = []

    if lost_ids:
        res = supabase.table("matches").select(
            f"*, lost_item:items!lost_item_id{_ITEM_EMBED}, found_item:items!found_item_id{_ITEM_EMBED}"
        ).in_("lost_item_id", lost_ids).order("similarity_score", desc=True).execute()
        all_matches.extend(res.data or [])

    if found_ids:
        res = supabase.table("matches").select(
            f"*, lost_item:items!lost_item_id{_ITEM_EMBED}, found_item:items!found_item_id{_ITEM_EMBED}"
        ).in_("found_item_id", found_ids).order("similarity_score", desc=True).execute()
        # Avoid duplicates
        existing_ids = {m["id"] for m in all_matches}
        all_matches.extend([m for m in (res.data or []) if m["id"] not in existing_ids])

    return all_matches


@router.post("/{match_id}/confirm")
async def confirm_match(
    match_id: UUID,
    user: UserProfile = Depends(get_current_user),
):
    """Admin confirms a pending match."""
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only.")

    supabase = get_supabase_client()
    result = supabase.table("matches").update({"status": "confirmed"}).eq("id", match_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Match not found.")

    # Update both items to 'matched'
    match = result.data[0]
    supabase.table("items").update({"status": "matched"}).eq("id", match["lost_item_id"]).execute()
    supabase.table("items").update({"status": "matched"}).eq("id", match["found_item_id"]).execute()

    return result.data[0]


@router.post("/{match_id}/reject")
async def reject_match(
    match_id: UUID,
    user: UserProfile = Depends(get_current_user),
):
    """Admin rejects a match."""
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only.")

    supabase = get_supabase_client()
    result = supabase.table("matches").update({"status": "rejected"}).eq("id", match_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Match not found.")
    return result.data[0]
