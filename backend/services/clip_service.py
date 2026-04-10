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

import httpx
import os
import base64

def _generate_embedding_sync(image_bytes: bytes) -> Optional[List[float]]:
    """Synchronous version — explicitly hitting HF Inference API."""
    hf_token = os.environ.get("HUGGINGFACE_API_KEY")
    
    if not hf_token:
        logger.error("HUGGINGFACE_API_KEY is missing. Feature embeddings are disabled to prevent server OOM crashes.")
        return None

    try:
        api_url = "https://router.huggingface.co/hf-inference/models/sentence-transformers/clip-ViT-B-32"
        headers = {
            "Authorization": f"Bearer {hf_token}",
            "Content-Type": "application/octet-stream"
        }
        
        # httpx post
        response = httpx.post(api_url, headers=headers, content=image_bytes, timeout=25.0)
        
        if response.status_code == 200:
            data = response.json()
            if isinstance(data, list) and len(data) > 0:
                if isinstance(data[0], list):
                    return data[0]
                if isinstance(data[0], float) or isinstance(data[0], int):
                    return data
            logger.error(f"HF API Unexpected JSON: {data}")
            return None
        elif response.status_code == 400 and "application/octet-stream" in response.text:
            # Sometmes HF router gets confused by raw data for embedding pipelines. Retrying with B64 JSON.
            payload = {"inputs": {"image": base64.b64encode(image_bytes).decode('utf-8')}}
            headers["Content-Type"] = "application/json"
            retry = httpx.post(api_url, headers=headers, json=payload, timeout=25.0)
            if retry.status_code == 200:
                data = retry.json()
                if isinstance(data, list) and len(data) > 0:
                     if isinstance(data[0], list): return data[0]
                     return data
            logger.error(f"HF API JSON Retry Failed: {retry.status_code} - {retry.text}")
            return None
        else:
            logger.error(f"HF API Failed: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        logger.error(f"HF API Exception: {e}")
        return None


def generate_embedding(image_bytes: bytes) -> Optional[List[float]]:
    """
    Generate a 512-dimensional CLIP embedding from raw image bytes.
    This is synchronous — call from a thread executor in async contexts.
    Returns None on failure (so item is still saved without embedding).
    """
    return _generate_embedding_sync(image_bytes)

