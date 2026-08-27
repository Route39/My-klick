"""Phase 2 tests: communication adapter layer (calls / whatsapp / Exotel webhooks),
role-based access, briefing, customer detail, lead edit history."""
import random
import uuid

import pytest
import requests


# ---------------------------------------------------------------- fixtures
@pytest.fixture(scope="module")
def sales_client(base_url):
    s = requests.Session()
    r = s.post(f"{base_url}/api/auth/login",
               json={"email": "dhanusha@myklick.in", "password": "myklick123"}, timeout=30)
    if r.status_code != 200:
        pytest.fail(f"sales login failed {r.status_code}: {r.text[:300]}")
    s.headers.update({"Content-Type": "application/json",
                      "Authorization": f"Bearer {r.json()['token']}"})
    s.sales_user = r.json()["user"]
    return s


@pytest.fixture(scope="module")
def temp_lead(client, base_url):
    # unique phone so webhook phone-matching cannot collide with another lead
    phone = "98765" + str(random.randint(10000, 99999))
    r = client.post(f"{base_url}/api/leads", json={
        "name": "TEST_Phase2 Lead", "phone": phone, "company": "TEST_Co",
        "value": 10000, "priority": "medium", "status": "new",
    }, timeout=30)
    assert r.status_code == 200, r.text
    lead = r.json()
    yield lead
    client.delete(f"{base_url}/api/leads/{lead['id']}", timeout=30)


