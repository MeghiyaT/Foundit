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

import os
import base64

def _generate_embedding_sync(image_bytes: bytes) -> Optional[List[float]]:
    """Synchronous version — utilizing official HuggingFace Inference API Client."""
    hf_token = os.environ.get("HUGGINGFACE_API_KEY")
    
    if not hf_token:
        logger.error("HUGGINGFACE_API_KEY is missing. Add it to Render Environment Variables!")
        return None

    try:
        from huggingface_hub import InferenceClient
        client = InferenceClient(token=hf_token)
        
        logger.info("Calling HuggingFace Hub InferenceClient for clip-ViT-B-32")
        # For HF visual feature extraction pipelines, wrapping it in B64 is highly recommended natively
        b64_img = base64.b64encode(image_bytes).decode("utf-8")
        
        # Raw post directly via client to handle specific sentence-transformer structure
        response = client.post(
            json={"inputs": {"image": b64_img}},
            model="sentence-transformers/clip-ViT-B-32",
            task="feature-extraction"
        )
        
        import json
        data = json.loads(response.decode("utf-8"))
        
        if isinstance(data, list) and len(data) > 0:
            if isinstance(data[0], list):
                return data[0]
            if isinstance(data[0], float) or isinstance(data[0], int):
                return data
                
        logger.error(f"HF InferenceClient Unexpected Format: {data}")
        return None
    except Exception as e:
        logger.error(f"HF InferenceClient Exception: {str(e)}")
        return None


def generate_embedding(image_bytes: bytes) -> Optional[List[float]]:
    """
    Generate a 512-dimensional CLIP embedding from raw image bytes.
    This is synchronous — call from a thread executor in async contexts.
    Returns None on failure (so item is still saved without embedding).
    """
    return _generate_embedding_sync(image_bytes)

