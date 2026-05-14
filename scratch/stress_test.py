#!/usr/bin/env python3
"""Comprehensive stress test & security audit for Foundit API at localhost:8000"""

import asyncio, httpx, json, time

BASE = "http://localhost:8000"
findings = []

def add(severity, category, endpoint, issue, detail, recommendation):
    findings.append({
        "severity": severity,
        "category": category,
        "endpoint": endpoint,
        "issue": issue,
        "detail": detail,
        "recommendation": recommendation,
    })

async def get(client, path, headers=None):
    try:
        r = await client.get(f"{BASE}{path}", headers=headers, timeout=10)
        return r.status_code, r.headers, r.text[:2000]
    except Exception as e:
        return None, {}, str(e)

async def post(client, path, data=None, headers=None):
    try:
        r = await client.post(f"{BASE}{path}", json=data, headers=headers, timeout=10)
        return r.status_code, r.headers, r.text[:2000]
    except Exception as e:
        return None, {}, str(e)

async def test_security_headers(client):
    """Check for missing security headers."""
    print("\n[TEST] Security Headers")
    r = await client.get(f"{BASE}/health")
    needed = [
        "X-Content-Type-Options",
        "X-Frame-Options",
        "Strict-Transport-Security",
        "Content-Security-Policy",
        "X-XSS-Protection",
    ]
    present = []
    missing = []
    for h in needed:
        v = r.headers.get(h.lower(), None)
        if v:
            present.append(f"{h}={v[:60]}")
        else:
            missing.append(h)
    print(f"  Present: {present}")
    print(f"  Missing: {missing}")
    if missing:
        add("HIGH", "Security Headers", "ALL",
            "Missing critical HTTP security headers",
            f"Missing: {', '.join(missing)}",
            "Add FastAPI middleware or nginx to inject: X-Content-Type-Options=nosniff, X-Frame-Options=DENY, HSTS, CSP, X-XSS-Protection.")

async def test_cors(client):
    """Verify CORS does not allow arbitrary origins."""
    print("\n[TEST] CORS Configuration")
    r = await client.options(f"{BASE}/items", headers={
        "Origin": "http://evil.attacker.com",
        "Access-Control-Request-Method": "GET",
    })
    acao = r.headers.get("access-control-allow-origin", "NOT-SET")
    print(f"  OPTIONS from evil.com => {r.status_code}, ACAO='{acao}'")
    if "evil" in acao.lower() or acao == "*":
        add("HIGH", "CORS", "OPTIONS /*",
            "CORS allows arbitrary/malicious origins",
            f"ACAO from evil.com = '{acao}'",
            "Restrict allow_origins to explicit whitelist of trusted domains.")

async def test_auth_bypass(client):
    """Test that protected endpoints reject requests without valid JWT."""
    print("\n[TEST] Authentication Bypass")
    bad_jwt = "Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.invalid.invalid"

    # With bad token
    protected_endpoints = [
        ("POST", "/items", {}),
        ("GET", "/messages/conversations", None),
        ("GET", "/matches/mine", None),
        ("GET", "/my-items", None),
        ("DELETE", "/items/00000000-0000-0000-0000-000000000001", None),
    ]
    for method, path, body in protected_endpoints:
        if method == "GET":
            code, _, _ = await get(client, path, {"Authorization": bad_jwt})
        elif method == "POST":
            code, _, _ = await post(client, path, body, {"Authorization": bad_jwt})
        elif method == "DELETE":
            r = await client.delete(f"{BASE}{path}", headers={"Authorization": bad_jwt}, timeout=10)
            code = r.status_code if not isinstance(r, Exception) else 0

        status = "PROTECTED" if code in (401, 403) else f"VULNERABLE (HTTP {code})"
        print(f"  {method} {path} (bad jwt) => {status}")
        if code not in (401, 403):
            add("CRITICAL", "Authentication", f"{method} {path}",
                "Protected endpoint did NOT reject invalid JWT",
                f"Returned HTTP {code} with invalid bearer token",
                "Ensure all protected routes use `get_current_user` JWT dependency that properly validates tokens.")

    # Without any auth header
    for method, path, body in [
        ("POST", "/items", {}),
        ("GET", "/admin/stats", None),
    ]:
        if method == "GET":
            code, _, _ = await get(client, path)
        else:
            code, _, _ = await post(client, path, body)
        print(f"  {method} {path} (NO auth header) => {code}")
        if code not in (401, 403):
            add("CRITICAL", "Authentication", f"{method} {path}",
                "Protected endpoint accessible WITHOUT any authorization header",
                f"Returned HTTP {code} with no token",
                "All protected endpoints must require a valid JWT in the Authorization header.")

