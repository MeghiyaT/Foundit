"""
Foundit — Database Client
Supabase client initialization for backend operations
"""

from supabase import create_client, Client
from config import get_settings


def get_supabase_client() -> Client:
    """Get Supabase client using service role key (for backend operations)."""
    settings = get_settings()
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)


def get_supabase_anon_client() -> Client:
    """Get Supabase client using anon key (for auth operations)."""
    settings = get_settings()
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)
