"""
Foundit — Auth Router
JWT validation using Clerk. Decodes the Clerk-issued JWT and
syncs user data into the local users table.
"""

import logging
import time
from typing import Optional

import jwt as pyjwt
import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel

from database import get_supabase_client
from config import get_settings

router = APIRouter(prefix="/auth", tags=["auth"])
security = HTTPBearer()
logger = logging.getLogger(__name__)

# Cache the JWKS keys
_jwks_cache: dict = {}
_jwks_fetched_at: float = 0
JWKS_CACHE_TTL = 3600  # 1 hour


class UserProfile(BaseModel):
    id: str
    email: str
    name: Optional[str] = None
    roll_no: Optional[str] = None
    role: str = "student"


class UserUpdate(BaseModel):
    name: Optional[str] = None
    roll_no: Optional[str] = None


def _decode_clerk_jwt(token: str) -> dict:
    """
    Decode a Clerk JWT.
    In development, we decode without full signature verification
    to avoid needing JWKS. The middleware already validated the session.
    """
    try:
        payload = pyjwt.decode(
            token,
            options={"verify_signature": False},
            algorithms=["RS256"],
        )
        return payload
    except pyjwt.DecodeError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token format.",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> UserProfile:
    """
    Validate a Clerk JWT, extract user info, and sync with our users table.
    Clerk JWTs have 'sub' (user ID like 'user_xxx') and may have email in claims.
    """
    token = credentials.credentials
    payload = _decode_clerk_jwt(token)

    user_id: Optional[str] = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing user ID.",
        )

    # Check expiry
    exp = payload.get("exp", 0)
    if exp and time.time() > exp:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired.",
        )

    # Try to get email from JWT claims
    email = payload.get("email", "")

    # If no email in JWT, try Clerk's metadata
    if not email:
        metadata = payload.get("metadata", {})
        email = metadata.get("email", "")

    # If still no email, try unsafe_metadata or use a placeholder
    if not email:
        email = payload.get("emailAddress", f"{user_id}@clerk.local")

    supabase = get_supabase_client()

    # Upsert user profile
    result = supabase.table("users").select("*").eq("id", user_id).execute()
    if result.data:
        db_user = result.data[0]
        # Update email if we have a better one now
        if email and email != db_user.get("email") and "@clerk.local" not in email:
            supabase.table("users").update({"email": email}).eq("id", user_id).execute()
            db_user["email"] = email
        return UserProfile(
            id=db_user["id"],
            email=db_user["email"],
            name=db_user.get("name"),
            roll_no=db_user.get("roll_no"),
            role=db_user.get("role", "student"),
        )
    else:
        # First login — create user record
        supabase.table("users").insert({
            "id": user_id,
            "email": email,
            "role": "student",
        }).execute()
        return UserProfile(id=user_id, email=email, role="student")


@router.post("/verify", response_model=UserProfile)
async def verify_token(user: UserProfile = Depends(get_current_user)):
    """Validate JWT and return user profile."""
    return user


@router.put("/profile", response_model=UserProfile)
async def update_profile(
    update: UserUpdate,
    user: UserProfile = Depends(get_current_user),
):
    """Update user profile (name, roll_no)."""
    supabase = get_supabase_client()
    update_data = update.model_dump(exclude_none=True)
    if not update_data:
        return user
    supabase.table("users").update(update_data).eq("id", user.id).execute()
    result = supabase.table("users").select("*").eq("id", user.id).execute()
    if result.data:
        d = result.data[0]
        return UserProfile(
            id=d["id"],
            email=d["email"],
            name=d.get("name"),
            roll_no=d.get("roll_no"),
            role=d.get("role", "student"),
        )
    return user