async def test_sql_injection(client):
    """Send SQL injection payloads to search endpoint."""
    print("\n[TEST] SQL Injection Vectors")
    payloads = [
        ("' OR '1'='1", "Classic OR injection"),
        ("'; DROP TABLE items; --", "DROP TABLE attempt"),
        ("' OR 1=1--", "Comment-based bypass"),
        ("1' UNION SELECT NULL--", "UNION SELECT"),
    ]
    for payload, desc in payloads:
        code, _, body = await get(client, f"/items?search={payload}")
        flag = " ⚠ SERVER ERROR" if code == 500 else ""
        print(f"  /items?search={desc} => HTTP {code}{flag}")
        if code == 500:
            add("HIGH", "SQL Injection", "GET /items",
                f"SQLi payload caused server error: {desc}",
                f"Payload '{payload}' returned 500. Body: {body[:200]}",
                "Audit database queries. Ensure all inputs use parameterized queries via Supabase SDK. Add input sanitization middleware.")

async def test_input_validation(client):
    """Test edge cases on query params."""
    print("\n[TEST] Input Validation")
    # Oversized search
    big = "A" * 5000
    code, _, _ = await get(client, f"/items?search={big}")
    print(f"  GET /items?search=5000_chars => {code}")
    if code == 500:
        add("MEDIUM", "Input Validation", "GET /items",
            "Oversized query parameter caused server error",
            "5000-char search param returned 500",
            "Add Pydantic Query(max_length=200) on search/text params. Truncate at app or DB layer.")
    # Negative/zero limit
    for lim in [-1, 0]:
        code, _, _ = await get(client, f"/items?limit={lim}")
        print(f"  GET /items?limit={lim} => {code}")
    # Invalid type
    code, _, _ = await get(client, "/items?type=INVALID")
    print(f"  GET /items?type=INVALID => {code}")

async def test_error_disclosure(client):
    """Check if errors leak internal info."""
    print("\n[TEST] Information Disclosure")
    test_paths = [
        "/api/v1/debug/config",
        "/.env",
        "/admin/../../../etc/passwd",
    ]
    sensitive_keywords = ["password", "secret", "traceback", "stack trace",
                          "postgres", "database_url", "supabase_key", "internal server error"]
    for path in test_paths:
        code, _, body = await get(client, path)
        leaked = [s for s in sensitive_keywords if s.lower() in body.lower()]
        safe = "SAFE" if not leaked else f"LEAKED: {leaked}"
        print(f"  GET {path} => {code} ({safe})")
        if leaked:
            add("HIGH", "Information Disclosure", path,
                f"Error response leaks sensitive information",
                f"Body contains: {leaked}",
                "Set debug=False. Add custom FastAPI exception handlers that return generic error messages.")

async def test_openapi_exposure(client):
    """Check if API docs are public."""
    print("\n[TEST] OpenAPI Docs Exposure")
    for path in ["/docs", "/redoc", "/openapi.json"]:
        code, _, _ = await get(client, path)
        status = "EXPOSED" if code == 200 else "PROTECTED"
        print(f"  {path} => {code} ({status})")
        if code == 200:
            add("MEDIUM", "Information Disclosure", path,
                "API documentation is publicly accessible",
                f"GET {path} returned 200 — exposing full API schema, all endpoints, and parameter definitions",
                "Set docs_url=None in production or restrict to admin IPs / require authentication.")

