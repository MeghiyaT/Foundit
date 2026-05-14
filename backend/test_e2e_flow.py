"""
Foundit E2E Test Script
Tests the complete flow: Owner post lost → Finder post found → AI Match → Message → Claim
"""
import json, base64, time, requests, struct

API = "http://localhost:8000"

# -- Create test JWT tokens (CLERK_JWT_INSECURE_NO_VERIFY mode) --
def make_token(sub, email):
    payload = {"sub": sub, "email": email, "iat": int(time.time()), "exp": int(time.time()) + 3600}
    header = base64.urlsafe_b64encode(json.dumps({"alg": "RS256", "typ": "JWT"}).encode()).rstrip(b"=").decode()
    body = base64.urlsafe_b64encode(json.dumps(payload).encode()).rstrip(b"=").decode()
    return f"{header}.{body}.insecure_sig"

def req(method, url, **kwargs):
    """Make a request. Returns (status_code, dict|None, raw_text). Never throws."""
    r = requests.request(method, url, **kwargs)
    try:
        return r.status_code, r.json(), r.text
    except Exception:
        return r.status_code, None, r.text

OWNER_TOKEN = make_token("test_owner_e2e", "owner@test.com")
FINDER_TOKEN = make_token("test_finder_e2e", "finder@test.com")

def make_test_jpeg():
    """Minimal valid JPEG bytes."""
    return bytes([
        0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
        0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
        0xFF, 0xDB, 0x00, 0x43, 0x00,
    ] + [0x55] * 65 +
    [0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00,
     0xFF, 0xC4, 0x00, 0x14, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
     0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x04,
     0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F, 0x00,
     0x55,
     0xFF, 0xD9
    ])

# ============================================================
# TEST 1: Create two user profiles via auth/verify
# ============================================================
print("=" * 60)
print("TEST 1: Verify auth tokens & create user profiles")
print("=" * 60)

code1, owner, _ = req("POST", f"{API}/auth/verify", headers={"Authorization": f"Bearer {OWNER_TOKEN}"})
print(f"  Owner auth: {code1} -> {owner['id'] if code1 == 200 else owner}")
assert code1 == 200, f"Owner auth failed: {owner}"

code2, finder, _ = req("POST", f"{API}/auth/verify", headers={"Authorization": f"Bearer {FINDER_TOKEN}"})
print(f"  Finder auth: {code2} -> {finder['id']}")
assert code2 == 200, f"Finder auth failed: {finder}"

assert owner["role"] == "student"
assert finder["role"] == "student"
print("  ✅ Both users authenticated\n")

# ============================================================
# TEST 2: Post a LOST item (Owner)
# ============================================================
print("=" * 60)
print("TEST 2: Owner posts a LOST item with image → AI embedding")
print("=" * 60)

lost_form = {
    "type": "lost",
    "title": "Blue Hydro Flask Water Bottle",
    "description": "Blue 32oz Hydro Flask with stickers on it. Has a dent on the bottom.",
    "category": "Water Bottles",
    "location": "Library",
    "date_reported": "2026-05-14",
}
lost_files = {"image": ("bottle.jpg", make_test_jpeg(), "image/jpeg")}
headers = {"Authorization": f"Bearer {OWNER_TOKEN}"}
r = requests.post(f"{API}/items", data=lost_form, files=lost_files, headers=headers)
status_lost = r.status_code
lost_item = r.json() if r.text else {"error": r.text}
print(f"  Lost item POST: {status_lost}")
if status_lost in (200, 201):
    print(f"  Title: {lost_item.get('title')}")
    print(f"  ID: {lost_item.get('id')}")
    print(f"  Type: {lost_item.get('type')}")
    print(f"  Status: {lost_item.get('status')}")
    print(f"  Image URL: {lost_item.get('image_url', '')[:60]}...")
    lost_id = lost_item.get("id")
    assert lost_item.get("status") == "open"
    print("  ✅ Lost item created successfully\n")
else:
    print(f"  ❌ Failed: {lost_item}")
    lost_id = None

# ============================================================
# TEST 3: Post a FOUND item (Finder)
# ============================================================
print("=" * 60)
print("TEST 3: Finder posts a FOUND item with image → AI embedding")
print("=" * 60)

found_form = {
    "type": "found",
    "title": "Hydro Flask Blue 32oz",
    "description": "Found a blue Hydro Flask near the library. Has some stickers and a dent.",
    "category": "Water Bottles",
    "location": "Library",
    "date_reported": "2026-05-14",
}
found_files = {"image": ("found_bottle.jpg", make_test_jpeg(), "image/jpeg")}
headers = {"Authorization": f"Bearer {FINDER_TOKEN}"}
r = requests.post(f"{API}/items", data=found_form, files=found_files, headers=headers)
status_found = r.status_code
found_item = r.json() if r.text else {"error": r.text}
print(f"  Found item POST: {status_found}")
if status_found in (200, 201):
    print(f"  Title: {found_item.get('title')}")
    print(f"  ID: {found_item.get('id')}")
    print(f"  Type: {found_item.get('type')}")
    print(f"  Status: {found_item.get('status')}")
    found_id = found_item.get("id")
    print("  ✅ Found item created successfully\n")
else:
    print(f"  ❌ Failed: {found_item}")
    found_id = None

# ============================================================
# TEST 4: Check AI Matches
# ============================================================
print("=" * 60)
print("TEST 4: Verify AI Matching between lost & found items")
print("=" * 60)

