"""MyKlick CRM backend API regression suite."""
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests

STATUSES = ["new", "contacted", "interested", "follow_up", "converted", "lost"]


# --- Module: auth ---
class TestAuth:
    def test_root(self, base_url):
        r = requests.get(f"{base_url}/api/", timeout=30)
        assert r.status_code == 200
        assert "MyKlick" in r.json()["message"]

    def test_login_success(self, base_url, test_credentials):
        r = requests.post(f"{base_url}/api/auth/login", json=test_credentials, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d["token"], str) and len(d["token"]) > 20
        assert d["user"]["email"] == test_credentials["email"]
        assert d["user"]["role"] == "admin"
        assert "password_hash" not in d["user"]
        assert "_id" not in d["user"]

    def test_login_bad_password(self, base_url, test_credentials):
        r = requests.post(f"{base_url}/api/auth/login",
                          json={"email": test_credentials["email"], "password": "wrongpass"}, timeout=30)
        assert r.status_code == 401

    def test_login_unknown_email(self, base_url):
        r = requests.post(f"{base_url}/api/auth/login",
                          json={"email": "nobody-xyz@example.com", "password": "x"}, timeout=30)
        assert r.status_code == 401

    def test_seeded_sales_user_login(self, base_url):
        r = requests.post(f"{base_url}/api/auth/login",
                          json={"email": "dhanusha@myklick.in", "password": "myklick123"}, timeout=30)
        assert r.status_code == 200
        assert r.json()["user"]["role"] == "sales"

    def test_me_requires_auth(self, base_url):
        r = requests.get(f"{base_url}/api/auth/me", timeout=30)
        assert r.status_code == 401

    def test_me_invalid_token(self, base_url):
        r = requests.get(f"{base_url}/api/auth/me",
                         headers={"Authorization": "Bearer garbage.token.here"}, timeout=30)
        assert r.status_code == 401

    def test_me(self, client, base_url, test_credentials):
        r = client.get(f"{base_url}/api/auth/me", timeout=30)
        assert r.status_code == 200
        assert r.json()["email"] == test_credentials["email"]

    def test_register_duplicate_email(self, base_url, test_credentials):
        r = requests.post(f"{base_url}/api/auth/register", json={
            "name": "Dup", "email": test_credentials["email"], "password": "whatever"}, timeout=30)
        assert r.status_code == 400

    def test_logout(self, client, base_url):
        r = client.post(f"{base_url}/api/auth/logout", timeout=30)
        assert r.status_code == 200
        assert r.json()["ok"] is True