async def test_rate_limiting(client):
    """Send 50 concurrent requests to detect rate limiting."""
    print("\n[TEST] Rate Limiting — 50 concurrent GET /items")
    tasks = [client.get(f"{BASE}/items", timeout=10) for _ in range(50)]
    start = time.time()
    results = await asyncio.gather(*tasks, return_exceptions=True)
    elapsed = time.time() - start
    statuses = {}
    errors = 0
    for r in results:
        if isinstance(r, Exception):
            errors += 1
            continue
        statuses[r.status_code] = statuses.get(r.status_code, 0) + 1
    print(f"  {elapsed:.1f}s | Statuses: {statuses} | Errors: {errors}")
    if 429 in statuses:
        print("  Rate limiting IS active ✓")
    else:
        add("HIGH", "Rate Limiting", "GET /items",
            "No rate limiting detected — API vulnerable to brute force & DoS",
            f"50 concurrent requests all succeeded without any 429. Statuses: {statuses}",
            "Implement rate limiting per IP and per user. Recommended: slowapi with FastAPI. 30 req/min for unauthenticated, 60 req/min for authenticated.")

async def test_concurrent_load(client):
    """100 mixed concurrent requests to measure throughput and stability."""
    print("\n[TEST] Concurrent Load — 100 mixed requests")
    tasks = []
    for _ in range(30):
        tasks.append(client.get(f"{BASE}/items", timeout=15))
    for _ in range(30):
        tasks.append(client.get(f"{BASE}/health", timeout=15))
    for i in range(20):
        tasks.append(client.get(f"{BASE}/items?page={(i%5)+1}&limit=10", timeout=15))
    for _ in range(20):
        tasks.append(client.get(f"{BASE}/config/blockchain", timeout=15))

    start = time.time()
    results = await asyncio.gather(*tasks, return_exceptions=True)
    elapsed = time.time() - start

    statuses = {}
    errors = 0
    timeouts = 0
    for r in results:
        if isinstance(r, Exception):
            errors += 1
            err_str = str(r).lower()
            if "timeout" in err_str or "timed out" in err_str:
                timeouts += 1
            continue
        statuses[r.status_code] = statuses.get(r.status_code, 0) + 1

    throughput = 100 / elapsed if elapsed > 0 else 0
    print(f"  {elapsed:.1f}s | Throughput: {throughput:.1f} req/s")
    print(f"  Statuses: {statuses} | Errors: {errors} | Timeouts: {timeouts}")

    if timeouts > 5:
        add("MEDIUM", "Performance / Stability", "ALL",
            f"High timeout rate under moderate load: {timeouts}/100 timeouts",
            f"Throughput: {throughput:.1f} req/s. Timeouts: {timeouts}, Errors: {errors}",
            "Increase uvicorn workers (--workers N). Add connection pooling for Supabase. Consider Redis caching for frequent queries.")
    if errors > 5:
        add("HIGH", "Stability", "ALL",
            f"High error rate under moderate load: {errors}/100 errors",
            f"Throughput: {throughput:.1f} req/s. Total errors: {errors}",
            "Investigate error types. Likely Supabase connection pool exhaustion. Add retry logic and circuit breaker.")

async def test_http_methods(client):
    """Test unsafe HTTP methods."""
    print("\n[TEST] Unsafe HTTP Methods")
    for method in ["TRACE", "CONNECT"]:
        try:
            r = await client.request(method, f"{BASE}/health", timeout=5)
            print(f"  {method} /health => {r.status_code}")
        except httpx.ConnectError:
            print(f"  {method} /health => BLOCKED/CONNECTION_REFUSED ✓")
        except Exception as e:
            print(f"  {method} /health => {type(e).__name__} ✓")

