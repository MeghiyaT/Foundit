"""
Foundit — Embedding Service
Generates text embeddings using HuggingFace Inference API (BAAI/bge-small-en-v1.5).
The 384-dim embeddings are zero-padded to 512 dims to match the existing
pgvector column, preserving cosine similarity.

Items are embedded by combining their title, description, category, and location
into a rich text representation, which is then vectorized for similarity search.
"""

import logging
import os
from typing import List, Optional

import httpx

logger = logging.getLogger(__name__)

HF_MODEL = "BAAI/bge-small-en-v1.5"
HF_API_URL = f"https://router.huggingface.co/hf-inference/models/{HF_MODEL}"
HF_EMBEDDING_DIM = 384
DB_EMBEDDING_DIM = 384  # pgvector column is 384-dim (migration 006)


def _build_item_text(title: str, description: str = "", category: str = "", location: str = "") -> str:
    """
    Build a rich text representation of an item for embedding.
    Combines all available metadata into a single searchable string.
    """
    parts = []
    if title:
        parts.append(title)
    if description:
        parts.append(description)
    if category:
        parts.append(category)
    if location:
        parts.append(f"near {location}")
    return " ".join(parts).strip()


def generate_text_embedding(text: str) -> Optional[List[float]]:
    """
    Generate a 384-dimensional embedding from text using HuggingFace API.
    The model outputs 384 dims — directly compatible with the DB column.
    Returns None on failure (so item is still saved without embedding).
    """
    from config import get_settings
    hf_token = get_settings().HUGGINGFACE_API_KEY

    if not hf_token:
        logger.error("HUGGINGFACE_API_KEY is missing! Set it in environment variables.")
        return None

    if not text or not text.strip():
        logger.warning("Empty text provided for embedding.")
        return None

    try:
        headers = {
            "Authorization": f"Bearer {hf_token}",
            "Content-Type": "application/json",
        }
        payload = {"inputs": text}

        response = httpx.post(HF_API_URL, headers=headers, json=payload, timeout=25.0)

        if response.status_code == 200:
            data = response.json()
            # HF returns a flat list of floats for single input
            if isinstance(data, list) and len(data) > 0:
                raw_embedding = None
                if isinstance(data[0], (float, int)):
                    raw_embedding = data
                elif isinstance(data[0], list):
                    raw_embedding = data[0]
                
                if raw_embedding is not None:
                    # Verify embedding dimension matches expected HF output
                    if len(raw_embedding) != HF_EMBEDDING_DIM:
                        logger.error(f"Embedding dimension mismatch: got {len(raw_embedding)}, expected {HF_EMBEDDING_DIM}")
                        return None
                    
                    # Zero-pad to 512 dimensions for the database
                    padded_embedding = raw_embedding + [0.0] * (512 - len(raw_embedding))
                    logger.info(f"Embedding generated and padded: {len(padded_embedding)} dims for text '{text[:50]}...'")
                    return padded_embedding
            logger.error(f"HF API unexpected response format: {type(data)}")
            return None
        elif response.status_code == 503:
            # Model is loading — retry once after a short wait
            logger.warning("HF model is loading, retrying in 5s...")
            import time
            time.sleep(5)
            response = httpx.post(HF_API_URL, headers=headers, json=payload, timeout=30.0)
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list) and len(data) > 0:
                    raw_embedding = None
                    if isinstance(data[0], (float, int)):
                        raw_embedding = data
                    elif isinstance(data[0], list):
                        raw_embedding = data[0]
                    if raw_embedding is not None:
                        if len(raw_embedding) != HF_EMBEDDING_DIM:
                            logger.error(f"Embedding dimension mismatch: got {len(raw_embedding)}, expected {HF_EMBEDDING_DIM}")
                            return None
                        padded_embedding = raw_embedding + [0.0] * (512 - len(raw_embedding))
                        return padded_embedding
            logger.error(f"HF API retry failed: {response.status_code}")
            return None
        else:
            logger.error(f"HF API error: {response.status_code} - {response.text[:200]}")
            return None
    except Exception as e:
        logger.error(f"HF API exception: {e}")
        return None


def generate_embedding(
    image_bytes: bytes = None,
    title: str = "",
    description: str = "",
    category: str = "",
    location: str = "",
) -> Optional[List[float]]:
    """
    Generate embedding for an item.
    Uses text-based embedding from item metadata (title, description, category, location).
    Image bytes parameter is kept for backward compatibility but not used.
    """
    text = _build_item_text(title, description, category, location)
    if not text:
        logger.warning("No text metadata available for embedding.")
        return None
    return generate_text_embedding(text)
