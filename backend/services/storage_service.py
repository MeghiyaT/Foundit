"""
Foundit — Storage Service
Handles image upload to Supabase Storage.
"""

import uuid
import logging
from io import BytesIO
from fastapi import UploadFile, HTTPException
from PIL import Image
from database import get_supabase_client

logger = logging.getLogger(__name__)

BUCKET_NAME = "item-images"
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB


def _validate_image(content: bytes, content_type: str) -> None:
    """Raise HTTPException if the image is invalid."""
    if content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Only JPEG, PNG, or WebP images are accepted."
        )
    if len(content) > MAX_SIZE_BYTES:
        raise HTTPException(
            status_code=400,
            detail="Image must be under 5 MB."
        )
    try:
        img = Image.open(BytesIO(content))
        img.verify()          # closes the image
    except Exception:
        raise HTTPException(
            status_code=400,
            detail="Invalid or corrupt image file."
        )


def _ext_from_content_type(content_type: str) -> str:
    mapping = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
    }
    return mapping.get(content_type, "jpg")


def _ensure_bucket(supabase) -> None:
    """Create the storage bucket if it doesn't exist yet."""
    try:
        supabase.storage.get_bucket(BUCKET_NAME)
    except Exception:
        try:
            supabase.storage.create_bucket(
                BUCKET_NAME,
                options={"public": True}
            )
        except Exception as e:
            logger.warning(f"Could not create bucket (may already exist): {e}")


async def upload_image_bytes(content: bytes, content_type: str) -> str:
    """
    Validate and upload raw image bytes to Supabase Storage.
    Returns the public URL of the uploaded image.
    This is the preferred method — call it after reading the UploadFile once.
    """
    _validate_image(content, content_type)

    ext = _ext_from_content_type(content_type)
    filename = f"{uuid.uuid4()}.{ext}"

    supabase = get_supabase_client()
    _ensure_bucket(supabase)

    try:
        supabase.storage.from_(BUCKET_NAME).upload(
            path=filename,
            file=content,
            file_options={"content-type": content_type, "upsert": "false"},
        )
    except Exception as e:
        logger.error(f"Storage upload failed: {e}")
        raise HTTPException(status_code=500, detail=f"Image upload failed: {e}")

    url = supabase.storage.from_(BUCKET_NAME).get_public_url(filename)
    return url


async def upload_image(file: UploadFile) -> str:
    """
    Convenience wrapper for UploadFile objects.
    Reads the file and delegates to upload_image_bytes.
    NOTE: After calling this, the UploadFile stream is exhausted.
    """
    content = await file.read()
    return await upload_image_bytes(content, file.content_type or "image/jpeg")