async def test_response_times(client):
    """Benchmark endpoint response times."""
    print("\n[TEST] Response Time Benchmarks")
    endpoints = [
        "GET /health",
        "GET /items",
        "GET /items?page=1&limit=12",
        "GET /items?type=lost&status=open",
        "GET /config/blockchain",
    ]
    for ep in endpoints:
        method, path = ep.split(" ", 1)
        start = time.time()
        if method == "GET":
            code, _, _ = await get(client, path)
        elapsed_ms = (time.time() - start) * 1000
        flag = " ⚠ SLOW" if elapsed_ms > 500 else ""
        print(f"  {ep} => {code} ({elapsed_ms:.0f}ms){flag}")
        if elapsed_ms > 500:
            add("LOW", "Performance", path,
                f"Endpoint response time is slow: {elapsed_ms:.0f}ms",
                f"{method} {path} took {elapsed_ms:.0f}ms",
                "Add database query optimization, proper indexes, or Redis caching layer.")

async def main():
    print("=" * 65)
    print("FOUNDIT API — LOCALHOST STRESS TEST & SECURITY AUDIT")
    print(f"Target: {BASE}")
    print(f"Started: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 65)

    async with httpx.AsyncClient(timeout=15, limits=httpx.Limits(max_connections=100, max_keepalive_connections=20)) as client:
        # 1. Health check
        code, _, _ = await get(client, "/health")
        if code != 200:
            print(f"\nFATAL: Backend unreachable (HTTP {code}). Start with: cd backend && uvicorn main:app --reload")
            return
        print(f"\n✓ Backend reachable at {BASE}")

        # 2. Run all tests
        await test_cors(client)
        await test_security_headers(client)
        await test_auth_bypass(client)
        await test_sql_injection(client)
        await test_input_validation(client)
        await test_error_disclosure(client)
        await test_openapi_exposure(client)
        await test_response_times(client)
        await test_concurrent_load(client)
        await test_rate_limiting(client)
        await test_http_methods(client)

    # ── SUMMARY ────────────────────────────────────────────
    print("\n" + "=" * 65)
    print("FINDINGS SUMMARY")
    print("=" * 65)

    severity_order = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3, "INFO": 4}
    findings.sort(key=lambda f: severity_order.get(f["severity"], 99))

    sev_counts = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0, "INFO": 0}
    for f in findings:
        sev_counts[f["severity"]] = sev_counts.get(f["severity"], 0) + 1

    print(f"\nTotal Findings: {len(findings)}")
    for s in ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"]:
        if sev_counts.get(s):
            print(f"  {s}: {sev_counts[s]}")


    for i, f in enumerate(findings, 1):
        print(f"\n{'─'*60}")
        print(f"FINDING #{i} — Severity: [{f['severity']}] | Category: {f['category']}")
        print(f"  Endpoint: {f['endpoint']}")
        print(f"  Issue: {f['issue']}")
        print(f"  Detail: {f['detail']}")
        print(f"  Recommendation: {f['recommendation']}")

    # Score calculation
    penalty = (
        sev_counts.get("CRITICAL", 0) * 25 +
        sev_counts.get("HIGH", 0) * 15 +
        sev_counts.get("MEDIUM", 0) * 5 +
        sev_counts.get("LOW", 0) * 2
    )
    score = max(0, 100 - penalty)

    if score >= 90:
        grade = "A (Production-Ready)"
    elif score >= 75:
        grade = "B (Minor Issues)"
    elif score >= 50:
        grade = "C (Needs Work)"
    else:
        grade = "D/F (Critical Issues — Do Not Deploy)"

    print(f"\n{'='*65}")
    print(f"OVERALL SECURITY SCORE: {score}/100")
    print(f"SECURITY GRADE: {grade}")
    print(f"{'='*65}")

    # Export
    report = {
        "target": BASE,
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "findings": findings,
        "total_findings": len(findings),
        "severity_counts": sev_counts,
        "score": score,
        "grade": grade,
    }
    out_path = "/tmp/foundit_audit.json"
    with open(out_path, "w") as f:
        json.dump(report, f, indent=2)
    print(f"\nDetailed JSON report saved to: {out_path}")

if __name__ == "__main__":
    asyncio.run(main())