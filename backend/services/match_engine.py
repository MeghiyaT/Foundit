"""
Foundit — Match Engine
Finds similar items using pgvector cosine similarity via Supabase RPC.
"""

import logging
from typing import List, Optional
from database import get_supabase_client

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
        logger.error(f"Match query failed: {e}")
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


def auto_match(item_id: str, item_type: str, embedding: List[float]) -> int:
    """
    Run matching and store results. Returns number of matches found.
    """
    matches = find_matches(embedding, item_type)
    if matches:
        store_matches(item_id, item_type, matches)
    return len(matches)
