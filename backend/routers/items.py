"""
Foundit — Items Router
CRUD for lost/found items with image upload + CLIP embedding
"""

import logging
import asyncio
from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from routers.auth import get_current_user, UserProfile
from database import get_supabase_client
from services import storage_service, clip_service, match_engine

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/items", tags=["items"])


@router.get("")
async def list_items(
    type: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(12, ge=1, le=50),
):
    """Browse paginated items with optional filters."""
    supabase = get_supabase_client()
    query = supabase.table("items").select("*")

    if type in ("lost", "found"):
        query = query.eq("type", type)
    if category:
        query = query.eq("category", category)
    if status:
        query = query.eq("status", status)
    if search:
        query = query.ilike("title", f"%{search}%")

    offset = (page - 1) * limit
    query = query.order("created_at", desc=True).range(offset, offset + limit - 1)

    result = query.execute()
    return {"items": result.data or [], "page": page, "limit": limit}


@router.get("/{item_id}")
async def get_item(item_id: str):
    """Get a single item by ID."""
    supabase = get_supabase_client()
    result = supabase.table("items").select("*").eq("id", item_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Item not found.")
    return result.data[0]


@router.post("")
async def create_item(
    type: str = Form(...),
    title: str = Form(...),
    description: str = Form(""),
    category: str = Form(""),
    location: str = Form(""),
    date_reported: str = Form(""),
    image: UploadFile = File(...),
    user: UserProfile = Depends(get_current_user),
):
    """
    Create a new lost/found item.
    1. Read image bytes ONCE upfront
    2. Upload image to Supabase Storage
    3. Generate CLIP embedding from the same bytes
    4. Store item in DB
    5. Auto-match against opposite-type items
    """
    if type not in ("lost", "found"):
        raise HTTPException(status_code=400, detail="type must be 'lost' or 'found'.")

    # Read bytes once — avoid multiple stream reads
    image_bytes = await image.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Empty image file.")

    # 1. Upload image passing raw bytes
    image_url = await storage_service.upload_image_bytes(
        image_bytes, image.content_type or "image/jpeg"
    )

    # 2. Generate CLIP embedding in a thread pool (avoids blocking event loop)
    loop = asyncio.get_event_loop()
    embedding = await loop.run_in_executor(
        None, clip_service.generate_embedding, image_bytes
    )

    # 3. Store item
    supabase = get_supabase_client()
    item_data = {
        "user_id": user.id,
        "type": type,
        "title": title,
        "description": description or None,
        "category": category or None,
        "location": location or None,
        "image_url": image_url,
        "embedding": embedding,
        "status": "open",
    }
    if date_reported:
        try:
            item_data["date_reported"] = str(date.fromisoformat(date_reported))
        except ValueError:
            pass

    result = supabase.table("items").insert(item_data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to save item.")

    new_item = result.data[0]

    # 4. Auto-match (in background — don't block the response)
    if embedding:
        try:
            n = match_engine.auto_match(new_item["id"], type, embedding)
            logger.info(f"Auto-match found {n} matches for item {new_item['id']}")
        except Exception as e:
            logger.error(f"Auto-match failed: {e}")

    return new_item


@router.put("/{item_id}/status")
async def update_status(
    item_id: str,
    status: str = Form(...),
    user: UserProfile = Depends(get_current_user),
):
    """Update item status (must be owner or admin)."""
    supabase = get_supabase_client()
    item = supabase.table("items").select("user_id").eq("id", item_id).execute()
    if not item.data:
        raise HTTPException(status_code=404, detail="Item not found.")
    if item.data[0]["user_id"] != user.id and user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized.")
    if status not in ("open", "matched", "closed"):
        raise HTTPException(status_code=400, detail="Invalid status.")

    result = supabase.table("items").update({"status": status}).eq("id", item_id).execute()
    return result.data[0]


@router.delete("/{item_id}")
async def delete_item(item_id: str, user: UserProfile = Depends(get_current_user)):
    """Delete an item (owner or admin only)."""
    supabase = get_supabase_client()
    item = supabase.table("items").select("user_id").eq("id", item_id).execute()
    if not item.data:
        raise HTTPException(status_code=404, detail="Item not found.")
    if item.data[0]["user_id"] != user.id and user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized.")

    supabase.table("items").delete().eq("id", item_id).execute()
    return {"message": "Item deleted."}
