"""Debug why existing Clerk users cause 500 errors in auth."""
import sys
sys.path.insert(0, ".")
from database import get_supabase_client

client = get_supabase_client()

# Check the two existing user IDs that cause 500 errors
uids = [
    "user_3C7fftHffvu9FMf4CSmxIDd2gTK",
    "user_3C7bp0dhN2YNsPJ6DgYnvBiFSb0",
    "user_9999999999999999999999999999",
]

for uid in uids:
    print(f"\n--- Checking {uid[:30]}... ---")
    try:
        res = client.table("users").select("*").eq("id", uid).execute()
        print(f"Type: {type(res)}")
        print(f"Data: {res.data}")
        if res.data:
            row = res.data[0]
            print(f"Columns: {list(row.keys())}")
            print(f"Row: {row}")
    except Exception as e:
        print(f"ERROR: {type(e).__name__}: {e}")

# Also check what the actual auth endpoint does: select then maybe insert
# Let's simulate the exact auth flow
print("\n\n--- Simulating auth flow for existing owner ---")
uid = "user_3C7fftHffvu9FMf4CSmxIDd2gTK"
try:
    res = client.table("users").select("*").eq("id", uid).execute()
    print(f"Select: {res.data}")
    if res.data:
        db_user = res.data[0]
        print(f"Has email: {'email' in db_user}")
        print(f"Email value: {db_user.get('email')}")
        # Simulate the email update check
        email = "owner@test.com"
        if email and email != db_user.get("email") and "@clerk.local" not in email:
            print("Would update email...")
            try:
                upd = client.table("users").update({"email": email}).eq("id", uid).execute()
                print(f"Update result: {upd}")
            except Exception as e:
                print(f"UPDATE ERROR: {type(e).__name__}: {e}")
except Exception as e:
    print(f"SELECT ERROR: {type(e).__name__}: {e}")