"""
Foundit — FastAPI Application Entry Point
"""

import os
import time
import re
import logging
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from config import get_settings
from routers import auth, items, matches, messages, admin, claims

settings = get_settings()

logger = logging.getLogger("foundit.access")

# ---------------------------------------------------------------------------
# Environment-aware configuration
# ---------------------------------------------------------------------------
environment = os.getenv("ENVIRONMENT", "development")
is_production = environment == "production"

# ---------------------------------------------------------------------------
# FastAPI app — conditionally expose OpenAPI docs
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Foundit API",
    description="Smart Lost & Found Platform — Backend API",
    version="1.0.0",
    docs_url=None if is_production else "/docs",
    redoc_url=None if is_production else "/redoc",
    openapi_url=None if is_production else "/openapi.json",
)

# ---------------------------------------------------------------------------
# Rate limiter (Finding #4)
# ---------------------------------------------------------------------------
limiter = Limiter(key_func=get_remote_address, default_limits=["60/minute"])
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ---------------------------------------------------------------------------
# CORS middleware (Finding #7 — already well-configured)
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.FRONTEND_URL,
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://foundit-eight-mu.vercel.app",
    ],
    allow_origin_regex=r"https://foundit.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Security headers middleware (Finding #1)
# ---------------------------------------------------------------------------
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Inject defensive HTTP security headers on every response."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = (
            "max-age=31536000; includeSubDomains"
        )
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' https://*.clerk.accounts.dev; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: https:; "
            "connect-src 'self' https://*.clerk.accounts.dev https://*.supabase.co"
        )
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = (
            "camera=(), microphone=(), geolocation=()"
        )
        return response


app.add_middleware(SecurityHeadersMiddleware)

# ---------------------------------------------------------------------------
# Access logging middleware (Finding #11)
# ---------------------------------------------------------------------------
class AccessLogMiddleware(BaseHTTPMiddleware):
    """Structured request logging for observability."""

    async def dispatch(self, request: Request, call_next):
        start = time.perf_counter()
        response = await call_next(request)
        elapsed_ms = (time.perf_counter() - start) * 1000
        logger.info(
            "access",
            extra={
                "method": request.method,
                "path": request.url.path,
                "status": response.status_code,
                "duration_ms": round(elapsed_ms, 2),
                "client_ip": request.client.host if request.client else "unknown",
            },
        )
        return response


app.add_middleware(AccessLogMiddleware)

# ---------------------------------------------------------------------------
# Catch-all 404 handler (Finding #8 — consistent 404 for unknown routes)
# ---------------------------------------------------------------------------
@app.exception_handler(404)
async def not_found_handler(request: Request, exc):
    return JSONResponse(status_code=404, content={"detail": "Not found."})


# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
app.include_router(auth.router)
app.include_router(items.router)
app.include_router(matches.router)
app.include_router(messages.router)
app.include_router(admin.router)
app.include_router(claims.router)


# ---------------------------------------------------------------------------
# Utility endpoints
# ---------------------------------------------------------------------------
@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "foundit-api", "version": "1.0.0"}


@app.get("/config/blockchain")
async def blockchain_config():
    """Return contract addresses for frontend integration."""
    return {
        "handover_registry_address": settings.HANDOVER_REGISTRY_ADDRESS,
        "reward_token_address": settings.REWARD_TOKEN_ADDRESS,
        "network": "sepolia",
        "chain_id": 11155111,
    }