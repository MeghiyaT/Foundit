"""
Foundit — Auth Router
JWT validation using Clerk. Verifies RS256 signatures via Clerk JWKS,
then syncs user data into the local users table.
"""

import logging
import time
from typing import Optional

from jwt import PyJWKClient, decode as jwt_decode
from jwt.exceptions import PyJWTError, PyJWKClientError
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel

from database import get_supabase_client
from config import get_settings

router = APIRouter(prefix="/auth", tags=["auth"])
security = HTTPBearer()
logger = logging.getLogger(__name__)

_jwks_clients: dict[str, PyJWKClient] = {}
_insecure_warned = False


class UserProfile(BaseModel):
    id: str
    email: str
    name: Optional[str] = None
    roll_no: Optional[str] = None
    role: str = "student"


class UserUpdate(BaseModel):
    name: Optional[str] = None
    roll_no: Optional[str] = None


def _jwks_client_for_issuer(issuer: str) -> PyJWKClient:
    issuer = issuer.rstrip("/")
    if issuer not in _jwks_clients:
        jwks_url = f"{issuer}/.well-known/jwks.json"
        _jwks_clients[issuer] = PyJWKClient(jwks_url)
    return _jwks_clients[issuer]


def _decode_clerk_jwt(token: str) -> dict:
    settings = get_settings()
    issuer = (settings.CLERK_ISSUER or "").strip().rstrip("/")

    if issuer:
        try:
            jwks_client = _jwks_client_for_issuer(issuer)
            signing_key = jwks_client.get_signing_key_from_jwt(token)
            return jwt_decode(
                token,
                signing_key.key,
                algorithms=["RS256"],
                issuer=issuer,
                options={"verify_aud": False},
            )
        except PyJWKClientError as e:
            logger.error("Failed to fetch Clerk JWKS: %s", e)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Unable to reach authentication service. Please try again.",
            ) from e
        except PyJWTError as e:
            logger.debug("Clerk JWT verification failed: %s", e)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token.",
                headers={"WWW-Authenticate": "Bearer"},
            ) from e
        except Exception as e:
            logger.error("Unexpected error during JWT verification: %s", e)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Authentication service temporarily unavailable.",
            ) from e

    if settings.CLERK_JWT_INSECURE_NO_VERIFY:
        global _insecure_warned
        if not _insecure_warned:
            logger.warning(
                "CLERK_JWT_INSECURE_NO_VERIFY is enabled and CLERK_ISSUER is unset — "
                "JWT signatures are not verified. Set CLERK_ISSUER for production."
            )
            _insecure_warned = True
        try:
            return jwt_decode(
                token,
                options={"verify_signature": False},
                algorithms=["RS256"],
            )
        except PyJWTError as e:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token format.",
                headers={"WWW-Authenticate": "Bearer"},
            ) from e

    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail=(
            "Authentication is not configured: set CLERK_ISSUER to your Clerk "
            "Frontend API URL (see Clerk Dashboard → API Keys), or for local "
            "development only set CLERK_JWT_INSECURE_NO_VERIFY=true."
        ),
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

    # Check expiry (jwt_decode with verify_exp default True already checked; keep for insecure path)
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

        # Defensive: repair missing required fields silently (fixes 500 on malformed rows)
        if "email" not in db_user or not db_user.get("email"):
            logger.warning("User %s exists but email is missing – repairing.", user_id)
            db_user["email"] = email
            supabase.table("users").update({"email": email}).eq("id", user_id).execute()
        if "role" not in db_user or not db_user.get("role"):
            db_user["role"] = "student"

        # Update email if we have a better one now
        if email and email != db_user.get("email") and "@clerk.local" not in email:
            try:
                supabase.table("users").update({"email": email}).eq("id", user_id).execute()
                db_user["email"] = email
            except Exception:
                logger.warning("Could not update email for %s (duplicate or conflict)", user_id)
        return UserProfile(
            id=db_user.get("id", user_id),
            email=db_user.get("email", email),
            name=db_user.get("name"),
            roll_no=db_user.get("roll_no"),
            role=db_user.get("role", "student"),
        )
    else:
        # First login — create user record
        try:
            supabase.table("users").insert({
                "id": user_id,
                "email": email,
                "role": "student",
            }).execute()
        except Exception:
            logger.warning("Insert failed for %s — may already exist, fetching", user_id)
            result = supabase.table("users").select("*").eq("id", user_id).execute()
            if result.data:
                d = result.data[0]
                return UserProfile(
                    id=d.get("id", user_id),
                    email=d.get("email", email),
                    name=d.get("name"),
                    roll_no=d.get("roll_no"),
                    role=d.get("role", "student"),
                )
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
            id=d.get("id", user.id),
            email=d.get("email", user.email),
            name=d.get("name"),
            roll_no=d.get("roll_no"),
            role=d.get("role", "student"),
        )
    return user
