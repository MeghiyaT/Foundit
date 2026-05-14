import json, base64, time, requests

API = "http://localhost:8000"

def test_auth(user_id, email):
    payload = {"sub": user_id, "email": email, "iat": int(time.time()), "exp": int(time.time()) + 3600}
    header = base64.urlsafe_b64encode(json.dumps({"alg": "RS256", "typ": "JWT"}).encode()).rstrip(b"=").decode()
    body = base64.urlsafe_b64encode(json.dumps(payload).encode()).rstrip(b"=").decode()
    token = f"{header}.{body}.insecure_sig"
    r = requests.post(f"{API}/auth/verify", headers={"Authorization": f"Bearer {token}"})
    print(f"  Status: {r.status_code}")
    print(f"  Body: {r.text[:200]}")
    try:
        print(f"  JSON: {r.json()}")
    except Exception as e:
        print(f"  JSON error: {e}")

print("Test 1: Short ID (should work)")
test_auth("test_short", "short@test.com")

print("\nTest 2: Long Clerk-style ID that EXISTS (owner)")
test_auth("user_3C7fftHffvu9FMf4CSmxIDd2gTK", "owner@test.com")

print("\nTest 3: Long Clerk-style ID that exists (finder)")
test_auth("user_3C7bp0dhN2YNsPJ6DgYnvBiFSb0", "finder@test.com")

print("\nTest 4: Long Clerk-style ID NEW random")
test_auth("user_9999999999999999999999999999", "new@test.com")
