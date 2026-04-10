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