# ---------------------------------------------------------------- config
class TestConfig:
    def test_config_admin(self, client, base_url):
        r = client.get(f"{base_url}/api/config", timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["communication_provider"] == "mock"
        assert d["role"] == "admin"

    def test_config_sales(self, sales_client, base_url):
        r = sales_client.get(f"{base_url}/api/config", timeout=30)
        assert r.status_code == 200
        assert r.json()["role"] == "sales"

    def test_config_requires_auth(self, base_url):
        assert requests.get(f"{base_url}/api/config", timeout=30).status_code == 401


# ---------------------------------------------------------------- outbound call
class TestOutboundCall:
    def test_initiate_and_complete(self, client, base_url, temp_lead):
        lid = temp_lead["id"]
        r = client.post(f"{base_url}/api/leads/{lid}/call", timeout=30)
        assert r.status_code == 200, r.text
        call = r.json()
        assert call["provider"] == "mock"
        assert call["provider_call_id"].startswith("mock-call-")
        assert call["status"] == "initiated"
        assert call["direction"] == "outgoing"
        assert call["duration_seconds"] == 0
        assert "_id" not in call

        cid = call["id"]
        r2 = client.patch(f"{base_url}/api/calls/{cid}/complete",
                          json={"duration_seconds": 95, "status": "completed"}, timeout=30)
        assert r2.status_code == 200, r2.text
        done = r2.json()
        assert done["status"] == "completed"
        assert done["duration_seconds"] == 95
        assert done["end_time"]

        # persisted in lead calls
        calls = client.get(f"{base_url}/api/leads/{lid}/calls", timeout=30).json()
        assert any(c["id"] == cid and c["status"] == "completed" for c in calls)

        # timeline activity of type call
        tl = client.get(f"{base_url}/api/leads/{lid}/timeline", timeout=30).json()
        call_acts = [a for a in tl if a["type"] == "call"]
        assert call_acts, "no call activity logged"
        assert call_acts[0]["meta"]["duration"] == "1m 35s"

    def test_initiate_missing_lead_404(self, client, base_url):
        r = client.post(f"{base_url}/api/leads/{uuid.uuid4()}/call", timeout=30)
        assert r.status_code == 404

    def test_complete_missing_call_404(self, client, base_url):
        r = client.patch(f"{base_url}/api/calls/{uuid.uuid4()}/complete",
                         json={"duration_seconds": 5, "status": "completed"}, timeout=30)
        assert r.status_code == 404

    def test_complete_requires_auth(self, base_url):
        r = requests.patch(f"{base_url}/api/calls/{uuid.uuid4()}/complete",
                           json={"duration_seconds": 1}, timeout=30)
        assert r.status_code == 401

    def test_recording_404_when_absent(self, client, base_url, temp_lead):
        call = client.post(f"{base_url}/api/leads/{temp_lead['id']}/call", timeout=30).json()
        r = client.get(f"{base_url}/api/calls/{call['id']}/recording", timeout=30)
        assert r.status_code == 404

    def test_legacy_log_call(self, client, base_url, temp_lead):
        lid = temp_lead["id"]
        r = client.post(f"{base_url}/api/leads/{lid}/calls",
                        json={"direction": "outgoing", "status": "connected", "duration_seconds": 61},
                        timeout=30)
        assert r.status_code == 200, r.text
        c = r.json()
        assert c["provider"] == "manual"
        assert c["status"] == "connected"
        assert c["duration_seconds"] == 61
        calls = client.get(f"{base_url}/api/leads/{lid}/calls", timeout=30).json()
        assert any(x["id"] == c["id"] for x in calls)
        tl = client.get(f"{base_url}/api/leads/{lid}/timeline", timeout=30).json()
        assert any(a["type"] == "call" and "logged" in a["text"] for a in tl)

    def test_legacy_log_call_missing_lead_404(self, client, base_url):
        r = client.post(f"{base_url}/api/leads/{uuid.uuid4()}/calls", json={}, timeout=30)
        assert r.status_code == 404


# ---------------------------------------------------------------- whatsapp send
class TestWhatsAppSend:
    def test_send_via_mock_adapter(self, client, base_url, temp_lead):
        lid = temp_lead["id"]
        text = "TEST_hello from pytest"
        r = client.post(f"{base_url}/api/leads/{lid}/whatsapp", json={"text": text}, timeout=30)
        assert r.status_code == 200, r.text
        m = r.json()
        assert m["provider"] == "mock"
        assert m["provider_message_id"].startswith("mock-msg-")
        assert m["status"] == "sent"
        assert m["direction"] == "outgoing"
        assert m["text"] == text
        msgs = client.get(f"{base_url}/api/leads/{lid}/messages", timeout=30).json()
        assert any(x["id"] == m["id"] for x in msgs)
        tl = client.get(f"{base_url}/api/leads/{lid}/timeline", timeout=30).json()
        assert any(a["type"] == "whatsapp" for a in tl)

    def test_send_missing_text_422(self, client, base_url, temp_lead):
        r = client.post(f"{base_url}/api/leads/{temp_lead['id']}/whatsapp", json={}, timeout=30)
        assert r.status_code == 422


# ---------------------------------------------------------------- call webhook
class TestExotelCallWebhook:
    def test_idempotent_update(self, client, base_url, temp_lead):
        lid = temp_lead["id"]
        call = client.post(f"{base_url}/api/leads/{lid}/call", timeout=30).json()
        sid = call["provider_call_id"]
        before = len([a for a in client.get(f"{base_url}/api/leads/{lid}/timeline", timeout=30).json()
                      if a["type"] == "call"])
        payload = {"CallSid": sid, "Status": "completed", "Duration": "120",
                   "RecordingUrl": "https://x/y.mp3"}
        r1 = requests.post(f"{base_url}/api/webhooks/exotel/call", json=payload, timeout=30)
        assert r1.status_code == 200, r1.text
        assert r1.json().get("duplicate") is not True

        calls = client.get(f"{base_url}/api/leads/{lid}/calls", timeout=30).json()
        updated = next(c for c in calls if c["id"] == call["id"])
        assert updated["status"] == "completed"
        assert updated["duration_seconds"] == 120
        assert updated["recording_url"] == "https://x/y.mp3"

        after = len([a for a in client.get(f"{base_url}/api/leads/{lid}/timeline", timeout=30).json()
                     if a["type"] == "call"])
        assert after == before + 1, "webhook should log exactly one call activity"

        # duplicate delivery
        r2 = requests.post(f"{base_url}/api/webhooks/exotel/call", json=payload, timeout=30)
        assert r2.status_code == 200
        assert r2.json().get("duplicate") is True
        after2 = len([a for a in client.get(f"{base_url}/api/leads/{lid}/timeline", timeout=30).json()
                      if a["type"] == "call"])
        assert after2 == after, "duplicate webhook created a second activity"

        # recording now retrievable
        rec = client.get(f"{base_url}/api/calls/{call['id']}/recording", timeout=30)
        assert rec.status_code == 200
        assert rec.json()["recording_url"] == "https://x/y.mp3"

    def test_incoming_unknown_sid_matches_lead_by_phone(self, client, base_url, temp_lead):
        lid = temp_lead["id"]
        sid = f"unknown-{uuid.uuid4().hex[:10]}"
        payload = {"CallSid": sid, "Status": "completed", "Duration": "45",
                   "Direction": "incoming", "From": "+91" + temp_lead["phone"],
                   "To": "08000000000"}
        r = requests.post(f"{base_url}/api/webhooks/exotel/call", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        calls = client.get(f"{base_url}/api/leads/{lid}/calls", timeout=30).json()
        inc = [c for c in calls if c["provider_call_id"] == sid]
        assert inc, "incoming call not attached to lead"
        assert inc[0]["direction"] == "incoming"
        assert inc[0]["duration_seconds"] == 45
        tl = client.get(f"{base_url}/api/leads/{lid}/timeline", timeout=30).json()
        assert any("incoming call" in a["text"] for a in tl)

    def test_missing_callsid_400(self, base_url):
        r = requests.post(f"{base_url}/api/webhooks/exotel/call", json={"Status": "completed"}, timeout=30)
        assert r.status_code == 400

    def test_webhook_is_public(self, base_url):
        """Webhook must not require the CRM bearer token."""
        r = requests.post(f"{base_url}/api/webhooks/exotel/call",
                          json={"CallSid": f"nolead-{uuid.uuid4().hex[:8]}", "Status": "failed"}, timeout=30)
        assert r.status_code == 200


# ---------------------------------------------------------------- whatsapp webhook
class TestExotelWhatsAppWebhook:
    def test_inbound_message_idempotent(self, client, base_url, temp_lead):
        lid = temp_lead["id"]
        sid = f"wamid-{uuid.uuid4().hex[:10]}"
        payload = {"type": "inbound_message", "data": {
            "message_sid": sid, "from": "+91" + temp_lead["phone"],
            "message": {"text": {"body": "TEST_inbound hi"}},
        }}
        r1 = requests.post(f"{base_url}/api/webhooks/exotel/whatsapp", json=payload, timeout=30)
        assert r1.status_code == 200, r1.text
        assert r1.json().get("duplicate") is not True
        msgs = client.get(f"{base_url}/api/leads/{lid}/messages", timeout=30).json()
        got = [m for m in msgs if m.get("provider_message_id") == sid]
        assert got, "inbound message not stored against lead"
        assert got[0]["direction"] == "incoming"
        assert got[0]["text"] == "TEST_inbound hi"

        r2 = requests.post(f"{base_url}/api/webhooks/exotel/whatsapp", json=payload, timeout=30)
        assert r2.status_code == 200
        assert r2.json().get("duplicate") is True
        msgs2 = client.get(f"{base_url}/api/leads/{lid}/messages", timeout=30).json()
        assert len([m for m in msgs2 if m.get("provider_message_id") == sid]) == 1

    def test_message_status_updates_existing(self, client, base_url, temp_lead):
        lid = temp_lead["id"]
        sent = client.post(f"{base_url}/api/leads/{lid}/whatsapp",
                           json={"text": "TEST_status track"}, timeout=30).json()
        mid = sent["provider_message_id"]
        payload = {"type": "message_status", "data": {"message_sid": mid, "status": "delivered"}}
        r = requests.post(f"{base_url}/api/webhooks/exotel/whatsapp", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        msgs = client.get(f"{base_url}/api/leads/{lid}/messages", timeout=30).json()
        m = next(x for x in msgs if x["id"] == sent["id"])
        assert m["status"] == "delivered"

        # read status
        payload2 = {"type": "message_status", "data": {"message_sid": mid, "status": "read"}}
        assert requests.post(f"{base_url}/api/webhooks/exotel/whatsapp",
                             json=payload2, timeout=30).status_code == 200
        msgs = client.get(f"{base_url}/api/leads/{lid}/messages", timeout=30).json()
        assert next(x for x in msgs if x["id"] == sent["id"])["status"] == "read"

    def test_status_duplicate_reports_duplicate(self, client, base_url, temp_lead):
        lid = temp_lead["id"]
        sent = client.post(f"{base_url}/api/leads/{lid}/whatsapp",
                           json={"text": "TEST_dup status"}, timeout=30).json()
        mid = sent["provider_message_id"]
        payload = {"type": "message_status", "data": {"message_sid": mid, "status": "delivered"}}
        requests.post(f"{base_url}/api/webhooks/exotel/whatsapp", json=payload, timeout=30)
        r2 = requests.post(f"{base_url}/api/webhooks/exotel/whatsapp", json=payload, timeout=30)
        assert r2.status_code == 200
        assert r2.json().get("duplicate") is True

    def test_missing_message_id_400(self, base_url):
        r = requests.post(f"{base_url}/api/webhooks/exotel/whatsapp",
                          json={"type": "inbound_message", "data": {"from": "9999999999"}}, timeout=30)
        assert r.status_code == 400

    def test_verification_challenge(self, base_url):
        r = requests.post(f"{base_url}/api/webhooks/exotel/whatsapp",
                          json={"type": "verification", "challenge": "abc123"}, timeout=30)
        assert r.status_code == 200
        assert r.json()["challenge"] == "abc123"


# ---------------------------------------------------------------- lead edit history
class TestLeadEditHistory:
    def test_edit_logs_activities(self, client, base_url, temp_lead):
        lid = temp_lead["id"]
        users = client.get(f"{base_url}/api/users", timeout=30).json()
        target = next(u for u in users if u["email"] == "arjun@myklick.in")
        body = {
            "name": temp_lead["name"], "company": temp_lead["company"], "phone": temp_lead["phone"],
            "whatsapp": temp_lead.get("whatsapp", ""), "email": "", "location": "", "product": "",
            "source": temp_lead["source"], "status": temp_lead["status"],
            "priority": "high", "assigned_to": target["id"], "value": 55000, "notes": "TEST_edited",
        }
        r = client.put(f"{base_url}/api/leads/{lid}", json=body, timeout=30)
        assert r.status_code == 200, r.text
        upd = r.json()
        assert upd["value"] == 55000
        assert upd["priority"] == "high"
        assert upd["assigned_to"] == target["id"]
        assert upd["assigned_name"] == target["name"]

        tl = client.get(f"{base_url}/api/leads/{lid}/timeline", timeout=30).json()
        edits = [a for a in tl if a["type"] == "edit"]
        fields = {a["meta"].get("field") for a in edits}
        assert {"value", "assigned", "priority"} <= fields, f"missing edit activities: {fields}"
        val_edit = next(a for a in edits if a["meta"]["field"] == "value")
        assert val_edit["meta"]["to"] == 55000

        # GET verifies persistence
        got = client.get(f"{base_url}/api/leads/{lid}", timeout=30).json()
        assert got["value"] == 55000 and got["priority"] == "high"


# ---------------------------------------------------------------- briefing
class TestBriefing:
    def test_briefing_admin(self, client, base_url):
        r = client.get(f"{base_url}/api/briefing", timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert set(d.keys()) >= {"user_name", "counts", "items"}
        assert set(d["counts"].keys()) == {"overdue", "high_priority", "today"}
        for k, v in d["counts"].items():
            assert isinstance(v, int) and v >= 0
        assert isinstance(d["items"], list)
        assert len(d["items"]) <= 8
        if d["items"]:
            it = d["items"][0]
            assert set(it.keys()) >= {"lead_id", "name", "status", "priority", "phone", "bucket"}
            assert it["bucket"] in ("overdue", "today", "high")

    def test_briefing_sales_scoped(self, sales_client, client, base_url):
        s = sales_client.get(f"{base_url}/api/briefing", timeout=30)
        assert s.status_code == 200
        sd = s.json()
        ad = client.get(f"{base_url}/api/briefing", timeout=30).json()
        assert sd["counts"]["high_priority"] <= ad["counts"]["high_priority"]
        # every item must belong to the sales user
        for it in sd["items"]:
            lead = sales_client.get(f"{base_url}/api/leads/{it['lead_id']}", timeout=30)
            assert lead.status_code == 200, f"briefing exposed inaccessible lead {it['lead_id']}"

    def test_briefing_requires_auth(self, base_url):
        assert requests.get(f"{base_url}/api/briefing", timeout=30).status_code == 401


# ---------------------------------------------------------------- customer detail
class TestCustomerDetail:
    def test_detail_arrays(self, client, base_url):
        cs = client.get(f"{base_url}/api/customers", timeout=30).json()
        assert cs, "no customers seeded"
        cid = cs[0]["id"]
        r = client.get(f"{base_url}/api/customers/{cid}", timeout=30)
        assert r.status_code == 200
        c = r.json()
        assert "_id" not in c
        for key in ("calls", "messages", "followups", "timeline"):
            assert isinstance(c[key], list), f"{key} missing/not a list"
        assert c["id"] == cid
        assert c["lead_id"]
        assert "value" in c

    def test_detail_404(self, client, base_url):
        assert client.get(f"{base_url}/api/customers/{uuid.uuid4()}", timeout=30).status_code == 404

    def test_detail_requires_auth(self, base_url):
        assert requests.get(f"{base_url}/api/customers/x", timeout=30).status_code == 401


# ---------------------------------------------------------------- role isolation
class TestRoleIsolation:
    def test_sales_sees_only_own_leads(self, sales_client, client, base_url):
        admin_leads = client.get(f"{base_url}/api/leads?limit=500", timeout=30).json()
        sales_leads = sales_client.get(f"{base_url}/api/leads?limit=500", timeout=30).json()
        assert len(sales_leads) < len(admin_leads), "sales sees as many leads as admin"
        uid = sales_client.sales_user["id"]
        assert all(l["assigned_to"] == uid for l in sales_leads)

    def test_sales_403_on_other_lead(self, sales_client, client, base_url):
        uid = sales_client.sales_user["id"]
        admin_leads = client.get(f"{base_url}/api/leads?limit=500", timeout=30).json()
        other = next(l for l in admin_leads if l.get("assigned_to") and l["assigned_to"] != uid)
        r = sales_client.get(f"{base_url}/api/leads/{other['id']}", timeout=30)
        assert r.status_code == 403, f"expected 403 got {r.status_code}"
        # sub-resources must also be blocked
        for sub in ("timeline", "calls", "messages", "followups"):
            rr = sales_client.get(f"{base_url}/api/leads/{other['id']}/{sub}", timeout=30)
            assert rr.status_code == 403, f"{sub} leaked to sales user ({rr.status_code})"

    def test_sales_cannot_delete(self, sales_client, base_url):
        own = sales_client.get(f"{base_url}/api/leads?limit=5", timeout=30).json()
        assert own
        r = sales_client.delete(f"{base_url}/api/leads/{own[0]['id']}", timeout=30)
        assert r.status_code == 403
        # still exists
        assert sales_client.get(f"{base_url}/api/leads/{own[0]['id']}", timeout=30).status_code == 200

    def test_sales_cannot_call_other_lead(self, sales_client, client, base_url):
        uid = sales_client.sales_user["id"]
        admin_leads = client.get(f"{base_url}/api/leads?limit=500", timeout=30).json()
        other = next(l for l in admin_leads if l.get("assigned_to") and l["assigned_to"] != uid)
        assert sales_client.post(f"{base_url}/api/leads/{other['id']}/call", timeout=30).status_code == 403
        assert sales_client.post(f"{base_url}/api/leads/{other['id']}/whatsapp",
                                 json={"text": "TEST_x"}, timeout=30).status_code == 403

    def test_admin_sees_org_leads(self, client, base_url):
        leads = client.get(f"{base_url}/api/leads?limit=500", timeout=30).json()
        assert len(leads) >= 50
        assert all(l.get("organization_id", "org_myklick") == "org_myklick" for l in leads)

    def test_team_endpoint_scoped_for_sales(self, sales_client, base_url):
        """A sales rep must not see the whole org's performance/revenue."""
        rows = sales_client.get(f"{base_url}/api/team", timeout=30).json()
        uid = sales_client.sales_user["id"]
        assert all(r["id"] == uid for r in rows), \
            f"/api/team leaks {len(rows)} org members' leads/revenue to a sales user"

    def test_dashboard_stats_scoped_for_sales(self, sales_client, client, base_url):
        s = sales_client.get(f"{base_url}/api/dashboard/stats", timeout=30).json()
        a = client.get(f"{base_url}/api/dashboard/stats", timeout=30).json()
        assert s["new_leads"]["total"] < a["new_leads"]["total"]
        assert s["calls"]["total"] <= a["calls"]["total"]

    def test_customers_scoped_for_sales(self, sales_client, client, base_url):
        s = sales_client.get(f"{base_url}/api/customers", timeout=30).json()
        a = client.get(f"{base_url}/api/customers", timeout=30).json()
        assert len(s) <= len(a)
        uid = sales_client.sales_user["id"]
        assert all(c.get("assigned_to") == uid for c in s)

    def test_team_leader_full_access(self, base_url, client):
        s = requests.Session()
        r = s.post(f"{base_url}/api/auth/login",
                   json={"email": "leader@myklick.in", "password": "myklick123"}, timeout=30)
        assert r.status_code == 200
        s.headers.update({"Authorization": f"Bearer {r.json()['token']}"})
        tl_leads = s.get(f"{base_url}/api/leads?limit=500", timeout=30).json()
        admin_leads = client.get(f"{base_url}/api/leads?limit=500", timeout=30).json()
        assert len(tl_leads) == len(admin_leads)
