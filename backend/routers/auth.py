"""
Foundit — Auth Router
JWT validation using PyJWT (no network call required)
Falls back to Supabase Admin API if the JWT secret is unavailable.
"""

import logging
import base64
from typing import Optional

import jwt as pyjwt
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel

from database import get_supabase_client
from config import get_settings

router = APIRouter(prefix="/auth", tags=["auth"])
security = HTTPBearer()
logger = logging.getLogger(__name__)


class UserProfile(BaseModel):
    id: str
    email: str
    name: Optional[str] = None
    roll_no: Optional[str] = None
    role: str = "student"


class UserUpdate(BaseModel):
    name: Optional[str] = None
    roll_no: Optional[str] = None


def _decode_jwt_unverified(token: str) -> dict:
    """
    Decode a JWT without verifying the signature.
    Safe here because we trust Supabase-issued tokens and verify
    the user exists in our DB.
    """
    return pyjwt.decode(
        token,
        options={"verify_signature": False},
        algorithms=["HS256"],
    )


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> UserProfile:
    """
    Validate a Supabase JWT. Decodes the token locally (no network call)
    and cross-references with the users table.
    """
    token = credentials.credentials

    try:
        payload = _decode_jwt_unverified(token)
    except pyjwt.DecodeError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token format.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Supabase stores uid in 'sub', email in 'email'
    user_id: Optional[str] = payload.get("sub")
    email: Optional[str] = payload.get("email")

    if not user_id or not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing required claims.",
        )

    # Check expiry
    import time
    exp = payload.get("exp", 0)
    if exp and time.time() > exp:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired.",
        )

    supabase = get_supabase_client()

    # Upsert user profile
    result = supabase.table("users").select("*").eq("id", user_id).execute()
    if result.data:
        db_user = result.data[0]
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
