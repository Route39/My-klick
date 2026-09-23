from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import logging
import uuid
import random
import time
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from typing import List, Optional

from fastapi import FastAPI, APIRouter, HTTPException, Request, Depends, BackgroundTasks, Response, UploadFile, File
from fastapi.staticfiles import StaticFiles
import shutil
import uuid
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field

import communication as comm

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------
mongo_url = os.environ['MONGO_URL']
import certifi
client = AsyncIOMotorClient(mongo_url, tlsCAFile=certifi.where())
db = client[os.environ['DB_NAME']]

app = FastAPI(title="MyKlick CRM")
api = APIRouter(prefix="/api")

JWT_ALGORITHM = "HS256"
DEFAULT_ORG = "org_myklick"

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("myklick")

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def now_iso():
    return datetime.now(timezone.utc).isoformat()

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False

def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]

def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id, "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(days=7), "type": "access",
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)

def clean(doc: dict) -> dict:
    doc.pop("_id", None)
    doc.pop("password_hash", None)
    return doc

def norm_phone(p: str) -> str:
    d = "".join(ch for ch in (p or "") if ch.isdigit())
    return d[-10:] if len(d) >= 10 else d

def org_of(user: dict) -> str:
    return user.get("organization_id") or DEFAULT_ORG

def is_manager(user: dict) -> bool:
    return user.get("role") in ("admin", "team_leader")

def scope_leads(user: dict, base: dict = None) -> dict:
    """Organisation + role scoping for lead queries."""
    q = dict(base or {})
    q["organization_id"] = org_of(user)
    if not is_manager(user):
        q["assigned_to"] = user["id"]
    return q

async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        user = await db.users.find_one({"id": payload["sub"]})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return clean(user)
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=401, detail=f"Auth error: {str(e)}")

async def lead_or_403(lead_id: str, user: dict) -> dict:
    """Fetch a lead enforcing org isolation + sales-can-only-see-assigned."""
    lead = await db.leads.find_one({"id": lead_id})
    if not lead or lead.get("organization_id", DEFAULT_ORG) != org_of(user):
        raise HTTPException(status_code=404, detail="Lead not found")
    if not is_manager(user):
        # Staff can access leads they are assigned to OR leads they created
        can_access = (
            lead.get("assigned_to") == user["id"] or
            lead.get("created_by") == user["id"]
        )
        if not can_access:
            raise HTTPException(status_code=403, detail="You don't have access to this lead")
    return lead

async def find_lead_by_phone(number: str, org: str = DEFAULT_ORG):
    last10 = norm_phone(number)
    if not last10:
        return None
    return await db.leads.find_one({"organization_id": org, "phone_norm": last10})

async def log_integration(kind: str, meta: dict):
    """Server-side integration log for debugging (never stores secrets)."""
    try:
        await db.integration_logs.insert_one({
            "id": str(uuid.uuid4()), "kind": kind,
            "meta": comm.redact(meta or {}), "created_at": now_iso(),
        })
    except Exception:
        pass

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class TeamMemberUpdate(BaseModel):
    name: str
    phone: str
    email: str = ""
    role: str

class TeamMemberIn(BaseModel):
    name: str
    email: str = ""
    phone: str = ""
    password: str = ""
    role: str = "sales"

class RegisterIn(BaseModel):
    name: str
    email: str = ""
    phone: str = ""
    password: str = ""
    role: str = "sales"

class LoginIn(BaseModel):
    username: str
    password: str

class LeadIn(BaseModel):
    name: str
    company: Optional[str] = ""
    phone: str
    whatsapp: Optional[str] = ""
    email: Optional[str] = ""
    location: Optional[str] = ""
    product: Optional[str] = ""
    source: str = "manual"
    status: str = "new"
    priority: str = "medium"
    segment: str = "investor"
    assigned_to: Optional[str] = None
    value: float = 0
    notes: Optional[str] = ""
    no_of_vehicles: Optional[str] = ""
    remarks: Optional[str] = ""
    rc: Optional[str] = ""
    aadhaar_url: Optional[str] = ""
    pan_url: Optional[str] = ""
    license_url: Optional[str] = ""

class StageIn(BaseModel):
    status: str

class FollowUpIn(BaseModel):
    reason: str
    due_at: str
    assigned_to: Optional[str] = None

class RescheduleIn(BaseModel):
    due_at: str

class CallCompleteIn(BaseModel):
    duration_seconds: int = 0
    status: str = "completed"

class LegacyCallIn(BaseModel):
    direction: str = "outgoing"
    status: str = "connected"
    duration_seconds: int = 0

class MessageIn(BaseModel):
    text: str
    direction: str = "outgoing"

STATUSES = ["new", "contacted", "rnr", "interested", "follow_up", "converted", "lost"]

# ---------------------------------------------------------------------------
# Activity logger
# ---------------------------------------------------------------------------
async def log_activity(atype: str, lead: dict, user: dict, text: str, meta: dict = None):
    doc = {
        "id": str(uuid.uuid4()), "type": atype,
        "organization_id": lead.get("organization_id", DEFAULT_ORG),
        "lead_id": lead.get("id"), "lead_name": lead.get("name"),
        "user_id": user.get("id") if user else None,
        "user_name": user.get("name") if user else "System",
        "user_avatar": user.get("avatar") if user else None,
        "text": text, "meta": meta or {}, "created_at": now_iso(),
    }
    await db.activities.insert_one(dict(doc))
    return clean(doc)

# ---------------------------------------------------------------------------
# Auth endpoints
# ---------------------------------------------------------------------------
@api.post("/auth/register")
async def register(body: RegisterIn):
    email = body.email.lower().strip() if body.email else ""
    if email:
        if await db.users.find_one({"email": email}):
            pass # allow duplicate empty emails, handled by removing unique index
    user = {
        "id": str(uuid.uuid4()), "name": body.name, "email": email, "phone": body.phone,
        "password_hash": hash_password(body.password or "password123"),
        "role": body.role if body.role in ("admin", "team_leader", "sales") else "sales",
        "organization_id": DEFAULT_ORG, "avatar": None, "created_at": now_iso(),
    }
    await db.users.insert_one(dict(user))
    token = create_access_token(user["id"], email)
    return {"token": token, "user": clean(user)}

