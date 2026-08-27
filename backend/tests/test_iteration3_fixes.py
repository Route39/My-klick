"""Iteration-3 regression tests: verifies the specific defects reported in iteration_2 are fixed."""
import os
import uuid
from datetime import datetime, timezone

import pytest
import requests
from dotenv import dotenv_values

_env = dotenv_values("/app/frontend/.env")
BASE = (os.environ.get("REACT_APP_BACKEND_URL") or _env.get("REACT_APP_BACKEND_URL")).rstrip("/")


def _login(email, password="myklick123"):
    r = requests.post(f"{BASE}/api/auth/login", json={"email": email, "password": password}, timeout=30)
    return r


def _hdr(email):
    r = _login(email)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text[:200]}"
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture(scope="module")
def admin():
    return _hdr("support@route39.in")


@pytest.fixture(scope="module")
def sales():
    return _hdr("dhanusha@myklick.in")


# --- FIX 1: team_leader account exists (idempotent seed_team on startup) ---
class TestTeamLeaderAccount:
    def test_team_leader_can_login(self):
        r = _login("leader@myklick.in")
        assert r.status_code == 200, r.text[:300]
        body = r.json()
        assert body["user"]["role"] == "team_leader"
        assert isinstance(body["token"], str) and len(body["token"]) > 20

    def test_team_leader_sees_full_org(self, admin):
        lead = _hdr("leader@myklick.in")
        tl = requests.get(f"{BASE}/api/leads?limit=200", headers=lead, timeout=30)
        ad = requests.get(f"{BASE}/api/leads?limit=200", headers=admin, timeout=30)
        assert tl.status_code == 200 and ad.status_code == 200
        tl_n = len(tl.json() if isinstance(tl.json(), list) else tl.json().get("items", []))
        ad_n = len(ad.json() if isinstance(ad.json(), list) else ad.json().get("items", []))
        assert tl_n == ad_n and tl_n > 1, f"team_leader {tl_n} vs admin {ad_n}"

    def test_all_documented_credentials_work(self):
        for e in ["support@route39.in", "leader@myklick.in", "dhanusha@myklick.in",
                  "arjun@myklick.in", "swathi@myklick.in", "gowri@myklick.in"]:
            assert _login(e).status_code == 200, f"{e} cannot log in"


# --- FIX 2: GET /api/team role scoping ---
class TestTeamScoping:
    def test_sales_sees_only_self(self, sales):
        r = requests.get(f"{BASE}/api/team", headers=sales, timeout=30)
        assert r.status_code == 200, r.text[:200]
        rows = r.json()
        assert isinstance(rows, list) and len(rows) == 1, f"expected 1 row, got {len(rows)}"
        assert "Dhanusha" in rows[0]["name"], rows[0]
        for row in rows:
            assert "_id" not in row

    def test_admin_sees_all(self, admin):
        r = requests.get(f"{BASE}/api/team", headers=admin, timeout=30)
        assert r.status_code == 200
        assert len(r.json()) >= 4

    def test_team_leader_sees_all(self):
        r = requests.get(f"{BASE}/api/team", headers=_hdr("leader@myklick.in"), timeout=30)
        assert r.status_code == 200
        assert len(r.json()) >= 4


# --- FIX 3: whatsapp message_status duplicate contract ---
class TestWhatsAppStatusDuplicate:
    def test_duplicate_status_returns_duplicate_flag(self, admin):
        leads = requests.get(f"{BASE}/api/leads?limit=1", headers=admin, timeout=30).json()
        lead = (leads if isinstance(leads, list) else leads["items"])[0]
        send = requests.post(f"{BASE}/api/leads/{lead['id']}/whatsapp",
                             headers=admin, json={"text": "TEST_dup_status"}, timeout=30)
        assert send.status_code in (200, 201), send.text[:300]
        pid = send.json().get("provider_message_id") or send.json().get("message", {}).get("provider_message_id")
        assert pid, send.json()
        payload = {"type": "message_status", "data": {"message_sid": pid, "status": "delivered"}}
        first = requests.post(f"{BASE}/api/webhooks/exotel/whatsapp", json=payload, timeout=30)
        assert first.status_code == 200, first.text[:200]
        assert first.json().get("duplicate") is not True, first.json()
        second = requests.post(f"{BASE}/api/webhooks/exotel/whatsapp", json=payload, timeout=30)
        assert second.status_code == 200, second.text[:200]
        assert second.json().get("duplicate") is True, second.json()


