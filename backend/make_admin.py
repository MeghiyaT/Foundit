#!/usr/bin/env python3
"""
Foundit — Admin Promotion CLI
Usage: python make_admin.py <email>
       python make_admin.py list          # list all admins
       python make_admin.py revoke <email>

Requires: SUPABASE_URL and SUPABASE_SERVICE_KEY in .env (or environment)
"""

import sys
import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env from the same directory as this script
load_dotenv(Path(__file__).parent / ".env")

try:
    from supabase import create_client
except ImportError:
    print("❌ supabase-py not installed. Run: pip install supabase")
    sys.exit(1)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    print("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env")
    sys.exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def promote(email: str):
    res = supabase.table("users").update({"role": "admin"}).eq("email", email).execute()
    if res.data:
        print(f"✅ {email} is now an admin!")
    else:
        # Try by ID in case email doesn't match
        res2 = supabase.table("users").update({"role": "admin"}).ilike("email", f"%{email}%").execute()
        if res2.data:
            for u in res2.data:
                print(f"✅ {u['email']} (id={u['id']}) is now an admin!")
        else:
            print(f"❌ No user found matching '{email}'")
            print("   Tip: Run 'python make_admin.py list-all' to see all users")


def revoke(email: str):
    res = supabase.table("users").update({"role": "student"}).eq("email", email).execute()
    if res.data:
        print(f"✅ {email} is now a student (admin revoked).")
    else:
        print(f"❌ No user found with email: {email}")


def list_admins():
    res = supabase.table("users").select("id, email, name, role").eq("role", "admin").execute()
    if not res.data:
        print("No admins found.")
        return
    print(f"\n{'Email':<40} {'Name':<25} {'ID'}")
    print("-" * 80)
    for u in res.data:
        print(f"{u.get('email', ''):<40} {(u.get('name') or ''):<25} {u.get('id', '')}")


def list_all():
    res = supabase.table("users").select("id, email, name, role").order("role").execute()
    if not res.data:
        print("No users found.")
        return
    print(f"\n{'Email':<40} {'Name':<25} {'Role':<12} {'ID'}")
    print("-" * 90)
    for u in res.data:
        role = u.get("role", "student")
        marker = " 👑" if role == "admin" else ""
        print(f"{u.get('email', ''):<40} {(u.get('name') or ''):<25} {role:<12}{marker}  {u.get('id', '')}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(0)

    cmd = sys.argv[1]

    if cmd == "list":
        list_admins()
    elif cmd == "list-all":
        list_all()
    elif cmd == "revoke":
        if len(sys.argv) < 3:
            print("Usage: python make_admin.py revoke <email>")
            sys.exit(1)
        revoke(sys.argv[2])
    else:
        # Treat first arg as email to promote
        promote(cmd)
