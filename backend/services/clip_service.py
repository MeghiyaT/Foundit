"""
Foundit — CLIP Service
Generates 512-dimensional image embeddings using sentence-transformers CLIP model.
Model is lazy-loaded and cached in memory after the first call.
"""

import asyncio
import logging
from io import BytesIO
from typing import List, Optional
from PIL import Image

logger = logging.getLogger(__name__)

_model = None


def _get_model():
    """Lazy-load the CLIP model once and cache it."""
    global _model
    if _model is None:
        try:
            from sentence_transformers import SentenceTransformer
            logger.info("Loading CLIP model (clip-ViT-B-32)… this may take 30s on first run.")
            _model = SentenceTransformer("clip-ViT-B-32")
            logger.info("CLIP model loaded successfully.")
        except Exception as e:
            logger.error(f"Failed to load CLIP model: {e}")
            raise RuntimeError(f"CLIP model could not be loaded: {e}")
    return _model


def _generate_embedding_sync(image_bytes: bytes) -> Optional[List[float]]:
    """Synchronous version — runs in thread pool."""
    try:
        model = _get_model()
        img = Image.open(BytesIO(image_bytes)).convert("RGB")
        embedding = model.encode(img, convert_to_numpy=True)
        return embedding.tolist()
    except Exception as e:
        logger.error(f"Embedding generation failed: {e}")
        return None


def generate_embedding(image_bytes: bytes) -> Optional[List[float]]:
    """
    Generate a 512-dimensional CLIP embedding from raw image bytes.
    This is synchronous — call from a thread executor in async contexts.
    Returns None on failure (so item is still saved without embedding).
    """
    return _generate_embedding_sync(image_bytes)