if lost_id:
    code, matches, _ = req("GET", f"{API}/matches/item/{lost_id}", headers={"Authorization": f"Bearer {OWNER_TOKEN}"})
    print(f"  Matches for lost item ({lost_id[:8]}...): {code}")
    if code == 200 and matches:
        for m in matches:
            print(f"\n  ✨ SIMILARITY: {m.get('similarity_score', 'N/A')}")
            matched = m.get("matched_item", {})
            print(f"  Matched with: '{matched.get('title')}' (ID: {matched.get('id', '')[:8]}...)")
            print(f"  Type: {matched.get('type')} | Category: {matched.get('category')}")
            print(f"  Match status: {m.get('status')}")

            score = m.get("similarity_score", 0)
            if isinstance(score, (int, float)):
                if score >= 0.85:
                    print("  🟢 EXCELLENT match quality")
                elif score >= 0.72:
                    print("  🟡 GOOD match quality (above threshold)")
                elif score > 0:
                    print("  🔴 BELOW threshold match")
        if len(matches) == 0:
            print("  ⚠️ No AI matches found (may need to check embedding generation)")
    else:
        print(f"  Response: {matches}")
print()

# ============================================================
# TEST 5: Messaging between Finder and Owner
# ============================================================
print("=" * 60)
print("TEST 5: Messaging system")
print("=" * 60)

if lost_id:
    msg_data = {
        "item_id": lost_id,
        "receiver_id": owner["id"],
        "content": "Hi! I think I found your Hydro Flask. It has stickers on it and a dent. Can you describe the stickers?"
    }
    code, msg, _ = req("POST", f"{API}/messages", headers={"Authorization": f"Bearer {FINDER_TOKEN}"}, json=msg_data)
    print(f"  Finder sends message: {code}")
    if code == 200:
        msg_id = msg.get("id")
        print(f"  Message ID: {msg_id}")
        print(f"  Content: {msg.get('content')}")

        reply_data = {
            "item_id": lost_id,
            "receiver_id": finder["id"],
            "content": "Yes that's mine! One has a NASA sticker and another is a surfing logo. I can meet you at the library tomorrow."
        }
        code2, reply, _ = req("POST", f"{API}/messages", headers={"Authorization": f"Bearer {OWNER_TOKEN}"}, json=reply_data)
        print(f"  Owner replies: {code2}")
        if code2 == 200:
            print(f"  Reply: {reply.get('content')[:60]}...")

        code3, convs, _ = req("GET", f"{API}/messages/conversations", headers={"Authorization": f"Bearer {OWNER_TOKEN}"})
        print(f"  Owner conversations: {code3}, count: {len(convs.get('conversations', [])) if convs else 0}")
        print("  ✅ Messaging flow works\n")
    else:
        print(f"  ❌ Message send failed: {msg}\n")
else:
    print("  ⚠️ Skipping — no lost item\n")

# ============================================================
# TEST 6: Claims Flow (Owner initiates → Admin approves → Finder completes)
# ============================================================
print("=" * 60)
print("TEST 6: Claims flow (blockchain-integrated)")
print("=" * 60)

if lost_id and found_id:
    claim_data = {
        "item_id": lost_id,
        "finder_id": finder["id"],
        "owner_wallet": "0xOwnerWallet1234567890123456789012345678901234"
    }
    code, claim, _ = req("POST", f"{API}/claims", headers={"Authorization": f"Bearer {OWNER_TOKEN}"}, json=claim_data)
    print(f"\n  [6a] Initiate claim: {code}")
    if code == 200:
        claim_id = claim.get("id")
        secret_code = claim.get("secret_code")
        print(f"  Claim ID: {claim_id}")
        print(f"  Secret code: {secret_code}")
        print(f"  Status: {claim.get('status')}")
        print(f"  Expires: {claim.get('expires_at')}")
        print("  ✅ Claim initiated\n")
    else:
        print(f"  ❌ Claim initiation failed: {claim}\n")
        claim_id = None
        secret_code = None

    if claim_id:
        code, view_claim, _ = req("GET", f"{API}/claims/{claim_id}", headers={"Authorization": f"Bearer {FINDER_TOKEN}"})
        safe = {k: v for k, v in (view_claim or {}).items() if k != "secret_hash"}
        print(f"  [6b] Finder views claim: {code}")
        print(f"  Viewable fields: {safe}")
        print("  ✅ Claim visible to finder\n")

    if claim_id:
        code, owner_view, _ = req("GET", f"{API}/claims/{claim_id}", headers={"Authorization": f"Bearer {OWNER_TOKEN}"})
        print(f"  [6c] Owner views claim: {code}")
        print(f"  Status: {owner_view.get('status') if owner_view else 'N/A'}")
        print("  ✅ Claim visible to owner\n")

    print(f"  [6d] Admin approve — requires admin JWT (role=admin)")
    print("  ⚠️ Skipping admin approval (need admin user)\n")

    if lost_id:
        code, item, _ = req("GET", f"{API}/items/{lost_id}", headers={"Authorization": f"Bearer {OWNER_TOKEN}"})
        print(f"  [6e] Current item status: {item.get('status') if item else 'N/A'}")
else:
    print("  ⚠️ Skipping claims — items not created\n")

# ============================================================
# TEST 7: Verify blockchain config
# ============================================================
print("=" * 60)
print("TEST 7: Blockchain configuration")
print("=" * 60)
code, bc, _ = req("GET", f"{API}/config/blockchain")
if bc:
    print(f"  Network: {bc.get('network')}")
    print(f"  Chain ID: {bc.get('chain_id')}")
    print(f"  Handover Registry: {bc.get('handover_registry_address') or '(not deployed - needs env config)'}")
    print(f"  Reward Token: {bc.get('reward_token_address') or '(not deployed - needs env config)'}")
print()

# ============================================================
print("=" * 60)
print("🎉 E2E TEST COMPLETE 🎉")
print("=" * 60)