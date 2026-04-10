"""
Foundit — FastAPI Application Entry Point
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from config import get_settings
from routers import auth, items, matches, messages, admin, claims

settings = get_settings()

app = FastAPI(
    title="Foundit API",
    description="Smart Lost & Found Platform — Backend API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

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
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(items.router)
app.include_router(matches.router)
app.include_router(messages.router)
app.include_router(admin.router)
app.include_router(claims.router)


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
