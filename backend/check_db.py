import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

supabase = create_client(
    os.getenv("SUPABASE_URL"),
    os.getenv("SUPABASE_SERVICE_KEY")
)

res = supabase.table("matches").select("*, lost_item:items!lost_item_id(id, title), found_item:items!found_item_id(id, title)").execute()

for m in res.data:
    print(f"Match: {m['id']} - Status: {m['status']}")
    print(f"  Lost Item: {m.get('lost_item')}")
    print(f"  Found Item: {m.get('found_item')}")