# --- Module: dashboard / activities / team / search ---
class TestDashboard:
    def test_stats(self, client, base_url):
        r = client.get(f"{base_url}/api/dashboard/stats", timeout=60)
        assert r.status_code == 200
        d = r.json()
        for key in ["new_leads", "follow_ups", "calls", "conversions", "funnel", "sources"]:
            assert key in d
        assert d["new_leads"]["total"] > 0
        assert len(d["new_leads"]["spark"]) == 7
        assert set(d["funnel"].keys()) == set(STATUSES)
        assert sum(d["funnel"].values()) == d["new_leads"]["total"]
        assert all("pct" in s for s in d["sources"])

    def test_stats_requires_auth(self, base_url):
        assert requests.get(f"{base_url}/api/dashboard/stats", timeout=30).status_code == 401

    def test_activities(self, client, base_url):
        r = client.get(f"{base_url}/api/activities?limit=10", timeout=30)
        assert r.status_code == 200
        acts = r.json()
        assert len(acts) <= 10 and len(acts) > 0
        assert "_id" not in acts[0]
        assert {"type", "lead_name", "text", "created_at"} <= set(acts[0])

    def test_team(self, client, base_url):
        r = client.get(f"{base_url}/api/team", timeout=60)
        assert r.status_code == 200
        team = r.json()
        assert len(team) >= 4
        m = team[0]
        assert {"name", "leads", "contacted", "converted", "value", "conversion_rate"} <= set(m)
        assert m["converted"] <= m["leads"]

    def test_search(self, client, base_url):
        leads = client.get(f"{base_url}/api/leads", timeout=60).json()
        term = leads[0]["name"][:5]
        r = client.get(f"{base_url}/api/search", params={"q": term}, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert "leads" in d and "customers" in d
        assert any(term.lower() in l["name"].lower() for l in d["leads"])

    def test_search_missing_q(self, client, base_url):
        r = client.get(f"{base_url}/api/search", timeout=30)
        assert r.status_code == 422

    def test_users_list(self, client, base_url):
        r = client.get(f"{base_url}/api/users", timeout=30)
        assert r.status_code == 200
        assert all("password_hash" not in u for u in r.json())


# --- Module: leads CRUD + stage + sub-resources ---
class TestLeads:
    created = []

    def test_list_leads(self, client, base_url):
        r = client.get(f"{base_url}/api/leads", timeout=60)
        assert r.status_code == 200
        leads = r.json()
        assert len(leads) >= 70
        l = leads[0]
        assert {"id", "name", "phone", "source", "status", "value"} <= set(l)
        assert "_id" not in l

    def test_filter_by_status(self, client, base_url):
        r = client.get(f"{base_url}/api/leads", params={"status": "new"}, timeout=60)
        assert r.status_code == 200
        assert all(l["status"] == "new" for l in r.json())

    def test_filter_by_source_and_q(self, client, base_url):
        r = client.get(f"{base_url}/api/leads", params={"source": "website"}, timeout=60)
        assert r.status_code == 200
        assert all(l["source"] == "website" for l in r.json())
        r2 = client.get(f"{base_url}/api/leads", params={"q": "Kumar"}, timeout=60)
        assert r2.status_code == 200

    def test_create_and_get_lead(self, client, base_url):
        payload = {"name": "TEST_Acme Corp", "company": "TEST_Acme", "phone": "+91 9000000001",
                   "source": "manual", "status": "new", "priority": "high", "value": 55000}
        r = client.post(f"{base_url}/api/leads", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        lead = r.json()
        TestLeads.created.append(lead["id"])
        assert lead["name"] == payload["name"]
        assert lead["whatsapp"] == payload["phone"]  # defaults to phone
        assert lead["value"] == 55000
        g = client.get(f"{base_url}/api/leads/{lead['id']}", timeout=30)
        assert g.status_code == 200
        assert g.json()["name"] == payload["name"]
        assert g.json()["priority"] == "high"

    def test_create_lead_validation(self, client, base_url):
        r = client.post(f"{base_url}/api/leads", json={"company": "no name"}, timeout=30)
        assert r.status_code == 422

    def test_get_missing_lead_404(self, client, base_url):
        r = client.get(f"{base_url}/api/leads/{uuid.uuid4()}", timeout=30)
        assert r.status_code == 404

    def test_update_lead_persists(self, client, base_url):
        c = client.post(f"{base_url}/api/leads", json={
            "name": "TEST_Update Me", "phone": "+91 9000000002"}, timeout=30).json()
        TestLeads.created.append(c["id"])
        upd = {"name": "TEST_Updated Name", "phone": "+91 9000000003", "value": 99000,
               "source": "referral", "status": "contacted", "priority": "low"}
        r = client.put(f"{base_url}/api/leads/{c['id']}", json=upd, timeout=30)
        assert r.status_code == 200
        assert r.json()["name"] == "TEST_Updated Name"
        g = client.get(f"{base_url}/api/leads/{c['id']}", timeout=30).json()
        assert g["value"] == 99000 and g["status"] == "contacted" and g["source"] == "referral"

    def test_update_missing_lead_404(self, client, base_url):
        r = client.put(f"{base_url}/api/leads/{uuid.uuid4()}",
                       json={"name": "x", "phone": "1"}, timeout=30)
        assert r.status_code == 404

    def test_stage_change_and_customer_creation(self, client, base_url):
        lead = client.post(f"{base_url}/api/leads", json={
            "name": "TEST_Convert Me", "phone": "+91 9000000004", "value": 120000}, timeout=30).json()
        TestLeads.created.append(lead["id"])
        # new -> contacted
        r = client.patch(f"{base_url}/api/leads/{lead['id']}/stage", json={"status": "contacted"}, timeout=30)
        assert r.status_code == 200 and r.json()["status"] == "contacted"
        # -> converted
        r2 = client.patch(f"{base_url}/api/leads/{lead['id']}/stage", json={"status": "converted"}, timeout=30)
        assert r2.status_code == 200 and r2.json()["status"] == "converted"
        assert client.get(f"{base_url}/api/leads/{lead['id']}", timeout=30).json()["status"] == "converted"
        custs = client.get(f"{base_url}/api/customers", timeout=60).json()
        match = [c for c in custs if c["lead_id"] == lead["id"]]
        assert len(match) == 1, "customer not auto-created on conversion"
        assert match[0]["value"] == 120000
        # idempotent: converting again should not duplicate
        client.patch(f"{base_url}/api/leads/{lead['id']}/stage", json={"status": "converted"}, timeout=30)
        custs2 = client.get(f"{base_url}/api/customers", timeout=60).json()
        assert len([c for c in custs2 if c["lead_id"] == lead["id"]]) == 1
        # timeline contains converted activity
        tl = client.get(f"{base_url}/api/leads/{lead['id']}/timeline", timeout=30).json()
        assert any(a["type"] == "converted" for a in tl)

    def test_stage_invalid_status(self, client, base_url):
        lead = client.get(f"{base_url}/api/leads", timeout=60).json()[0]
        r = client.patch(f"{base_url}/api/leads/{lead['id']}/stage", json={"status": "bogus"}, timeout=30)
        assert r.status_code == 400

    def test_stage_missing_lead_404(self, client, base_url):
        r = client.patch(f"{base_url}/api/leads/{uuid.uuid4()}/stage", json={"status": "new"}, timeout=30)
        assert r.status_code == 404

    def test_calls_flow(self, client, base_url):
        lead = client.post(f"{base_url}/api/leads", json={
            "name": "TEST_Call Lead", "phone": "+91 9000000005"}, timeout=30).json()
        TestLeads.created.append(lead["id"])
        r = client.post(f"{base_url}/api/leads/{lead['id']}/calls",
                        json={"direction": "outgoing", "status": "connected", "duration_seconds": 95}, timeout=30)
        assert r.status_code == 200
        assert r.json()["duration_seconds"] == 95
        calls = client.get(f"{base_url}/api/leads/{lead['id']}/calls", timeout=30).json()
        assert len(calls) == 1 and calls[0]["status"] == "connected"
        tl = client.get(f"{base_url}/api/leads/{lead['id']}/timeline", timeout=30).json()
        assert any(a["type"] == "call" for a in tl)

    def test_call_missing_lead_404(self, client, base_url):
        r = client.post(f"{base_url}/api/leads/{uuid.uuid4()}/calls", json={}, timeout=30)
        assert r.status_code == 404

    def test_whatsapp_flow(self, client, base_url):
        lead = client.post(f"{base_url}/api/leads", json={
            "name": "TEST_WA Lead", "phone": "+91 9000000006"}, timeout=30).json()
        TestLeads.created.append(lead["id"])
        r = client.post(f"{base_url}/api/leads/{lead['id']}/whatsapp",
                        json={"text": "TEST_hello there"}, timeout=30)
        assert r.status_code == 200
        assert r.json()["text"] == "TEST_hello there" and r.json()["status"] == "sent"
        msgs = client.get(f"{base_url}/api/leads/{lead['id']}/messages", timeout=30).json()
        assert len(msgs) == 1 and msgs[0]["direction"] == "outgoing"

    def test_whatsapp_validation(self, client, base_url):
        lead = client.get(f"{base_url}/api/leads", timeout=60).json()[0]
        r = client.post(f"{base_url}/api/leads/{lead['id']}/whatsapp", json={}, timeout=30)
        assert r.status_code == 422

    def test_delete_lead(self, client, base_url):
        lead = client.post(f"{base_url}/api/leads", json={
            "name": "TEST_Delete Me", "phone": "+91 9000000007"}, timeout=30).json()
        r = client.delete(f"{base_url}/api/leads/{lead['id']}", timeout=30)
        assert r.status_code == 200
        assert client.get(f"{base_url}/api/leads/{lead['id']}", timeout=30).status_code == 404

    def test_leads_require_auth(self, base_url):
        assert requests.get(f"{base_url}/api/leads", timeout=30).status_code == 401

    @pytest.fixture(scope="class", autouse=True)
    def cleanup(self, request, client, base_url):
        yield
        for lid in TestLeads.created:
            client.delete(f"{base_url}/api/leads/{lid}", timeout=30)


# --- Module: follow-ups ---
class TestFollowUps:
    def test_list_followups(self, client, base_url):
        r = client.get(f"{base_url}/api/followups", timeout=60)
        assert r.status_code == 200
        fs = r.json()
        assert isinstance(fs, list)
        if fs:
            assert {"lead_name", "reason", "due_at", "overdue", "today"} <= set(fs[0])
            assert all(f["status"] == "pending" for f in fs)

    def test_scope_filters(self, client, base_url):
        for scope in ["today", "overdue", "all"]:
            r = client.get(f"{base_url}/api/followups", params={"scope": scope}, timeout=60)
            assert r.status_code == 200
            if scope == "overdue":
                assert all(f["overdue"] for f in r.json())
            if scope == "today":
                assert all(f["today"] for f in r.json())

    def test_create_complete_reschedule(self, client, base_url):
        lead = client.post(f"{base_url}/api/leads", json={
            "name": "TEST_FU Lead", "phone": "+91 9000000008"}, timeout=30).json()
        due = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
        r = client.post(f"{base_url}/api/leads/{lead['id']}/followups",
                        json={"reason": "TEST_demo call", "due_at": due}, timeout=30)
        assert r.status_code == 200
        fu = r.json()
        assert fu["reason"] == "TEST_demo call" and fu["status"] == "pending"
        # lead next_followup updated
        assert client.get(f"{base_url}/api/leads/{lead['id']}", timeout=30).json()["next_followup"] == due
        lfs = client.get(f"{base_url}/api/leads/{lead['id']}/followups", timeout=30).json()
        assert len(lfs) == 1

        # reschedule
        new_due = (datetime.now(timezone.utc) + timedelta(days=3)).isoformat()
        rr = client.patch(f"{base_url}/api/followups/{fu['id']}/reschedule",
                          json={"due_at": new_due}, timeout=30)
        assert rr.status_code == 200 and rr.json()["due_at"] == new_due

        # complete
        cc = client.patch(f"{base_url}/api/followups/{fu['id']}/complete", timeout=30)
        assert cc.status_code == 200
        after = client.get(f"{base_url}/api/leads/{lead['id']}/followups", timeout=30).json()
        assert after[0]["status"] == "completed" and after[0]["completed_at"]
        pending = client.get(f"{base_url}/api/followups", timeout=60).json()
        assert fu["id"] not in [f["id"] for f in pending]
        client.delete(f"{base_url}/api/leads/{lead['id']}", timeout=30)

    def test_complete_missing_404(self, client, base_url):
        r = client.patch(f"{base_url}/api/followups/{uuid.uuid4()}/complete", timeout=30)
        assert r.status_code == 404

    def test_reschedule_missing_returns_404(self, client, base_url):
        r = client.patch(f"{base_url}/api/followups/{uuid.uuid4()}/reschedule",
                         json={"due_at": datetime.now(timezone.utc).isoformat()}, timeout=30)
        assert r.status_code == 404, "reschedule of unknown follow-up should 404, not crash/200"

    def test_followup_missing_lead_404(self, client, base_url):
        r = client.post(f"{base_url}/api/leads/{uuid.uuid4()}/followups",
                        json={"reason": "x", "due_at": datetime.now(timezone.utc).isoformat()}, timeout=30)
        assert r.status_code == 404


# --- Module: customers ---
class TestCustomers:
    def test_list_customers(self, client, base_url):
        r = client.get(f"{base_url}/api/customers", timeout=60)
        assert r.status_code == 200
        cs = r.json()
        assert len(cs) > 0
        assert {"id", "lead_id", "name", "value", "converted_at"} <= set(cs[0])
        assert "_id" not in cs[0]

    def test_get_customer_detail(self, client, base_url):
        cs = client.get(f"{base_url}/api/customers", timeout=60).json()
        r = client.get(f"{base_url}/api/customers/{cs[0]['id']}", timeout=30)
        assert r.status_code == 200
        d = r.json()
        for k in ["calls", "messages", "timeline"]:
            assert isinstance(d[k], list)

    def test_get_customer_404(self, client, base_url):
        assert client.get(f"{base_url}/api/customers/{uuid.uuid4()}", timeout=30).status_code == 404
