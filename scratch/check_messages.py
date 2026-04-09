import sys
import os
sys.path.append(os.getcwd())
from database import get_supabase_client
try:
    supabase = get_supabase_client()
    res = supabase.table("messages").select("sender_id, receiver_id").execute()
    print(f"Total messages: {len(res.data)}")
    for msg in res.data[:50]:
        print(f"Sender: {msg['sender_id']}, Receiver: {msg['receiver_id']}")
except Exception as e:
    print(f"Error: {e}")
