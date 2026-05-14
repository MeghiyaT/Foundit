"""Quick diagnostic: auth with long Clerk-style user ID."""
import json, base64, time, requests

LOST_OWNER_ID = "user_3C7fftHffvu9FMf4CSmxIDd2gTK"
API = "http://localhost:8000"

payload = {"sub": LOST_OWNER_ID, "email": "owner@test.com", "iat": int(time.time()), "exp": int(time.time()) + 3600}
header = base64.urlsafe_b64encode(json.dumps({"alg": "RS256", "typ": "JWT"}).encode()).rstrip(b"=").decode()
body = base64.urlsafe_b64encode(json.dumps(payload).encode()).rstrip(b"=").decode()
token = f"{header}.{body}.insecure_sig"

print(f"Token length: {len(token)}")
r = requests.post(f"{API}/auth/verify", headers={"Authorization": f"Bearer {token}"})
print(f"Status: {r.status_code}")
print(f"Text: [{r.text[:200]}]")
print(f"Len: {len(r.text)}")
try:
    print(f"JSON: {r.json()}")
except Exception as e:
    print(f"JSON error: {e}")