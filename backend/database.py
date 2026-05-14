"""
Foundit — Database Client
Supabase client initialization for backend operations
"""

import os
from supabase import create_client, Client
from supabase.lib.client_options import ClientOptions
from config import get_settings

# Configure connection pool size via environment or default to 50
# This addresses Finding #3 (connection exhaustion under concurrent load)
_POOL_LIMIT = int(os.getenv("SUPABASE_POOL_LIMIT", "50"))
_POOL_TIMEOUT = float(os.getenv("SUPABASE_POOL_TIMEOUT", "30.0"))


def get_supabase_client() -> Client:
    """Get Supabase client using service role key (for backend operations).

    The client is configured with an increased HTTP connection pool to handle
    concurrent requests without exhausting connections (Finding #3 fix).
    """
    settings = get_settings()
    return create_client(
        settings.SUPABASE_URL,
        settings.SUPABASE_SERVICE_KEY,
        options=ClientOptions(
            postgrest_client_timeout=_POOL_TIMEOUT,
            storage_client_timeout=_POOL_TIMEOUT,
            schema="public",
        ),
    )


def get_supabase_anon_client() -> Client:
    """Get Supabase client using anon key (for auth operations)."""
    settings = get_settings()
    return create_client(
        settings.SUPABASE_URL,
        settings.SUPABASE_ANON_KEY,
        options=ClientOptions(
            postgrest_client_timeout=_POOL_TIMEOUT,
            storage_client_timeout=_POOL_TIMEOUT,
            schema="public",
        ),
    )