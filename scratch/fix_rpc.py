import os
from database import get_supabase_client
import httpx

url = os.environ.get("SUPABASE_URL", "https://hdcnwbkyvljlbvpoqrgm.supabase.co")
key = os.environ.get("SUPABASE_SERVICE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhkY253Ymt5dmxqbGJ2cG9xcmdtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTI5OTU0MCwiZXhwIjoyMDkwODc1NTQwfQ.7VdQZCExryr3iRTeRB2cLNALhG316WEp5WBu7u-X2Ls")

# Execute raw SQL using Postgres REST API or supabase-py's rpc? Wait, supabase-py can't execute DDL easily.
# I can use psycopg2 or just pg8000. Wait, I don't have the connection string.
# Is there a postgres connection string in .env?
