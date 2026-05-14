"""
Foundit — Application Configuration
"""

from pydantic_settings import BaseSettings
from typing import Optional
from functools import lru_cache


class Settings(BaseSettings):
    SUPABASE_URL: str
    SUPABASE_ANON_KEY: str
    SUPABASE_SERVICE_KEY: str

    # Clerk JWT (RS256) — issuer URL from Clerk Dashboard → API Keys → "Frontend API URL"
    # Example: https://your-app.clerk.accounts.dev
    CLERK_ISSUER: Optional[str] = None
    # Local-only escape hatch; never enable in production
    CLERK_JWT_INSECURE_NO_VERIFY: bool = False

    FRONTEND_URL: str = "http://localhost:3000"
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000

    RESEND_API_KEY: str = ""
    HUGGINGFACE_API_KEY: str = ""

    # Blockchain contract addresses (Sepolia testnet)
    HANDOVER_REGISTRY_ADDRESS: str = ""
    REWARD_TOKEN_ADDRESS: str = ""

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }


@lru_cache()
def get_settings() -> Settings:
    return Settings()
