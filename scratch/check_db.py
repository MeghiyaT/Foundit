import os
from supabase import create_client

url = os.environ.get("SUPABASE_URL", "https://hdcnwbkyvljlbvpoqrgm.supabase.co")
key = os.environ.get("SUPABASE_SERVICE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhkY253Ymt5dmxqbGJ2cG9xcmdtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTI5OTU0MCwiZXhwIjoyMDkwODc1NTQwfQ.7VdQZCExryr3iRTeRB2cLNALhG316WEp5WBu7u-X2Ls")
supabase = create_client(url, key)

try:
    res = supabase.table("items").select("id, embedding").limit(1).execute()
    if res.data and res.data[0].get("embedding"):
        print(f"Embedding length: {len(res.data[0]['embedding'])}")
    else:
        print("No embeddings found, trying to insert a dummy 384-dim vector")
        try:
            supabase.table("items").insert({"user_id": "test", "type": "lost", "title": "test", "embedding": [0.1]*384}).execute()
            print("Successfully inserted 384-dim")
        except Exception as e:
            print(f"Error inserting 384-dim: {e}")
        try:
            supabase.table("items").insert({"user_id": "test", "type": "lost", "title": "test", "embedding": [0.1]*512}).execute()
            print("Successfully inserted 512-dim")
        except Exception as e:
            print(f"Error inserting 512-dim: {e}")
except Exception as e:
    print(f"Error: {e}")