@api.post("/auth/login")
async def login(body: LoginIn):
    username = body.username.lower().strip()
    user = await db.users.find_one({"$or": [{"email": username}, {"phone": username}]})
    if not user or not verify_password(body.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid username, email or password")
    
    user_id = user.get("id")
    if not user_id:
        user_id = str(user["_id"])
        await db.users.update_one({"_id": user["_id"]}, {"$set": {"id": user_id}})
        user["id"] = user_id

    token = create_access_token(user_id, user.get("email", ""))
    return {"token": token, "user": clean(user)}
    cleaned = clean(user)
    if "id" not in cleaned:
        cleaned["id"] = u_id
    return {"token": token, "user": cleaned}

@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user

@api.post("/auth/logout")
async def logout(user: dict = Depends(get_current_user)):
    return {"ok": True}

# ---------------------------------------------------------------------------
# Team
# ---------------------------------------------------------------------------
@api.get("/users")
async def list_users(user: dict = Depends(get_current_user)):
    users = await db.users.find({"organization_id": org_of(user)}).to_list(200)
    return [clean(u) for u in users]

@api.post("/team")
async def add_team_member(body: TeamMemberIn, user: dict = Depends(get_current_user)):
    if not is_manager(user):
        raise HTTPException(status_code=403, detail="Not authorized")
        
    existing = await db.users.find_one({"phone": body.phone.strip()})
    if existing:
        raise HTTPException(status_code=400, detail="A user with this phone/username already exists.")
        
    doc = {
        "id": str(uuid.uuid4()), "name": body.name, "email": body.email.lower().strip(), "phone": body.phone.strip(),
        "password_hash": hash_password(body.password or "password123"),
        "role": body.role if body.role in ("admin", "team_leader", "sales") else "sales",
        "organization_id": org_of(user), "avatar": None, "created_at": now_iso(),
    }
    await db.users.insert_one(dict(doc))
    return clean(doc)

@api.delete("/team/{user_id}")
async def delete_team_member(user_id: str, user: dict = Depends(get_current_user)):
    if not is_manager(user):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    target_user = await db.users.find_one({"id": user_id, "organization_id": org_of(user)})
    if target_user:
        await db.users.delete_one({"id": user_id, "organization_id": org_of(user)})
    return {"ok": True}

@api.put("/team/{user_id}")
async def update_team_member(user_id: str, body: TeamMemberUpdate, user: dict = Depends(get_current_user)):
    if not is_manager(user) and user["id"] != user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    update_data = {
        "name": body.name,
        "phone": body.phone.strip(),
        "email": body.email.lower().strip(),
        "role": body.role if body.role in ("admin", "team_leader", "sales") else "sales"
    }
    
    await db.users.update_one(
        {"id": user_id, "organization_id": org_of(user)},
        {"$set": update_data}
    )
    return {"ok": True}

@api.get("/team")
async def team_performance(user: dict = Depends(get_current_user)):
    users = await db.users.find({"organization_id": org_of(user)}).to_list(200)
    if not is_manager(user):
        users = [u for u in users if u.get("id") == user.get("id")]
    out = []
    for u in users:
        u_id = u.get("id") or str(u.get("_id", ""))
        leads = await db.leads.find({"assigned_to": u_id}).to_list(2000)
        total = len(leads)
        contacted = len([l for l in leads if l.get("status") != "new"])
        converted = len([l for l in leads if l.get("status") == "converted"])
        value = sum(l.get("value", 0) for l in leads if l.get("status") == "converted")
        rate = round((converted / total) * 100) if total else 0
        out.append({
            "id": u_id, "name": u.get("name", "Unknown"), "role": u.get("role", "sales"), "avatar": u.get("avatar"),
            "phone": u.get("phone", ""), "email": u.get("email", ""),
            "leads": total, "contacted": contacted, "converted": converted,
            "value": value, "conversion_rate": rate,
        })
    out.sort(key=lambda x: x["converted"], reverse=True)
    return out

# ---------------------------------------------------------------------------
# Leads
# ---------------------------------------------------------------------------
@api.get("/leads")
async def list_leads(
    status: Optional[str] = None, exclude_status: Optional[str] = None, source: Optional[str] = None,
    assigned_to: Optional[str] = None, q: Optional[str] = None, segment: Optional[str] = None,
    date_from: Optional[str] = None, date_to: Optional[str] = None, user: dict = Depends(get_current_user),
):
    base = {}
    
    if date_from or date_to:
        created_filter = {}
        if date_from:
            created_filter["$gte"] = date_from + "T00:00:00.000Z"
        if date_to:
            created_filter["$lte"] = date_to + "T23:59:59.999Z"
        if created_filter:
            base["created_at"] = created_filter

    if segment:
        base["segment"] = segment
    if status:
        base["status"] = status
    elif exclude_status:
        base["status"] = {"$ne": exclude_status}
    if source:
        base["source"] = source
    if assigned_to and is_manager(user):
        base["assigned_to"] = assigned_to
    if q:
        base["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"company": {"$regex": q, "$options": "i"}},
            {"phone": {"$regex": q, "$options": "i"}},
        ]
    leads = await db.leads.find(scope_leads(user, base)).sort("updated_at", -1).to_list(2000)
    return [clean(l) for l in leads]

@api.get("/leads/{lead_id}")
async def get_lead(lead_id: str, user: dict = Depends(get_current_user)):
    return clean(await lead_or_403(lead_id, user))

import asyncio

import asyncio

async def enrich_lead_metadata(lead_id: str, phone: str):
    """Fetches telecom info (DND, Operator) in the background and saves to the lead."""
    adapter = comm.get_adapter()
    try:
        # Exotel Number Metadata API only accepts 10-digit numbers, so strip the +91 if present
        clean_phone = phone.replace("+91", "").replace(" ", "")[-10:]
        meta = await adapter.get_number_metadata(clean_phone)
        if meta and meta.get("DND"):
            upd = {
                "dnd_status": meta.get("DND"),
                "operator": meta.get("OperatorName", ""),
                "circle": meta.get("CircleName", ""),
            }
            await db.leads.update_one({"id": lead_id}, {"$set": upd})
            lead = await db.leads.find_one({"id": lead_id})
            # Log the enrichment
            if upd["dnd_status"] == "Yes":
                await log_activity("metadata", lead, {"id": "system", "name": "System"}, "detected DND enabled for this number.")
    except Exception:
        pass  # Fail gracefully in the background

@api.get("/leads/{lead_id}/metadata")
async def get_lead_metadata(lead_id: str, user: dict = Depends(get_current_user)):
    """Manually fetch and sync the number metadata for a lead."""
    lead = await lead_or_403(lead_id, user)
    clean_phone = lead["phone"].replace("+91", "").replace(" ", "")[-10:]
    adapter = comm.get_adapter()
    try:
        meta = await adapter.get_number_metadata(clean_phone)
        if meta and meta.get("DND"):
            upd = {
                "dnd_status": meta.get("DND"),
                "operator": meta.get("OperatorName", ""),
                "circle": meta.get("CircleName", ""),
            }
            await db.leads.update_one({"id": lead_id}, {"$set": upd})
            return upd
        return {"error": "Metadata not found or number invalid."}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

@api.post("/leads")
async def create_lead(body: LeadIn, user: dict = Depends(get_current_user)):
    try:
        assigned = None
        if body.assigned_to:
            assigned = await db.users.find_one({"id": body.assigned_to})
        elif not is_manager(user):
            # Auto-assign to the creator if they are not a manager
            assigned = user

        actual_assigned_to = assigned.get("id") if assigned else None
        actual_assigned_name = assigned.get("name") if assigned else None

        lead = {
            "id": str(uuid.uuid4()), "organization_id": org_of(user),
            "name": body.name, "company": body.company or "",
            "phone": body.phone, "phone_norm": norm_phone(body.phone),
            "whatsapp": body.whatsapp or body.phone,
            "email": body.email or "", "location": body.location or "", "product": body.product or "",
            "source": body.source, "status": body.status, "priority": body.priority,
            "segment": body.segment,
            "assigned_to": actual_assigned_to, "assigned_name": actual_assigned_name,
            "value": body.value, "notes": body.notes or "", "next_followup": None,
            "no_of_vehicles": body.no_of_vehicles or "", "remarks": body.remarks or "",
            "rc": body.rc or "", "aadhaar_url": body.aadhaar_url or "",
            "pan_url": body.pan_url or "", "license_url": body.license_url or "",
            "created_by": user.get("id"), "created_by_name": user.get("name", ""),
            "created_at": now_iso(), "updated_at": now_iso(),
        }
        
        if body.status == "follow_up":
            due = (datetime.now(timezone.utc) + timedelta(days=1)).replace(hour=10, minute=0, second=0, microsecond=0)
            lead["next_followup"] = due.isoformat()
            fu = {
                "id": str(uuid.uuid4()), "organization_id": org_of(user), "lead_id": lead["id"],
                "lead_name": lead["name"], "reason": "System auto-scheduled from lead creation",
                "assigned_to": lead["assigned_to"], "assigned_name": lead["assigned_name"],
                "status": "pending", "due_at": lead["next_followup"],
                "created_at": now_iso(), "updated_at": now_iso()
            }
            await db.followups.insert_one(dict(fu))

        await db.leads.insert_one(dict(lead))
        await log_activity("lead_created", lead, user, "created a new lead")
        
        # Trigger background metadata lookup
        asyncio.create_task(enrich_lead_metadata(lead["id"], lead["phone"]))
        
        return clean(lead)
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Server error: {str(e)}\n{traceback.format_exc()}")
@api.put("/leads/{lead_id}")
async def update_lead(lead_id: str, body: LeadIn, user: dict = Depends(get_current_user)):
    lead = await lead_or_403(lead_id, user)
    assigned = None
    if body.assigned_to:
        assigned = await db.users.find_one({"id": body.assigned_to})
    update = body.model_dump()
    update["assigned_name"] = assigned["name"] if assigned else None
    update["whatsapp"] = body.whatsapp or body.phone
    update["phone_norm"] = norm_phone(body.phone)
    update["updated_at"] = now_iso()
    old_status = lead.get("status")
    # Track where the lead was before entering follow_up so we can restore it later
    if body.status == "follow_up" and old_status != "follow_up":
        update["pre_followup_status"] = old_status
    elif old_status == "follow_up" and body.status != "follow_up":
        update["pre_followup_status"] = None
    await db.leads.update_one({"id": lead_id}, {"$set": update})

    # Record meaningful edits in the timeline.
    if body.value != lead.get("value"):
        await log_activity("edit", lead, user, "changed lead value",
                           {"from": lead.get("value"), "to": body.value, "field": "value"})
    if body.assigned_to != lead.get("assigned_to"):
        await log_activity("edit", lead, user, "reassigned lead",
                           {"from": lead.get("assigned_name"), "to": update["assigned_name"], "field": "assigned"})
    if body.priority != lead.get("priority"):
        await log_activity("edit", lead, user, "changed priority",
                           {"from": lead.get("priority"), "to": body.priority, "field": "priority"})

    new = await db.leads.find_one({"id": lead_id})
    if new.get("status") == "follow_up" and lead.get("status") != "follow_up":
        await maybe_auto_schedule_followup(new, user)
    # NOTE: We do NOT delete pending followups when leaving follow_up — dates persist on all cards
    return clean(new)

@api.patch("/leads/{lead_id}/stage")
async def change_stage(lead_id: str, body: StageIn, user: dict = Depends(get_current_user)):
    if body.status not in STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")
    lead = await lead_or_403(lead_id, user)
    old = lead.get("status")
    update_fields = {"status": body.status, "updated_at": now_iso()}
    # When moving INTO follow_up, save where we came from
    if body.status == "follow_up" and old != "follow_up":
        update_fields["pre_followup_status"] = old
    # When moving OUT of follow_up, clear the saved status
    elif old == "follow_up" and body.status != "follow_up":
        update_fields["pre_followup_status"] = None
    await db.leads.update_one({"id": lead_id}, {"$set": update_fields})
    lead["status"] = body.status
    if body.status == "converted" and old != "converted":
        await log_activity("converted", lead, user, "converted a lead", {"value": lead.get("value", 0)})
        existing = await db.customers.find_one({"lead_id": lead_id})
        if not existing:
            await db.customers.insert_one({
                "id": str(uuid.uuid4()), "organization_id": org_of(user), "lead_id": lead_id,
                "name": lead["name"], "company": lead.get("company", ""),
                "phone": lead["phone"], "whatsapp": lead.get("whatsapp", ""),
                "email": lead.get("email", ""), "location": lead.get("location", ""),
                "source": lead.get("source"), "value": lead.get("value", 0),
                "segment": lead.get("segment"),
                "assigned_to": lead.get("assigned_to"), "assigned_name": lead.get("assigned_name"),
                "converted_by": user.get("name"), "converted_at": now_iso(),
            })
    else:
        await log_activity("status_change", lead, user, f"moved lead {old} → {body.status}",
                           {"from": old, "to": body.status})
        if old == "converted" and body.status != "converted":
            await db.customers.delete_one({"lead_id": lead_id})
            
    if body.status == "follow_up" and old != "follow_up":
        await maybe_auto_schedule_followup(lead, user)
    # NOTE: We do NOT delete pending followups when leaving follow_up — dates persist on all cards

    new = await db.leads.find_one({"id": lead_id})
    return clean(new)

async def maybe_auto_schedule_followup(lead: dict, user: dict):
    pending = await db.followups.find_one({"lead_id": lead["id"], "status": "pending"})
    if not pending:
        due = (datetime.now(timezone.utc) + timedelta(days=1)).replace(hour=10, minute=0, second=0, microsecond=0)
        fu = {
            "id": str(uuid.uuid4()), "organization_id": org_of(user), "lead_id": lead["id"],
            "lead_name": lead["name"], "reason": "System auto-scheduled from status change",
            "assigned_to": lead.get("assigned_to"), "assigned_name": lead.get("assigned_name"),
            "status": "pending", "due_at": due.isoformat(),
            "created_at": now_iso(), "updated_at": now_iso()
        }
        await db.followups.insert_one(dict(fu))
        await db.leads.update_one({"id": lead["id"]}, {"$set": {"next_followup": due.isoformat()}})

@api.delete("/leads/{lead_id}")
async def delete_lead(lead_id: str, user: dict = Depends(get_current_user)):
    await lead_or_403(lead_id, user)
    await db.leads.delete_one({"id": lead_id})
    await db.activities.delete_many({"lead_id": lead_id})
    await db.calls.delete_many({"lead_id": lead_id})
    await db.messages.delete_many({"lead_id": lead_id})
    await db.followups.delete_many({"lead_id": lead_id})
    return {"ok": True}

@api.get("/leads/{lead_id}/timeline")
async def lead_timeline(lead_id: str, user: dict = Depends(get_current_user)):
    await lead_or_403(lead_id, user)
    acts = await db.activities.find({"lead_id": lead_id}).sort("created_at", -1).to_list(500)
    return [clean(a) for a in acts]

@api.get("/leads/{lead_id}/messages")
async def lead_messages(lead_id: str, user: dict = Depends(get_current_user)):
    await lead_or_403(lead_id, user)
    msgs = await db.messages.find({"lead_id": lead_id}).sort("created_at", 1).to_list(500)
    return [clean(m) for m in msgs]

@api.get("/leads/{lead_id}/calls")
async def lead_calls(lead_id: str, user: dict = Depends(get_current_user)):
    await lead_or_403(lead_id, user)
    calls = await db.calls.find({"lead_id": lead_id}).sort("created_at", -1).to_list(500)
    return [clean(c) for c in calls]

@api.get("/leads/{lead_id}/followups")
async def lead_followups(lead_id: str, user: dict = Depends(get_current_user)):
    await lead_or_403(lead_id, user)
    fs = await db.followups.find({"lead_id": lead_id}).sort("due_at", 1).to_list(500)
    return [clean(f) for f in fs]

# ---------------------------------------------------------------------------
# Calls (via communication service)
# ---------------------------------------------------------------------------
@api.post("/leads/{lead_id}/call")
async def initiate_call(lead_id: str, user: dict = Depends(get_current_user)):
    lead = await lead_or_403(lead_id, user)
    adapter = comm.get_adapter()
    agent_phone = user.get("phone")
    if not agent_phone or agent_phone.strip() == "":
        raise HTTPException(status_code=400, detail="Please add your number on your profile")

    try:
        # Remove spaces, dashes, parentheses to ensure Exotel accepts it perfectly
        agent_phone = "".join([c for c in agent_phone if c.isdigit() or c == "+"])
        
        result = await adapter.initiate_call(
            from_number=agent_phone,
            to_number=lead["phone"], custom_field=lead_id,
        )
    except comm.CommunicationError:
        await log_integration("call_error", {"lead_id": lead_id, "provider": adapter.provider})
        raise HTTPException(status_code=502, detail="Unable to connect the call right now. Please try again.")

    call = {
        "id": str(uuid.uuid4()), "organization_id": org_of(user), "lead_id": lead_id,
        "segment": lead.get("segment", "investor"),
        "provider": adapter.provider, "provider_call_id": result.get("provider_call_id"),
        "direction": "outgoing", "status": result.get("status", "initiated"),
        "from_number": agent_phone, "to_number": lead["phone"],
        "duration_seconds": 0, "recording_url": None,
        "user_id": user.get("id"), "user_name": user.get("name"),
        "start_time": now_iso(), "end_time": None, "created_at": now_iso(),
    }
    await db.calls.insert_one(dict(call))
    await log_integration("call_initiated", {"lead_id": lead_id, "provider_call_id": call["provider_call_id"], "provider": adapter.provider})
    return clean(call)

@api.post("/leads/{lead_id}/ivr")
async def initiate_ivr(lead_id: str, user: dict = Depends(get_current_user)):
    lead = await lead_or_403(lead_id, user)
    app_id = os.environ.get("EXOTEL_IVR_APP_ID")
    if not app_id:
        raise HTTPException(status_code=400, detail="IVR Applet ID is not configured (EXOTEL_IVR_APP_ID)")
        
    adapter = comm.get_adapter()
    try:
        result = await adapter.initiate_ivr_call(
            to_number=lead["phone"], app_id=app_id, custom_field=lead_id,
        )
    except comm.CommunicationError as e:
        await log_integration("ivr_error", {"lead_id": lead_id, "provider": adapter.provider, "error": str(e)})
        raise HTTPException(status_code=502, detail="Unable to trigger IVR flow right now.")

    call = {
        "id": str(uuid.uuid4()), "organization_id": org_of(user), "lead_id": lead_id,
        "segment": lead.get("segment", "investor"),
        "provider": adapter.provider, "provider_call_id": result.get("provider_call_id"),
        "direction": "outgoing-ivr", "status": result.get("status", "initiated"),
        "from_number": os.environ.get("EXOTEL_VIRTUAL_NUMBER", ""), "to_number": lead["phone"],
        "duration_seconds": 0, "recording_url": None,
        "user_id": user.get("id"), "user_name": user.get("name"),
        "start_time": now_iso(), "end_time": None, "created_at": now_iso(),
    }
    await db.calls.insert_one(dict(call))
    await log_integration("ivr_initiated", {"lead_id": lead_id, "provider_call_id": call["provider_call_id"], "provider": adapter.provider})
    return clean(call)

@api.patch("/calls/{call_id}/complete")
async def complete_call(call_id: str, body: CallCompleteIn, user: dict = Depends(get_current_user)):
    call = await db.calls.find_one({"id": call_id})
    if not call or call.get("organization_id", DEFAULT_ORG) != org_of(user):
        raise HTTPException(status_code=404, detail="Call not found")
    status = comm.map_call_status(body.status)
    await db.calls.update_one({"id": call_id}, {"$set": {
        "status": status, "duration_seconds": body.duration_seconds, "end_time": now_iso(),
    }})
    lead = await db.leads.find_one({"id": call["lead_id"]})
    if lead and not call.get("activity_logged"):
        mins, secs = divmod(body.duration_seconds, 60)
        await log_activity("call", lead, user, f"completed a {call['direction']} call",
                           {"duration": f"{mins}m {secs}s", "status": status,
                            "duration_seconds": body.duration_seconds})
        
        # Auto-update lead status
        new_status = lead.get("status")
        if body.duration_seconds == 0:
            new_status = "Ring Not Response"
        elif body.duration_seconds > 0 and lead.get("status") in ("New", "Ring Not Response"):
            new_status = "Contacted"
        
        if new_status != lead.get("status"):
            await db.leads.update_one({"id": lead["id"]}, {"$set": {"status": new_status, "updated_at": now_iso()}})
        await db.calls.update_one({"id": call_id}, {"$set": {"activity_logged": True}})
    new = await db.calls.find_one({"id": call_id})
    return clean(new)

@api.get("/calls/{call_id}/sync")
async def sync_call(call_id: str, user: dict = Depends(get_current_user)):
    """Fetches real-time call status and recording URL directly from Exotel API."""
    call = await db.calls.find_one({"id": call_id})
    if not call or call.get("organization_id", DEFAULT_ORG) != org_of(user):
        raise HTTPException(status_code=404, detail="Call not found")
    
    if not call.get("provider_call_id") or call.get("provider") != "exotel":
        raise HTTPException(status_code=400, detail="Not an Exotel call")

    adapter = comm.get_adapter()
    try:
        details = await adapter.get_call_details(call["provider_call_id"])
    except comm.CommunicationError as e:
        raise HTTPException(status_code=502, detail=str(e))

    upd = {
        "status": details["status"],
        "duration_seconds": details.get("duration_seconds", call.get("duration_seconds", 0))
    }
    if details.get("recording_url"):
        upd["recording_url"] = details["recording_url"]
    if upd["status"] in comm.TERMINAL_CALL_STATES and not call.get("end_time"):
        upd["end_time"] = now_iso()

    await db.calls.update_one({"id": call_id}, {"$set": upd})
    
    # If newly completed, log the activity
    if upd["status"] in comm.TERMINAL_CALL_STATES and not call.get("activity_logged"):
        lead = await db.leads.find_one({"id": call["lead_id"]})
        if lead:
            mins, secs = divmod(upd["duration_seconds"], 60)
            await log_activity("call", lead, user, f"logged a {call.get('direction', 'outgoing')} call (synced)",
                               {"duration": f"{mins}m {secs}s", "status": upd["status"], "duration_seconds": upd["duration_seconds"]})
            await db.calls.update_one({"id": call_id}, {"$set": {"activity_logged": True}})

    new = await db.calls.find_one({"id": call_id})
    return clean(new)

@api.get("/calls/{call_id}/recording")
async def call_recording(call_id: str, user: dict = Depends(get_current_user)):
    call = await db.calls.find_one({"id": call_id})
    if not call or call.get("organization_id", DEFAULT_ORG) != org_of(user):
        raise HTTPException(status_code=404, detail="Call not found")
    if not is_manager(user) and call.get("user_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Not authorized to access this recording")
    if not call.get("recording_url"):
        raise HTTPException(status_code=404, detail="No recording available")
    return {"recording_url": call["recording_url"]}

@api.post("/leads/{lead_id}/calls")
async def log_call(lead_id: str, body: LegacyCallIn, user: dict = Depends(get_current_user)):
    """Directly log a completed call (manual entry / backward-compatible)."""
    lead = await lead_or_403(lead_id, user)
    call = {
        "id": str(uuid.uuid4()), "organization_id": org_of(user), "lead_id": lead_id,
        "provider": "manual", "provider_call_id": f"manual-{uuid.uuid4().hex[:10]}",
        "direction": body.direction, "status": body.status,
        "from_number": "", "to_number": lead["phone"], "duration_seconds": body.duration_seconds,
        "recording_url": None, "user_id": user.get("id"), "user_name": user.get("name"),
        "activity_logged": True, "start_time": now_iso(), "end_time": now_iso(), "created_at": now_iso(),
    }
    await db.calls.insert_one(dict(call))
    mins, secs = divmod(body.duration_seconds, 60)
    await log_activity("call", lead, user, f"logged a {body.direction} call",
                       {"duration": f"{mins}m {secs}s", "status": body.status, "duration_seconds": body.duration_seconds})
    return clean(call)

# ---------------------------------------------------------------------------
# WhatsApp (via communication service)
# ---------------------------------------------------------------------------
@api.post("/leads/{lead_id}/whatsapp")
async def send_whatsapp(lead_id: str, body: MessageIn, user: dict = Depends(get_current_user)):
    lead = await lead_or_403(lead_id, user)
    adapter = comm.get_adapter()
    try:
        result = await adapter.send_whatsapp(
            from_number=os.environ.get("EXOTEL_WHATSAPP_NUMBER") or None,
            to_number=lead.get("whatsapp") or lead["phone"], text=body.text,
        )
    except comm.CommunicationError:
        await log_integration("whatsapp_error", {"lead_id": lead_id, "provider": adapter.provider})
        raise HTTPException(status_code=502, detail="Message could not be sent. Please try again.")

    msg = {
        "id": str(uuid.uuid4()), "organization_id": org_of(user), "lead_id": lead_id,
        "provider": adapter.provider, "provider_message_id": result.get("provider_message_id"),
        "direction": "outgoing", "type": "text", "text": body.text,
        "status": result.get("status", "sent"), "media_url": None,
        "user_id": user["id"], "created_at": now_iso(),
    }
    await db.messages.insert_one(dict(msg))
    await log_activity("whatsapp", lead, user, "sent a WhatsApp message", {"text": body.text[:60]})
    await log_integration("whatsapp_sent", {"lead_id": lead_id, "provider_message_id": msg["provider_message_id"], "provider": adapter.provider})
    return clean(msg)

# ---------------------------------------------------------------------------
# Webhooks (Exotel) — idempotent
# ---------------------------------------------------------------------------
async def _once(event_key: str, payload: dict) -> bool:
    try:
        await db.webhook_events.insert_one({
            "event_key": event_key, "payload": comm.redact(payload) if isinstance(payload, dict) else {},
            "received_at": now_iso(),
        })
        return True
    except Exception as e:
        if "E11000" in str(e) or "duplicate" in str(e).lower():
            return False
        raise

@api.post("/webhooks/exotel/call")
async def webhook_call(request: Request):
    body = await request.body()
    if not comm.verify_webhook_signature(body, request.headers.get("X-Exotel-Signature", "")):
        raise HTTPException(status_code=401, detail="Invalid webhook signature")
    try:
        payload = await request.json()
    except Exception:
        form = await request.form()
        payload = dict(form)

    call_id = payload.get("CallSid") or payload.get("call_sid") or \
        (payload.get("response", {}) or {}).get("call_sid")
    if not call_id:
        raise HTTPException(status_code=400, detail="Missing CallSid")
    raw_status = payload.get("Status") or payload.get("status") or "unknown"
    status = comm.map_call_status(raw_status)

    if not await _once(f"voice:{call_id}:{status}", payload):
        return {"ok": True, "duplicate": True}

    call = await db.calls.find_one({"provider_call_id": call_id})
    duration = payload.get("Duration") or payload.get("duration") or 0
    try:
        duration = int(duration)
    except Exception:
        duration = 0
    recording = payload.get("RecordingUrl") or payload.get("recording_url")

    if not call:
        # Incoming call from an unknown provider id -> match by phone.
        direction = (payload.get("Direction") or "incoming").lower()
        from_num = payload.get("From") or payload.get("from") or ""
        to_num = payload.get("To") or payload.get("to") or ""
        lead = await find_lead_by_phone(from_num)
        call = {
            "id": str(uuid.uuid4()), "organization_id": DEFAULT_ORG,
            "lead_id": lead["id"] if lead else None,
            "provider": "exotel", "provider_call_id": call_id,
            "direction": "incoming" if "in" in direction else "outgoing",
            "status": status, "from_number": from_num, "to_number": to_num,
            "duration_seconds": duration, "recording_url": recording,
            "user_id": None, "user_name": None,
            "start_time": now_iso(), "end_time": now_iso() if status in comm.TERMINAL_CALL_STATES else None,
            "created_at": now_iso(),
        }
        await db.calls.insert_one(dict(call))
        if lead:
            label = "missed" if status in ("no-answer", "busy", "failed") else status
            await log_activity("call", lead, {"id": None, "name": lead.get("assigned_name") or "System"},
                               f"received an incoming call ({label})",
                               {"duration_seconds": duration, "status": status, "direction": "incoming"})
    else:
        upd = {"status": status}
        if duration:
            upd["duration_seconds"] = duration
        if recording:
            upd["recording_url"] = recording
        if status in comm.TERMINAL_CALL_STATES:
            upd["end_time"] = now_iso()
        await db.calls.update_one({"id": call["id"]}, {"$set": upd})
        lead = await db.leads.find_one({"id": call.get("lead_id")}) if call.get("lead_id") else None
        if lead and status in comm.TERMINAL_CALL_STATES and not call.get("activity_logged"):
            mins, secs = divmod(duration, 60)
            label = "Connected" if status in comm.CONNECTED_STATES else status
            await log_activity("call", lead, {"id": call.get("user_id"), "name": call.get("user_name") or "System"},
                               f"{call['direction']} call · {label}",
                               {"duration": f"{mins}m {secs}s", "status": status, "duration_seconds": duration})
            await db.calls.update_one({"id": call["id"]}, {"$set": {"activity_logged": True}})
    await log_integration("call_webhook", {"provider_call_id": call_id, "status": status})
    return {"ok": True}

@api.post("/webhooks/exotel/whatsapp")
async def webhook_whatsapp(request: Request):
    body = await request.body()
    if not comm.verify_webhook_signature(body, request.headers.get("X-Exotel-Signature", "")):
        raise HTTPException(status_code=401, detail="Invalid webhook signature")
    payload = await request.json()
    if payload.get("type") == "verification":
        return {"challenge": payload.get("challenge")}

    data = payload.get("data", payload.get("message", payload)) or {}
    msg_id = data.get("message_sid") or data.get("message_id") or data.get("id")
    if not msg_id:
        raise HTTPException(status_code=400, detail="Missing message id")
    event = payload.get("type", payload.get("event", "event"))

    # Status update for an outbound message we already stored.
    if event in ("message_status", "status") or data.get("status"):
        status = comm.map_msg_status(data.get("status"))
        fresh = await _once(f"wa:{msg_id}:{status}", payload)
        if fresh:
            await db.messages.update_one({"provider_message_id": msg_id}, {"$set": {"status": status}})
        await log_integration("whatsapp_webhook", {"provider_message_id": msg_id, "status": status})
        return {"ok": True} if fresh else {"ok": True, "duplicate": True}

    # Inbound message.
    if not await _once(f"wa-in:{msg_id}", payload):
        return {"ok": True, "duplicate": True}
    from_num = data.get("from") or ""
    text = ""
    m = data.get("message", {})
    if isinstance(m, dict):
        text = (m.get("text") or {}).get("body", "") if isinstance(m.get("text"), dict) else m.get("body", "")
    lead = await find_lead_by_phone(from_num)
    msg = {
        "id": str(uuid.uuid4()), "organization_id": DEFAULT_ORG,
        "lead_id": lead["id"] if lead else None,
        "provider": "exotel", "provider_message_id": msg_id,
        "direction": "incoming", "type": "text", "text": text,
        "status": "delivered", "media_url": None, "from_number": from_num,
        "created_at": now_iso(),
    }
    await db.messages.insert_one(dict(msg))
    if lead:
        await log_activity("whatsapp", lead, {"id": None, "name": "Lead"}, "sent an incoming WhatsApp message", {"text": text[:60]})
    await log_integration("whatsapp_inbound", {"provider_message_id": msg_id, "matched": bool(lead)})
    return {"ok": True}

class ManualCallIn(BaseModel):
    from_number: str
    to_number: str
    segment: Optional[str] = None

@api.get("/exotel/calls")
async def get_exotel_calls(
    segment: Optional[str] = None, 
    date_from: Optional[str] = None, 
    date_to: Optional[str] = None,
    staff_id: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    q = {"provider": "exotel", "organization_id": org_of(user)}
    
    if segment:
        q["segment"] = segment
        
    if date_from or date_to:
        created_filter = {}
        if date_from:
            created_filter["$gte"] = date_from + "T00:00:00.000Z"
        if date_to:
            created_filter["$lte"] = date_to + "T23:59:59.999Z"
        if created_filter:
            q["created_at"] = created_filter

    if is_manager(user):
        if staff_id and staff_id != "all":
            q["user_id"] = staff_id
    else:
        q["user_id"] = user["id"]
        
    calls = await db.calls.find(q).sort("created_at", -1).to_list(1000)
    return [clean(c) for c in calls]

@api.post("/exotel/manual_call")
async def initiate_manual_call(body: ManualCallIn, user: dict = Depends(get_current_user)):
    adapter = comm.get_adapter()
    from_num = "".join([c for c in body.from_number if c.isdigit() or c == "+"])
    to_num = "".join([c for c in body.to_number if c.isdigit() or c == "+"])
    try:
        result = await adapter.initiate_call(
            from_number=from_num,
            to_number=to_num,
            custom_field="manual"
        )
    except comm.CommunicationError as e:
        raise HTTPException(status_code=502, detail=f"Exotel error: {str(e)}")

    call = {
        "id": str(uuid.uuid4()), "organization_id": org_of(user), "lead_id": None,
        "provider": adapter.provider, "provider_call_id": result.get("provider_call_id"),
        "direction": "outgoing", "status": result.get("status", "initiated"),
        "from_number": body.from_number, "to_number": body.to_number,
        "duration_seconds": 0, "recording_url": None,
        "user_id": user.get("id"), "user_name": user.get("name"),
        "start_time": now_iso(), "end_time": None, "created_at": now_iso(),
    }
    await db.calls.insert_one(dict(call))
    return clean(call)

@api.get("/webhooks/exotel/dynamic-connect")
async def exotel_dynamic_connect(request: Request):
    """Dynamic Connect Applet: returns comma separated phone numbers to dial."""
    # Placeholder: connect to the default admin phone number or a specific agent
    return Response(content="+919999999999", media_type="text/plain")

@api.post("/webhooks/exotel/passthru")
async def exotel_passthru(request: Request):
    """Passthru Applet: Return 200 OK or 302 Found based on caller."""
    form = await request.form()
    from_num = form.get("From", "")
    lead = await find_lead_by_phone(from_num)
    if lead:
        # Caller is a known lead, return 200 to route them differently
        return Response(status_code=200)
    else:
        # Caller is unknown, return 302
        return Response(status_code=302)

@api.get("/webhooks/exotel/dynamic-sms")
async def exotel_dynamic_sms(request: Request):
    """Dynamic SMS Applet: returns the SMS text to send."""
    from_num = request.query_params.get("From", "")
    lead = await find_lead_by_phone(from_num)
    if lead:
        text = f"Hi {lead.get('name', 'there')}, someone from our team will be with you shortly!"
    else:
        text = "Thanks for calling! A representative will call you back."
    return Response(content=text, media_type="text/plain")

# ---------------------------------------------------------------------------
# Follow-ups
# ---------------------------------------------------------------------------
@api.post("/leads/{lead_id}/followups")
async def create_followup(lead_id: str, body: FollowUpIn, user: dict = Depends(get_current_user)):
    lead = await lead_or_403(lead_id, user)
    assigned = None
    if body.assigned_to:
        assigned = await db.users.find_one({"id": body.assigned_to})
    fu = {
        "id": str(uuid.uuid4()), "organization_id": org_of(user),
        "lead_id": lead_id, "lead_name": lead["name"], "reason": body.reason, "due_at": body.due_at,
        "assigned_to": assigned.get("id") if assigned else lead.get("assigned_to"),
        "assigned_name": assigned.get("name") if assigned else lead.get("assigned_name"),
        "status": "pending", "created_at": now_iso(), "completed_at": None,
    }
    await db.followups.insert_one(dict(fu))
    await db.leads.update_one({"id": lead_id}, {"$set": {"status": "follow_up", "next_followup": body.due_at, "updated_at": now_iso()}})
    await log_activity("followup_created", lead, user, "scheduled a follow-up", {"due_at": body.due_at})
    return clean(fu)

@api.get("/followups")
async def list_followups(scope: str = "all", segment: Optional[str] = None, user: dict = Depends(get_current_user)):
    base = {"status": "pending", "organization_id": org_of(user)}
    if not is_manager(user):
        base["assigned_to"] = user["id"]
    if segment:
        leads = await db.leads.find({"segment": segment}).to_list(None)
        lead_ids = [l["id"] for l in leads]
        base["lead_id"] = {"$in": lead_ids}
    fs = await db.followups.find(base).sort("due_at", 1).to_list(1000)
    now = datetime.now(timezone.utc)
    out = []
    for f in fs:
        try:
            due = datetime.fromisoformat(f["due_at"])
        except Exception:
            continue
        overdue = due < now
        today = due.date() == now.date()
        if scope == "today" and not today:
            continue
        if scope == "overdue" and not overdue:
            continue
        item = clean(f)
        item["overdue"] = overdue
        item["today"] = today
        # Enrich with lead data — and SKIP if lead is no longer in follow_up status
        lead = await db.leads.find_one({"id": f["lead_id"]})
        if not lead or lead.get("status") != "follow_up":
            # Clean up the stale follow-up record from the database
            await db.followups.delete_one({"id": f["id"]})
            continue
        item["lead_phone"] = lead.get("phone")
        item["lead_value"] = lead.get("value")
        item["lead_status"] = lead.get("status")
        item["lead_name"] = lead.get("name")
        out.append(item)
    return out

@api.patch("/followups/{fu_id}/complete")
async def complete_followup(fu_id: str, user: dict = Depends(get_current_user)):
    fu = await db.followups.find_one({"id": fu_id})
    if not fu or fu.get("organization_id", DEFAULT_ORG) != org_of(user):
        raise HTTPException(status_code=404, detail="Follow-up not found")
    await db.followups.update_one({"id": fu_id}, {"$set": {"status": "completed", "completed_at": now_iso()}})
    lead = await db.leads.find_one({"id": fu["lead_id"]}) or {"id": fu["lead_id"], "name": fu["lead_name"]}
    # Move lead out of follow_up stage into contacted
    if lead.get("status") == "follow_up":
        restore_status = lead.get("pre_followup_status") or "new"
        await db.leads.update_one({"id": fu["lead_id"]},
            {"$set": {"status": restore_status, "pre_followup_status": None, "updated_at": now_iso()}})
    await log_activity("followup_completed", lead, user, "completed a follow-up")
    return {"ok": True}

@api.patch("/followups/{fu_id}/reschedule")
async def reschedule_followup(fu_id: str, body: RescheduleIn, user: dict = Depends(get_current_user)):
    fu = await db.followups.find_one({"id": fu_id})
    if not fu or fu.get("organization_id", DEFAULT_ORG) != org_of(user):
        raise HTTPException(status_code=404, detail="Follow-up not found")
    await db.followups.update_one({"id": fu_id}, {"$set": {"due_at": body.due_at}})
    fu = await db.followups.find_one({"id": fu_id})
    await db.leads.update_one({"id": fu["lead_id"]}, {"$set": {"next_followup": body.due_at}})
    return clean(fu)

@api.delete("/followups/{fu_id}")
async def delete_followup(fu_id: str, user: dict = Depends(get_current_user)):
    fu = await db.followups.find_one({"id": fu_id})
    if not fu or fu.get("organization_id", DEFAULT_ORG) != org_of(user):
        raise HTTPException(status_code=404, detail="Follow-up not found")
    await db.followups.delete_one({"id": fu_id})
    # Check if lead has any other pending follow-ups
    other_pending = await db.followups.find_one(
        {"lead_id": fu["lead_id"], "status": "pending"},
        sort=[("due_at", 1)]
    )
    lead = await db.leads.find_one({"id": fu["lead_id"]})
    if not other_pending:
        # No more pending follow-ups — restore lead to where it was BEFORE entering follow_up
        if lead and lead.get("status") == "follow_up":
            restore_status = lead.get("pre_followup_status") or "new"
            await db.leads.update_one(
                {"id": fu["lead_id"]},
                {"$set": {"status": restore_status, "pre_followup_status": None, "next_followup": None, "updated_at": now_iso()}}
            )
    else:
        # Still has pending follow-ups — update next_followup to the earliest remaining
        await db.leads.update_one(
            {"id": fu["lead_id"]},
            {"$set": {"next_followup": other_pending["due_at"], "updated_at": now_iso()}}
        )
    return {"ok": True}

# ---------------------------------------------------------------------------
# Briefing
# ---------------------------------------------------------------------------
@api.get("/briefing")
async def briefing(segment: Optional[str] = None, user: dict = Depends(get_current_user)):
    # Scope followups by segment if provided
    base = {"status": "pending", "organization_id": org_of(user)}
    if not is_manager(user):
        base["assigned_to"] = user["id"]
    if segment:
        seg_leads = await db.leads.find({"segment": segment, "organization_id": org_of(user)}).to_list(None)
        base["lead_id"] = {"$in": [l["id"] for l in seg_leads]}
    
    fs = await db.followups.find(base).sort("due_at", 1).to_list(1000)
    now = datetime.now(timezone.utc)
    today = now.date()

    overdue, today_list = [], []
    for f in fs:
        try:
            due = datetime.fromisoformat(f["due_at"])
        except Exception:
            continue
        (overdue if due < now else today_list).append((due, f))
    today_only = [x for x in today_list if x[0].date() == today]

    lead_scope = {"priority": "high", "status": {"$nin": ["converted", "lost"]}}
    if segment:
        lead_scope["segment"] = segment
    lead_scope = scope_leads(user, lead_scope)
    high_leads = await db.leads.find(lead_scope).to_list(500)

    # Prioritise: overdue -> today -> high-priority interested leads.
    picks = []
    seen = set()

    async def enrich(lead_id, fu=None):
        lead = await db.leads.find_one({"id": lead_id})
        if not lead:
            return None
        last_act = await db.activities.find({"lead_id": lead_id}).sort("created_at", -1).to_list(1)
        last_call = await db.calls.find({"lead_id": lead_id}).sort("created_at", -1).to_list(1)
        lc = last_call[0] if last_call else None
        return {
            "lead_id": lead_id, "name": lead["name"], "status": lead["status"],
            "priority": lead.get("priority"), "phone": lead["phone"],
            "assigned_name": lead.get("assigned_name"),
            "followup_id": fu["id"] if fu else None,
            "followup_at": fu["due_at"] if fu else None,
            "reason": fu["reason"] if fu else None,
            "last_contact": last_act[0]["created_at"] if last_act else None,
            "last_call": f"{lc['duration_seconds']//60}m {lc['duration_seconds']%60}s" if lc and lc.get("duration_seconds") else None,
        }

    for _, f in overdue + today_only:
        if f["lead_id"] in seen:
            continue
        seen.add(f["lead_id"])
        item = await enrich(f["lead_id"], f)
        if item:
            item["bucket"] = "overdue" if (_, f) in overdue else "today"
            picks.append(item)
        if len(picks) >= 8:
            break
    if len(picks) < 8:
        for lead in high_leads:
            if lead["id"] in seen:
                continue
            seen.add(lead["id"])
            item = await enrich(lead["id"])
            if item:
                item["bucket"] = "high"
                picks.append(item)
            if len(picks) >= 8:
                break

    return {
        "user_name": user.get("name"),
        "counts": {"overdue": len(overdue), "high_priority": len(high_leads), "today": len(today_only)},
        "items": picks,
    }

# ---------------------------------------------------------------------------
# Customers
# ---------------------------------------------------------------------------
@api.get("/customers")
async def list_customers(segment: Optional[str] = None, user: dict = Depends(get_current_user)):
    base = {"organization_id": org_of(user)}
    if not is_manager(user):
        base["assigned_to"] = user["id"]
    if segment:
        base["segment"] = segment
    cs = await db.customers.find(base).sort("converted_at", -1).to_list(1000)
    return [clean(c) for c in cs]

@api.get("/customers/{cid}")
async def get_customer(cid: str, user: dict = Depends(get_current_user)):
    c = await db.customers.find_one({"id": cid})
    if not c or c.get("organization_id", DEFAULT_ORG) != org_of(user):
        raise HTTPException(status_code=404, detail="Customer not found")
    if not is_manager(user) and c.get("assigned_to") != user["id"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    c = clean(c)
    lid = c["lead_id"]
    c["calls"] = [clean(x) for x in await db.calls.find({"lead_id": lid}).sort("created_at", -1).to_list(500)]
    c["messages"] = [clean(x) for x in await db.messages.find({"lead_id": lid}).sort("created_at", 1).to_list(500)]
    c["followups"] = [clean(x) for x in await db.followups.find({"lead_id": lid}).sort("due_at", 1).to_list(500)]
    c["timeline"] = [clean(x) for x in await db.activities.find({"lead_id": lid}).sort("created_at", -1).to_list(500)]
    return c

# ---------------------------------------------------------------------------
# Activities / Search
# ---------------------------------------------------------------------------
@api.get("/activities")
async def activities(limit: int = 20, segment: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = {"organization_id": org_of(user)}
    if not is_manager(user):
        q["user_id"] = user["id"]
    if segment:
        seg_leads = await db.leads.find({"segment": segment, "organization_id": org_of(user)}).to_list(None)
        seg_lead_ids = [l["id"] for l in seg_leads]
        q["lead_id"] = {"$in": seg_lead_ids}
    acts = await db.activities.find(q).sort("created_at", -1).to_list(limit)
    return [clean(a) for a in acts]

@api.get("/search")
async def search(q: str, segment: str = "", user: dict = Depends(get_current_user)):
    if not q or len(q) < 1:
        return {"leads": [], "customers": []}
    regex = {"$regex": q, "$options": "i"}
    lead_q = scope_leads(user, {"$or": [{"name": regex}, {"company": regex}, {"phone": regex}, {"whatsapp": regex}]})
    cust_q = {"organization_id": org_of(user), "$or": [{"name": regex}, {"phone": regex}]}
    if segment:
        lead_q["segment"] = segment
        cust_q["segment"] = segment
    leads = await db.leads.find(lead_q).to_list(10)
    if not is_manager(user):
        cust_q["assigned_to"] = user["id"]
    custs = await db.customers.find(cust_q).to_list(10)
    return {"leads": [clean(l) for l in leads], "customers": [clean(c) for c in custs]}

# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------
@api.get("/dashboard/stats")
async def dashboard_stats(segment: Optional[str] = None, user: dict = Depends(get_current_user)):
    base = {}
    if segment:
        base["segment"] = segment
    all_leads = await db.leads.find(scope_leads(user, base)).to_list(5000)
    lead_ids = [l["id"] for l in all_leads]
    now = datetime.now(timezone.utc)
    today = now.date()

    def created_on(l, d):
        try:
            return datetime.fromisoformat(l["created_at"]).date() == d
        except Exception:
            return False

    new_today = len([l for l in all_leads if created_on(l, today)])
    funnel = {s: len([l for l in all_leads if l.get("status") == s]) for s in STATUSES}

    calls = await db.calls.find({"lead_id": {"$in": lead_ids}}).to_list(5000)
    connected = len([c for c in calls if c.get("status") in comm.CONNECTED_STATES])

    fu_base = {"status": "pending", "organization_id": org_of(user), "lead_id": {"$in": lead_ids}}
    if not is_manager(user):
        fu_base["assigned_to"] = user["id"]
    followups = await db.followups.find(fu_base).to_list(2000)
    fu_today = 0
    for f in followups:
        try:
            if datetime.fromisoformat(f["due_at"]).date() == today:
                fu_today += 1
        except Exception:
            pass

    converted = [l for l in all_leads if l.get("status") == "converted"]

    src_counts = {}
    for l in all_leads:
        s = l.get("source", "manual")
        src_counts[s] = src_counts.get(s, 0) + 1
    total_leads = len(all_leads) or 1
    sources = sorted(
        [{"source": k, "count": v, "pct": round(v / total_leads * 100)} for k, v in src_counts.items()],
        key=lambda x: x["count"], reverse=True,
    )

    def spark(items, key_date):
        days = [(today - timedelta(days=i)) for i in range(6, -1, -1)]
        counts = []
        for d in days:
            c = 0
            for it in items:
                try:
                    if datetime.fromisoformat(it[key_date]).date() == d:
                        c += 1
                except Exception:
                    pass
            counts.append(c)
        return counts

    return {
        "new_leads": {"total": len(all_leads), "delta_today": new_today, "spark": spark(all_leads, "created_at")},
        "follow_ups": {"total": len(followups), "due_today": fu_today},
        "calls": {"total": len(calls), "connected": connected,
                  "rate": round(connected / (len(calls) or 1) * 100)},
        "conversions": {"total": len(converted), "delta_pct": 24, "spark": spark(converted, "created_at")},
        "funnel": funnel, "sources": sources,
    }

@api.get("/config")
async def get_config(user: dict = Depends(get_current_user)):
    return {"communication_provider": comm.provider_name(), "role": user.get("role")}

@api.get("/config/balance")
async def get_balance(user: dict = Depends(get_current_user)):
    if not is_manager(user):
        raise HTTPException(status_code=403, detail="Only managers can view balance")
    adapter = comm.get_adapter()
    try:
        balance_data = await adapter.get_account_balance()
        return balance_data
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

# ---------------------------------------------------------------------------
# Seed
# ---------------------------------------------------------------------------
FIRST_NAMES = ["Kumar", "Ravi", "Swathi", "Arjun", "Gowri", "Deepak", "Priya", "Vikram",
               "Meena", "Suresh", "Lakshmi", "Karthik", "Anjali", "Rohan", "Divya", "Manoj"]
COMPANIES = ["Kumar Traders", "ABC Motors", "Chennai Textiles", "Sunrise Electronics",
             "Green Valley Farms", "Metro Realty", "Sri Balaji Steels", "Cyber Systems",
             "Royal Jewellers", "Anand Automobiles", "Vetri Constructions", "Ocean Exports",
             "Prime Interiors", "Nova Pharma", "Aakash Foods", "Zenith Solar"]
SOURCES = ["website", "whatsapp", "call", "instagram", "facebook", "referral", "webinar", "manual", "campaign"]
PRIORITIES = ["high", "medium", "low"]

TEAM_DEFS = [
    ("Dhanusha", "dhanusha@myklick.in", "sales"),
    ("Arjun", "arjun@myklick.in", "sales"),
    ("Swathi", "swathi@myklick.in", "sales"),
    ("Gowri", "gowri@myklick.in", "sales"),
    ("Ramesh", "leader@myklick.in", "team_leader"),
]

async def seed_team():
    """Idempotently ensure the demo team users exist (runs on every startup)."""
    team = []
    for name, email, role in TEAM_DEFS:
        existing = await db.users.find_one({"email": email})
        if existing:
            if not existing.get("organization_id"):
                await db.users.update_one({"email": email}, {"$set": {"organization_id": DEFAULT_ORG}})
            team.append(existing)
            continue
        u = {"id": str(uuid.uuid4()), "name": name, "email": email,
             "password_hash": hash_password("myklick123"), "role": role,
             "organization_id": DEFAULT_ORG, "avatar": None, "created_at": now_iso()}
        await db.users.insert_one(dict(u))
        team.append(u)
    return team

async def seed():
    if await db.leads.count_documents({}) > 0:
        return
    logger.info("Seeding MyKlick demo data...")
    team = await seed_team()
    sales_team = [u for u in team if u["role"] == "sales"]

    now = datetime.now(timezone.utc)
    count = 0
    for i in range(72):
        name = random.choice(COMPANIES) if random.random() > 0.4 else f"{random.choice(FIRST_NAMES)} {random.choice(FIRST_NAMES)}"
        member = random.choice(sales_team)
        status = random.choices(STATUSES, weights=[25, 20, 10, 15, 10, 10, 10])[0]
        created = now - timedelta(days=random.randint(0, 9), hours=random.randint(0, 23))
        phone = f"+91 9{random.randint(100000000, 999999999)}"
        lead = {
            "id": str(uuid.uuid4()), "organization_id": DEFAULT_ORG,
            "name": name, "company": name if name in COMPANIES else "",
            "phone": phone, "phone_norm": norm_phone(phone),
            "whatsapp": f"+91 9{random.randint(100000000, 999999999)}",
            "email": "", "location": random.choice(["Chennai", "Coimbatore", "Madurai", "Bengaluru", "Trichy"]),
            "product": "", "source": random.choice(SOURCES), "status": status,
            "priority": random.choice(PRIORITIES), "assigned_to": member["id"], "assigned_name": member["name"],
            "value": random.choice([25000, 50000, 75000, 100000, 125000, 150000, 200000, 300000]),
            "notes": "", "next_followup": None,
            "created_at": created.isoformat(), "updated_at": created.isoformat(),
        }
        await db.leads.insert_one(dict(lead))
        count += 1
        await db.activities.insert_one({
            "id": str(uuid.uuid4()), "organization_id": DEFAULT_ORG, "type": "lead_created",
            "lead_id": lead["id"], "lead_name": lead["name"], "user_id": member["id"],
            "user_name": member["name"], "user_avatar": None, "text": "created a new lead",
            "meta": {}, "created_at": created.isoformat(),
        })
        for _ in range(random.randint(0, 3)):
            cstat = random.choice(["completed", "completed", "no-answer"])
            dur = random.randint(30, 400) if cstat == "completed" else 0
            ct = created + timedelta(hours=random.randint(1, 40))
            await db.calls.insert_one({
                "id": str(uuid.uuid4()), "organization_id": DEFAULT_ORG, "lead_id": lead["id"],
                "provider": "mock", "provider_call_id": f"seed-{uuid.uuid4().hex[:10]}",
                "direction": "outgoing", "status": cstat, "duration_seconds": dur,
                "from_number": "", "to_number": phone, "recording_url": None,
                "user_id": member["id"], "user_name": member["name"], "activity_logged": True,
                "start_time": ct.isoformat(), "end_time": ct.isoformat(), "created_at": ct.isoformat(),
            })
        if random.random() > 0.4:
            samples = ["Hello, I need more details.", "Sure, I'll send the investment details.",
                       "What is the price range?", "Can we schedule a call tomorrow?", "Thanks for the information!"]
            for j in range(random.randint(1, 4)):
                mt = created + timedelta(hours=j + 1)
                await db.messages.insert_one({
                    "id": str(uuid.uuid4()), "organization_id": DEFAULT_ORG, "lead_id": lead["id"],
                    "provider": "mock", "provider_message_id": f"seed-{uuid.uuid4().hex[:10]}",
                    "direction": "incoming" if j % 2 == 0 else "outgoing", "type": "text",
                    "text": random.choice(samples), "status": random.choice(["sent", "delivered", "read"]),
                    "media_url": None, "user_id": member["id"], "created_at": mt.isoformat(),
                })
        if status in ("follow_up", "interested") and random.random() > 0.3:
            due = now + timedelta(hours=random.randint(-5, 30))
            await db.followups.insert_one({
                "id": str(uuid.uuid4()), "organization_id": DEFAULT_ORG, "lead_id": lead["id"],
                "lead_name": lead["name"],
                "reason": random.choice(["Investment discussion", "Price negotiation", "Send proposal", "Demo call", "Payment follow-up"]),
                "due_at": due.isoformat(), "assigned_to": member["id"], "assigned_name": member["name"],
                "status": "pending", "created_at": created.isoformat(), "completed_at": None,
            })
            await db.leads.update_one({"id": lead["id"]}, {"$set": {"next_followup": due.isoformat()}})
        if status == "converted":
            ct = min(created + timedelta(days=random.randint(0, 3)), now)
            await db.customers.insert_one({
                "id": str(uuid.uuid4()), "organization_id": DEFAULT_ORG, "lead_id": lead["id"],
                "name": lead["name"], "company": lead["company"], "phone": lead["phone"],
                "whatsapp": lead["whatsapp"], "email": "", "location": lead["location"],
                "source": lead["source"], "value": lead["value"], "assigned_to": member["id"],
                "assigned_name": member["name"], "converted_by": member["name"], "converted_at": ct.isoformat(),
            })
            await db.activities.insert_one({
                "id": str(uuid.uuid4()), "organization_id": DEFAULT_ORG, "type": "converted",
                "lead_id": lead["id"], "lead_name": lead["name"], "user_id": member["id"],
                "user_name": member["name"], "user_avatar": None, "text": "converted a lead",
                "meta": {"value": lead["value"]}, "created_at": ct.isoformat(),
            })
    logger.info("Seed complete: %d leads", count)


async def seed_admin():
    email = os.environ.get("ADMIN_EMAIL", "admin@myklick.in").lower()
    password = os.environ.get("ADMIN_PASSWORD", "myklick123")
    name = os.environ.get("ADMIN_NAME", "Raj")
    existing = await db.users.find_one({"email": email})
    if not existing:
        await db.users.insert_one({
            "id": str(uuid.uuid4()), "name": name, "email": email,
            "password_hash": hash_password(password), "role": "admin",
            "organization_id": DEFAULT_ORG, "avatar": None, "created_at": now_iso(),
        })
    else:
        upd = {}
        if not verify_password(password, existing["password_hash"]):
            upd["password_hash"] = hash_password(password)
        if not existing.get("organization_id"):
            upd["organization_id"] = DEFAULT_ORG
        if upd:
            await db.users.update_one({"email": email}, {"$set": upd})


async def migrate():
    """Backfill organisation_id / roles / phone_norm on legacy documents."""
    for coll in ("users", "leads", "customers", "activities", "calls", "messages", "followups"):
        await db[coll].update_many({"organization_id": {"$exists": False}}, {"$set": {"organization_id": DEFAULT_ORG}})
    await db.users.update_many({"role": {"$exists": False}}, {"$set": {"role": "sales"}})
    async for lead in db.leads.find({"phone_norm": {"$exists": False}}):
        await db.leads.update_one({"id": lead["id"]}, {"$set": {"phone_norm": norm_phone(lead.get("phone", ""))}})
    # Backfill customer relationship fields from their parent lead + clamp future dates.
    async for c in db.customers.find({}):
        upd = {}
        lead = await db.leads.find_one({"id": c.get("lead_id")}) if c.get("lead_id") else None
        if not c.get("assigned_to") and lead:
            upd["assigned_to"] = lead.get("assigned_to")
        if not c.get("converted_by"):
            upd["converted_by"] = c.get("assigned_name") or (lead.get("assigned_name") if lead else None)
        if not c.get("company") and lead:
            upd["company"] = lead.get("company", "")
        if not c.get("location") and lead:
            upd["location"] = lead.get("location", "")
        try:
            if datetime.fromisoformat(c["converted_at"]) > datetime.now(timezone.utc):
                upd["converted_at"] = now_iso()
        except Exception:
            pass
        if upd:
            await db.customers.update_one({"_id": c["_id"]}, {"$set": upd})
    # Clamp any future-dated demo activity timestamps (ISO strings sort lexicographically).
    _now = now_iso()
    await db.activities.update_many({"created_at": {"$gt": _now}}, {"$set": {"created_at": _now}})


@app.on_event("startup")
async def startup():
    try:
        await db.users.drop_index("email_1")
    except Exception:
        pass
    try:
        await db.users.drop_index("phone_1")
    except Exception:
        pass

    try:
        await db.users.create_index("phone", unique=True)
    except Exception:
        pass
    try:
        await db.users.create_index("email", unique=True, sparse=True)
    except Exception:
        pass
    try:
        await db.leads.create_index("id", unique=True)
    except Exception:
        pass
    try:
        await db.webhook_events.create_index("event_key", unique=True)
    except Exception:
        pass
    try:
        await db.calls.create_index("provider_call_id")
    except Exception:
        pass
    try:
        await db.messages.create_index("provider_message_id")
    except Exception:
        pass
        
    await seed_admin()
    await seed_team()
    await seed()
    await migrate()
@api.post("/upload")
async def upload_file(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    try:
        os.makedirs("uploads", exist_ok=True)
        ext = file.filename.rsplit('.', 1)[-1].lower() if '.' in file.filename else 'bin'
        # Only allow safe file types
        allowed = {'jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'bin'}
        if ext not in allowed:
            ext = 'bin'
        filename = f"{uuid.uuid4().hex}.{ext}"
        filepath = os.path.join("uploads", filename)
        contents = await file.read()
        with open(filepath, "wb") as buffer:
            buffer.write(contents)
        return {"url": f"/uploads/{filename}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

@api.get("/")
async def root():
    return {"message": "MyKlick CRM API"}

app.include_router(api)
os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown():
    client.close()