# --- FIX 4: seeded customers -- no future converted_at, converted_by populated ---
class TestCustomerData:
    def test_no_future_converted_at_and_converted_by_present(self, admin):
        r = requests.get(f"{BASE}/api/customers", headers=admin, timeout=30)
        assert r.status_code == 200, r.text[:200]
        customers = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
        assert len(customers) > 0
        now = datetime.now(timezone.utc)
        future, missing = [], []
        for c in customers:
            assert "_id" not in c
            ca = c.get("converted_at")
            if ca:
                dt = datetime.fromisoformat(str(ca).replace("Z", "+00:00"))
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                if dt > now:
                    future.append((c.get("name"), ca))
            if not c.get("converted_by"):
                missing.append(c.get("name"))
        assert not future, f"customers with future converted_at: {future}"
        assert not missing, f"customers missing converted_by: {missing[:5]}"

    def test_customer_detail_has_converted_by(self, admin):
        customers = requests.get(f"{BASE}/api/customers", headers=admin, timeout=30).json()
        cid = (customers if isinstance(customers, list) else customers["items"])[0]["id"]
        r = requests.get(f"{BASE}/api/customers/{cid}", headers=admin, timeout=30)
        assert r.status_code == 200, r.text[:200]
        d = r.json()
        cust = d.get("customer", d)
        assert cust.get("converted_by"), cust
        for key in ("calls", "messages", "followups", "timeline"):
            assert key in d and isinstance(d[key], list)


# --- FIX 5: 403 on other user's lead (frontend error-state precondition) ---
class TestLeadAccess:
    def test_sales_gets_403_on_other_lead(self, admin, sales):
        leads = requests.get(f"{BASE}/api/leads?limit=200", headers=admin, timeout=30).json()
        leads = leads if isinstance(leads, list) else leads["items"]
        mine = requests.get(f"{BASE}/api/leads?limit=200", headers=sales, timeout=30).json()
        mine = {l["id"] for l in (mine if isinstance(mine, list) else mine["items"])}
        other = next(l for l in leads if l["id"] not in mine)
        r = requests.get(f"{BASE}/api/leads/{other['id']}", headers=sales, timeout=30)
        assert r.status_code == 403, f"expected 403, got {r.status_code}"


# --- Briefing contract used by the fixed Call quick action ---
class TestBriefingContract:
    def test_briefing_items_expose_lead_id(self, admin):
        r = requests.get(f"{BASE}/api/briefing", headers=admin, timeout=30)
        assert r.status_code == 200, r.text[:200]
        d = r.json()
        assert "items" in d
        for it in d["items"]:
            assert it.get("lead_id"), it
            assert "_id" not in it

    def test_call_start_with_briefing_lead_id(self, admin):
        d = requests.get(f"{BASE}/api/briefing", headers=admin, timeout=30).json()
        if not d.get("items"):
            pytest.skip("no briefing items to call")
        lid = d["items"][0]["lead_id"]
        r = requests.post(f"{BASE}/api/leads/{lid}/call", headers=admin, json={}, timeout=30)
        assert r.status_code in (200, 201), f"{r.status_code} {r.text[:200]}"
        call = r.json()
        assert call.get("provider_call_id")
        assert call.get("status") == "initiated"
        cid = call.get("id")
        done = requests.patch(f"{BASE}/api/calls/{cid}/complete", headers=admin,
                             json={"duration": 12, "status": "completed"}, timeout=30)
        assert done.status_code == 200, done.text[:200]
