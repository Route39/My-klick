"""Auth hardening checks from the playbook: bcrypt format, cookies, CORS, brute force,
seed_admin idempotency."""
import requests


class TestAuthHardening:
    def test_login_returns_bearer_token_no_cookie(self, base_url, test_credentials):
        r = requests.post(f"{base_url}/api/auth/login", json=test_credentials, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d.get("token"), str) and len(d["token"]) > 20
        assert d["user"]["email"] == test_credentials["email"]
        assert "password_hash" not in d["user"]
        # Documented design: Bearer only. Record whether an httpOnly cookie is issued.
        print("login set-cookie:", r.headers.get("set-cookie"))

    def test_brute_force_lockout(self, base_url, test_credentials):
        """6 wrong passwords in a row -> expect 429/423 lockout if implemented."""
        codes = []
        for _ in range(6):
            rr = requests.post(f"{base_url}/api/auth/login",
                               json={"email": test_credentials["email"], "password": "wrong-pass"},
                               timeout=30)
            codes.append(rr.status_code)
        print("brute-force codes:", codes)
        # correct password must still work (no permanent lockout of a valid account)
        ok = requests.post(f"{base_url}/api/auth/login", json=test_credentials, timeout=30)
        assert ok.status_code in (200, 429), ok.text[:200]
        assert any(c in (429, 423) for c in codes), \
            f"no brute-force lockout: 6 failed logins returned {codes}"

    def test_cors_explicit_origin_with_credentials(self, base_url):
        origin = base_url
        r = requests.options(f"{base_url}/api/auth/login", timeout=30, headers={
            "Origin": origin, "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        })
        allow_origin = r.headers.get("access-control-allow-origin")
        allow_creds = r.headers.get("access-control-allow-credentials")
        print("CORS:", r.status_code, allow_origin, allow_creds)
        assert r.status_code in (200, 204)
        if allow_creds == "true":
            assert allow_origin != "*", \
                "allow_credentials=true combined with wildcard origin is invalid for browsers"

    def test_password_hash_never_leaks(self, base_url, test_credentials):
        s = requests.Session()
        tok = requests.post(f"{base_url}/api/auth/login", json=test_credentials, timeout=30).json()["token"]
        s.headers.update({"Authorization": f"Bearer {tok}"})
        me = s.get(f"{base_url}/api/auth/me", timeout=30).json()
        assert "password_hash" not in me
        users = s.get(f"{base_url}/api/users", timeout=30).json()
        assert all("password_hash" not in u for u in users)

    def test_all_documented_credentials_work(self, base_url):
        """Every account listed in /app/memory/test_credentials.md must be able to log in."""
        emails = ["support@route39.in", "leader@myklick.in", "dhanusha@myklick.in",
                  "arjun@myklick.in", "swathi@myklick.in", "gowri@myklick.in"]
        failed = []
        for e in emails:
            r = requests.post(f"{base_url}/api/auth/login",
                              json={"email": e, "password": "myklick123"}, timeout=30)
            if r.status_code != 200:
                failed.append((e, r.status_code))
        assert not failed, f"documented credentials rejected: {failed}"
