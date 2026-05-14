"""
Foundit — Match Engine
Finds similar items using pgvector cosine similarity via Supabase RPC.
"""

import logging
from typing import List, Optional
from database import get_supabase_client
from services.email_service import notify_match_found

logger = logging.getLogger(__name__)

SIMILARITY_THRESHOLD = 0.72
MATCH_LIMIT = 5


def find_matches(
    embedding: List[float],
    item_type: str,
    threshold: float = SIMILARITY_THRESHOLD,
    limit: int = MATCH_LIMIT,
) -> List[dict]:
    """
    Query Supabase for items of the opposite type that visually match
    the given embedding. Uses the match_items PostgreSQL function.
    """
    # Match against OPPOSITE type
    opposite = "found" if item_type == "lost" else "lost"
    supabase = get_supabase_client()

    try:
        result = supabase.rpc(
            "match_items",
            {
                "query_embedding": embedding,
                "match_type": opposite,
                "match_threshold": threshold,
                "match_count": limit,
            },
        ).execute()
        return result.data or []
    except Exception as e:
        logger.error(f"Match query failed: {e}. Falling back to local python matching.")
        # Fallback to local python matching
        try:
            items_res = supabase.table("items").select("id, title, description, category, image_url, location, date_reported, user_id, embedding").eq("type", opposite).eq("status", "open").execute()
            if not items_res.data:
                return []
            
            import json
            matches = []
            for item in items_res.data:
                item_emb = item.get("embedding")
                if not item_emb: continue
                if isinstance(item_emb, str):
                    item_emb = json.loads(item_emb)
                
                # Compute cosine similarity
                dot = sum(a * b for a, b in zip(embedding, item_emb))
                norm_a = sum(a * a for a in embedding) ** 0.5
                norm_b = sum(b * b for b in item_emb) ** 0.5
                if norm_a == 0 or norm_b == 0: continue
                sim = dot / (norm_a * norm_b)
                
                if sim > threshold:
                    item_copy = dict(item)
                    del item_copy["embedding"]
                    item_copy["similarity"] = sim
                    matches.append(item_copy)
            
            matches.sort(key=lambda x: x["similarity"], reverse=True)
            return matches[:limit]
        except Exception as fallback_e:
            logger.error(f"Fallback matching failed: {fallback_e}")
            return []


def store_matches(item_id: str, item_type: str, matches: List[dict]) -> None:
    """
    Persist AI-generated matches to the matches table.
    Avoids duplicates by checking existing records.
    """
    supabase = get_supabase_client()

    for match in matches:
        matched_id = match["id"]
        if item_type == "lost":
            lost_id, found_id = item_id, matched_id
        else:
            lost_id, found_id = matched_id, item_id

        # Check for existing match
        existing = (
            supabase.table("matches")
            .select("id")
            .eq("lost_item_id", lost_id)
            .eq("found_item_id", found_id)
            .execute()
        )
        if existing.data:
            continue

        supabase.table("matches").insert({
            "lost_item_id": lost_id,
            "found_item_id": found_id,
            "similarity_score": match["similarity"],
            "status": "pending",
        }).execute()

        # Mark both items as 'matched'
        supabase.table("items").update({"status": "matched"}).eq("id", lost_id).execute()
        supabase.table("items").update({"status": "matched"}).eq("id", found_id).execute()

        # Notify both owners by email
        try:
            lost_res = supabase.table("items").select("title, user_id").eq("id", lost_id).execute()
            found_res = supabase.table("items").select("title, user_id").eq("id", found_id).execute()
            if lost_res.data and found_res.data:
                lost_item = lost_res.data[0]
                found_item = found_res.data[0]
                sim_pct = int(match["similarity"] * 100)

                # Get owner emails
                user_ids = list({lost_item["user_id"], found_item["user_id"]})
                users_res = supabase.table("users").select("id, email").in_("id", user_ids).execute()
                users_map = {u["id"]: u["email"] for u in (users_res.data or [])}

                # Notify lost item owner
                lost_owner_email = users_map.get(lost_item["user_id"])
                if lost_owner_email:
                    notify_match_found(
                        owner_email=lost_owner_email,
                        owner_item_title=lost_item["title"],
                        matched_item_title=found_item["title"],
                        similarity_pct=sim_pct,
                        item_id=lost_id,
                    )

                # Notify found item reporter
                found_owner_email = users_map.get(found_item["user_id"])
                if found_owner_email and found_owner_email != lost_owner_email:
                    notify_match_found(
                        owner_email=found_owner_email,
                        owner_item_title=found_item["title"],
                        matched_item_title=lost_item["title"],
                        similarity_pct=sim_pct,
                        item_id=found_id,
                    )
        except Exception as email_err:
            logger.warning("Match email notification failed: %s", email_err)


def auto_match(item_id: str, item_type: str, embedding: List[float]) -> int:
    """
    Run matching and store results. Returns number of matches found.
    """
    matches = find_matches(embedding, item_type)
    if matches:
        store_matches(item_id, item_type, matches)
    return len(matches)
