#!/usr/bin/env python3
"""
Run this script after pasting the migration SQL into Supabase SQL Editor.
It verifies that all required columns exist.

Usage:
  cd backend && .venv/bin/python run_migration_check.py
"""

import sys
sys.path.insert(0, '.')

from database import get_supabase_client


def check_column(table: str, column: str) -> bool:
    """Check if a column exists in a table by attempting to select it."""
    supabase = get_supabase_client()
    try:
        supabase.table(table).select(column).limit(1).execute()
        return True
    except Exception:
        return False


def main():
    required_columns = {
        'claims': ['finder_id', 'secret_hash', 'status', 'tx_hash', 'reward_amount', 'expires_at', 'owner_wallet', 'finder_wallet'],
        'users': ['wallet_address'],
    }

    all_ok = True
    for table, columns in required_columns.items():
        print(f"\n📋 Checking table: {table}")
        for col in columns:
            exists = check_column(table, col)
            status = "✅" if exists else "❌"
            print(f"  {status} {col}")
            if not exists:
                all_ok = False

    print()
    if all_ok:
        print("🎉 All columns exist! Migration is complete.")
    else:
        print("⚠️  Some columns are missing. Please run the migration SQL in the Supabase SQL Editor.")
        print("   File: supabase/migrations/007_blockchain_claims.sql")
        print("   Dashboard: https://supabase.com/dashboard/project/hdcnwbkyvljlbvpoqrgm/sql/new")
    
    return 0 if all_ok else 1


if __name__ == "__main__":
    sys.exit(main())
