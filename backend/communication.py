"""MyKlick communication provider adapter layer.

Keeps all Exotel-specific logic isolated behind a small interface so the CRM
never talks to a provider directly and the provider can be swapped later.
"""
import os
import uuid
import hmac
import hashlib
import logging
import httpx

logger = logging.getLogger("myklick.comm")


def provider_name() -> str:
    return os.environ.get("COMMUNICATION_PROVIDER", "mock").lower()


# Map raw provider states -> clean MyKlick internal states.
CALL_STATUS_MAP = {
    "queued": "initiated", "initiated": "initiated", "ringing": "ringing",
    "in-progress": "answered", "in_progress": "answered", "answered": "answered",
    "connected": "answered", "completed": "completed", "failed": "failed",
    "busy": "busy", "no-answer": "no-answer", "no_answer": "no-answer",
    "canceled": "failed", "cancelled": "failed",
}
MSG_STATUS_MAP = {
    "accepted": "sent", "queued": "sent", "sent": "sent", "delivered": "delivered",
    "read": "read", "seen": "read", "failed": "failed", "undelivered": "failed",
}
# States that count as a successfully connected call for analytics.
CONNECTED_STATES = {"answered", "completed", "connected"}
TERMINAL_CALL_STATES = {"completed", "failed", "busy", "no-answer"}


def map_call_status(raw: str) -> str:
    return CALL_STATUS_MAP.get((raw or "").lower(), (raw or "unknown").lower())


def map_msg_status(raw: str) -> str:
    return MSG_STATUS_MAP.get((raw or "").lower(), (raw or "unknown").lower())


class CommunicationError(Exception):
    pass


class MockAdapter:
    provider = "mock"

    async def initiate_call(self, from_number, to_number, custom_field=None):
        return {"provider_call_id": f"mock-call-{uuid.uuid4().hex[:12]}",
                "status": "initiated", "raw": {"mock": True}}

    async def send_whatsapp(self, from_number, to_number, text):
        return {"provider_message_id": f"mock-msg-{uuid.uuid4().hex[:12]}",
                "status": "sent", "raw": {"mock": True}}

    async def initiate_ivr_call(self, to_number, app_id, custom_field=None):
        return {"provider_call_id": f"mock-ivr-call-{uuid.uuid4().hex[:12]}",
                "status": "initiated", "raw": {"mock": True}}

    async def get_call_details(self, provider_call_id):
        return {"provider_call_id": provider_call_id,
                "status": "completed", "duration_seconds": 60,
                "recording_url": "https://example.com/recording.mp3",
                "raw": {"mock": True}}

    async def get_number_metadata(self, phone_number):
        return {
            "PhoneNumber": phone_number,
            "Circle": "MH",
            "CircleName": "Maharashtra",
            "Type": "Mobile",
            "Operator": "R",
            "OperatorName": "Reliance",
            "DND": "No"
        }

    async def get_account_balance(self):
        return {
            "Balance": "5000.00",
            "Currency": "INR",
            "PricingPlan": "Mock Plan",
            "DateUpdated": "2024-01-01 00:00:00"
        }


