"""
Foundit — Messages Router
Direct messaging between users for item claims
"""

import logging
from fastapi import APIRouter, Depends, HTTPException
from routers.auth import get_current_user, UserProfile
from database import get_supabase_client
from schemas.message import MessageCreate, MessageResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/messages", tags=["messages"])


@router.post("", response_model=MessageResponse)
async def send_message(
    payload: MessageCreate,
    user: UserProfile = Depends(get_current_user),
):
    """
    Send a message to another user about an item.
    """
    supabase = get_supabase_client()

    # Validate item exists
    item_res = supabase.table("items").select("id, title, user_id").eq("id", payload.item_id).execute()
    if not item_res.data:
        raise HTTPException(status_code=404, detail="Item not found.")

    # Prevent messaging yourself
    if payload.receiver_id == user.id:
        raise HTTPException(status_code=400, detail="You cannot message yourself.")

    if not payload.content.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    msg_data = {
        "item_id": payload.item_id,
        "sender_id": user.id,
        "receiver_id": payload.receiver_id,
        "content": payload.content.strip()[:1000],  # cap at 1000 chars
    }

    result = supabase.table("messages").insert(msg_data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to send message.")

    msg = result.data[0]

    return MessageResponse(
        id=msg["id"],
        item_id=msg["item_id"],
        sender_id=msg["sender_id"],
        receiver_id=msg["receiver_id"],
        content=msg["content"],
        created_at=msg.get("created_at"),
    )


@router.get("/conversations")
async def get_conversations(
    user: UserProfile = Depends(get_current_user),
):
    """
    Get all conversations for the current user, grouped by item.
    Returns latest message for each unique (item_id, other_user) pair.
    """
    supabase = get_supabase_client()

    # Get all messages where user is sender or receiver
    sent = supabase.table("messages").select("*").eq("sender_id", user.id).order("created_at", desc=True).execute()
    received = supabase.table("messages").select("*").eq("receiver_id", user.id).order("created_at", desc=True).execute()

    all_msgs = (sent.data or []) + (received.data or [])
    all_msgs.sort(key=lambda m: m["created_at"], reverse=True)

    # Group by (item_id, other_user_id) and pick latest
    seen = set()
    conversations = []
    for msg in all_msgs:
        other = msg["receiver_id"] if msg["sender_id"] == user.id else msg["sender_id"]
        key = (msg["item_id"], other)
        if key not in seen:
            seen.add(key)
            conversations.append({**msg, "other_user_id": other})

    # Enrich with item titles and user emails
    item_ids = list({c["item_id"] for c in conversations})
    user_ids = list({c["other_user_id"] for c in conversations})

    items_map = {}
    if item_ids:
        items_res = supabase.table("items").select("id, title, image_url").in_("id", item_ids).execute()
        items_map = {i["id"]: i for i in (items_res.data or [])}

    users_map = {}
    if user_ids:
        users_res = supabase.table("users").select("id, email, name").in_("id", user_ids).execute()
        users_map = {u["id"]: u for u in (users_res.data or [])}

    for c in conversations:
        item_info = items_map.get(c["item_id"], {})
        user_info = users_map.get(c["other_user_id"], {})
        c["item_title"] = item_info.get("title", "Unknown item")
        c["item_image_url"] = item_info.get("image_url")
        c["other_user_email"] = user_info.get("email", "Unknown")
        c["other_user_name"] = user_info.get("name")

    return {"conversations": conversations}


@router.get("/thread/{item_id}/{other_user_id}")
async def get_thread(
    item_id: str,
    other_user_id: str,
    user: UserProfile = Depends(get_current_user),
):
    """
    Get full message thread between current user and another user about a specific item.
    """
    supabase = get_supabase_client()

    # Messages sent by me to them about this item
    sent = supabase.table("messages") \
        .select("*") \
        .eq("item_id", item_id) \
        .eq("sender_id", user.id) \
        .eq("receiver_id", other_user_id) \
        .execute()

    # Messages sent by them to me about this item
    received = supabase.table("messages") \
        .select("*") \
        .eq("item_id", item_id) \
        .eq("sender_id", other_user_id) \
        .eq("receiver_id", user.id) \
        .execute()

    all_msgs = (sent.data or []) + (received.data or [])
    all_msgs.sort(key=lambda m: m["created_at"])

    # Get item and user info
    item_res = supabase.table("items").select("id, title, image_url, type, status, user_id").eq("id", item_id).execute()
    user_res = supabase.table("users").select("id, email, name").eq("id", other_user_id).execute()

    return {
        "messages": all_msgs,
        "item": item_res.data[0] if item_res.data else None,
        "other_user": user_res.data[0] if user_res.data else None,
    }
