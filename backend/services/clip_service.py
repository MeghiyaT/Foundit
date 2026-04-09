"""
Foundit — CLIP Service
Generates 512-dimensional image embeddings using sentence-transformers CLIP model.
Model is lazy-loaded and cached in memory after the first call.
"""

import asyncio
import logging
import os
import httpx
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
    """Synchronous version — runs in thread pool or uses HF api."""
    hf_token = os.environ.get("HUGGINGFACE_API_KEY")
    
    if hf_token:
        # Avoid local RAM usage, use HuggingFace Serverless Inference API
        try:
            logger.info("Generating embedding via HuggingFace Inference API...")
            api_url = "https://api-inference.huggingface.co/models/sentence-transformers/clip-ViT-B-32"
            headers = {"Authorization": f"Bearer {hf_token}"}
            # HF API often accepts direct bytes for vision models or base64 for multimodal
            import base64
            b64_image = base64.b64encode(image_bytes).decode('utf-8')
            payload = {"inputs": {"image": b64_image}}
            
            # Using httpx synchronously since we are in a ThreadPoolExecutor
            response = httpx.post(api_url, headers=headers, json=payload, timeout=25.0)
            
            if response.status_code == 200:
                data = response.json()
                # HF can return [ [0.1, 0.2...] ] or dict depends on the model
                if isinstance(data, list) and len(data) > 0:
                    if isinstance(data[0], list):
                        return data[0]  # Take first embedding
                    if isinstance(data[0], float) or isinstance(data[0], int):
                        return data
                logger.error(f"HF API Unexpected JSON format: {data}")
                return None
            else:
                logger.error(f"HF API Failed: {response.status_code} - {response.text}")
                # Fallthrough to local model if API fails
        except Exception as e:
            logger.error(f"HF API Request Exception: {e}")
            # Fallthrough to local model
    
    # Fallback to local model loading if no HF token or API failed
    try:
        model = _get_model()
        img = Image.open(BytesIO(image_bytes)).convert("RGB")
        embedding = model.encode(img, convert_to_numpy=True)
        return list(map(float, embedding.tolist()))
    except Exception as e:
        logger.error(f"Local embedding generation failed: {e}")
        return None


def generate_embedding(image_bytes: bytes) -> Optional[List[float]]:
    """
    Generate a 512-dimensional CLIP embedding from raw image bytes.
    This is synchronous — call from a thread executor in async contexts.
    Returns None on failure (so item is still saved without embedding).
    """
    return _generate_embedding_sync(image_bytes)