class ExotelAdapter:
    provider = "exotel"

    def __init__(self):
        self.key = os.environ["EXOTEL_API_KEY"]
        self.token = os.environ["EXOTEL_API_TOKEN"]
        self.sid = os.environ["EXOTEL_ACCOUNT_SID"]
        self.voice_base = "https://" + os.environ.get("EXOTEL_VOICE_SUBDOMAIN", "ccm-api.exotel.com")
        self.wa_base = "https://" + os.environ.get("EXOTEL_SUBDOMAIN", "api.exotel.com")
        self.virtual = os.environ.get("EXOTEL_VIRTUAL_NUMBER")
        self.wa_number = os.environ.get("EXOTEL_WHATSAPP_NUMBER")
        self.callback = os.environ.get("PUBLIC_API_BASE", "").rstrip("/")

    async def initiate_call(self, from_number, to_number, custom_field=None):
        payload = {
            "From": from_number or "0000000000",
            "To": to_number,
            "CallerId": self.virtual,
            "Record": "true",
        }
        if custom_field:
            payload["CustomField"] = custom_field
        if self.callback:
            payload["StatusCallback"] = self.callback + "/api/webhooks/exotel/call"
            payload["StatusCallbackContentType"] = "application/json"

        async with httpx.AsyncClient(timeout=20) as c:
            r = await c.post(f"{self.voice_base}/v1/Accounts/{self.sid}/Calls/connect", auth=(self.key, self.token), data=payload)
            if r.status_code >= 400:
                raise CommunicationError(f"Exotel call error {r.status_code}: {r.text}")
            data = r.json()
            call = data.get("response", data.get("Call", data))
            cid = call.get("Sid") or call.get("call_sid")
            return {"provider_call_id": cid,
                    "status": map_call_status(call.get("Status", call.get("call_state", "initiated"))),
                    "raw": data}

    async def initiate_ivr_call(self, to_number, app_id, custom_field=None):
        payload = {
            "From": to_number,
            "CallerId": self.virtual,
            "Url": f"http://my.exotel.com/{self.sid}/exoml/start_voice/{app_id}",
        }
        if custom_field:
            payload["CustomField"] = custom_field
        if self.callback:
            payload["StatusCallback"] = self.callback + "/api/webhooks/exotel/call"
            payload["StatusCallbackContentType"] = "application/json"

        async with httpx.AsyncClient(timeout=20) as c:
            r = await c.post(f"{self.voice_base}/v1/Accounts/{self.sid}/Calls/connect", auth=(self.key, self.token), data=payload)
            if r.status_code >= 400:
                raise CommunicationError(f"Exotel IVR call error {r.status_code}: {r.text}")
            data = r.json()
            call = data.get("Call", data)
            cid = call.get("Sid") or call.get("call_sid")
            return {"provider_call_id": cid,
                    "status": map_call_status(call.get("Status", call.get("call_state", "initiated"))),
                    "raw": data}

    async def get_call_details(self, provider_call_id):
        async with httpx.AsyncClient(timeout=20) as c:
            r = await c.get(f"{self.voice_base}/v1/Accounts/{self.sid}/Calls/{provider_call_id}.json?details=true", auth=(self.key, self.token))
            if r.status_code >= 400:
                raise CommunicationError(f"Exotel call details error {r.status_code}: {r.text}")
            data = r.json()
            call = data.get("Call", data)
            return {
                "provider_call_id": provider_call_id,
                "status": map_call_status(call.get("Status", "")),
                "duration_seconds": int(call.get("Duration") or 0),
                "recording_url": call.get("RecordingUrl"),
                "raw": data
            }

    async def get_number_metadata(self, phone_number):
        async with httpx.AsyncClient(timeout=20) as c:
            r = await c.get(f"{self.wa_base}/v1/Accounts/{self.sid}/Numbers/{phone_number}.json", auth=(self.key, self.token))
            if r.status_code >= 400:
                # If number lookup fails (e.g. non-Indian number), return empty instead of failing the whole app
                return {}
            data = r.json()
            return data.get("Numbers", data)

    async def get_account_balance(self):
        async with httpx.AsyncClient(timeout=20) as c:
            r = await c.get(f"{self.wa_base}/v1/Accounts/{self.sid}/Balance.json", auth=(self.key, self.token))
            if r.status_code >= 400:
                raise CommunicationError(f"Exotel balance error {r.status_code}: {r.text}")
            data = r.json()
            return data.get("Account", {}).get("BalanceData", {})

    async def send_whatsapp(self, from_number, to_number, text):
        payload = {"from": self.wa_number, "to": to_number,
                   "content": {"recipient_type": "individual", "type": "text", "text": {"body": text}}}
        if self.callback:
            payload["status_callback"] = self.callback + "/api/webhooks/exotel/whatsapp"
        async with httpx.AsyncClient(timeout=20) as c:
            r = await c.post(f"{self.wa_base}/v2/accounts/{self.sid}/messages", auth=(self.key, self.token), json=payload)
            if r.status_code >= 400:
                raise CommunicationError(f"Exotel WhatsApp error {r.status_code}")
            data = r.json()
            wa = data.get("whatsapp", data)
            mid = wa.get("message_id") or wa.get("id") or data.get("request_id")
            return {"provider_message_id": mid, "status": "sent", "raw": data}


def get_adapter():
    return ExotelAdapter() if provider_name() == "exotel" else MockAdapter()


def verify_webhook_signature(body: bytes, signature_header: str) -> bool:
    """Validate Exotel webhook HMAC-SHA256 signature when a secret is configured.
    If no secret is set (dev/mock), validation is skipped."""
    secret = os.environ.get("EXOTEL_WEBHOOK_SECRET")
    if not secret:
        return True
    if not signature_header:
        return False
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    candidate = signature_header.split("=")[-1]
    return hmac.compare_digest(expected, candidate)


def redact(d: dict) -> dict:
    """Strip anything secret-looking before logging provider metadata."""
    if not isinstance(d, dict):
        return {}
    bad = ("token", "secret", "password", "auth", "api_key", "apikey", "key")
    return {k: ("***" if any(b in k.lower() for b in bad) else v) for k, v in d.items()}
