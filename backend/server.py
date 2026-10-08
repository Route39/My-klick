import re
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
client = AsyncIOMotorClient(mongo_url, tlsCAFile=certifi.where(), maxIdleTimeMS=60000, retryReads=True, retryWrites=True)
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

IST = timezone(timedelta(hours=5, minutes=30))

def ist_date(v):
    d = v if isinstance(v, datetime) else datetime.fromisoformat(v)
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    return d.astimezone(IST).date()

def today_ist():
    return datetime.now(IST).date()

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

def can_view_team(user: dict) -> bool:
    return user.get("role") in ("admin", "team_leader", "admin_staff")

def can_view_all(user: dict) -> bool:
    """Access to everyone's data: admin, team leader, admin+staff."""
    return user.get("role") in ("admin", "team_leader", "admin_staff")

def is_manager(user: dict) -> bool:
    return user.get("role") in ("admin", "team_leader")

def seg_match(segment):
    return {"$in": ["investor", None]} if segment == "investor" else segment

REGIONS = ["Tamil Nadu", "Karnataka"]

LOC_REGION = {"chennai": "Tamil Nadu", "coimbatore": "Tamil Nadu", "tirupur": "Tamil Nadu", "tiruppur": "Tamil Nadu",
              "madurai": "Tamil Nadu", "trichy": "Tamil Nadu", "bangalore": "Karnataka", "bengaluru": "Karnataka"}

def staff_region(user: dict):
    """Admin, team leader, admin+staff see every state; staff their region, else derived from location (none = nothing)."""
    if can_view_all(user):
        return None
    return user.get("region") or LOC_REGION.get((user.get("location") or "").strip().lower()) or "__none__"

def scope_leads(user: dict, base: dict = None) -> dict:
    """Organisation + role scoping for lead queries."""
    q = dict(base or {})
    q["organization_id"] = org_of(user)
    if not can_view_all(user):
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
    if not can_view_all(user):
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
    location: Optional[str] = None
    joining_date: Optional[str] = None

class TeamMemberIn(BaseModel):
    name: str
    email: str = ""
    phone: str = ""
    password: str = ""
    role: str = "sales"
    location: str = ""
    joining_date: str = ""

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
    region: Optional[str] = ""
    language: Optional[str] = ""
    assigned_to: Optional[str] = None
    state: Optional[str] = ""
    is_common: bool = False
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
    text: str = ""
    direction: str = "outgoing"
    media_url: Optional[str] = None
    media_type: Optional[str] = None
    filename: Optional[str] = None

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
        "role": body.role if body.role in ("admin", "team_leader", "sales", "admin_staff") else "sales",
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
    if not can_view_all(user):
        raise HTTPException(status_code=403, detail="Not authorized")
        
    existing = await db.users.find_one({"phone": body.phone.strip()})
    if existing:
        raise HTTPException(status_code=400, detail="A user with this phone/username already exists.")
        
    doc = {
        "id": str(uuid.uuid4()), "name": body.name, "email": body.email.lower().strip(), "phone": body.phone.strip(),
        "password_hash": hash_password(body.password or "password123"),
        "role": body.role if body.role in ("admin", "team_leader", "sales", "admin_staff") else "sales",
        "organization_id": org_of(user), "avatar": None, "created_at": now_iso(),
        "location": body.location, "joining_date": body.joining_date,
    }
    await db.users.insert_one(dict(doc))
    return clean(doc)

@api.delete("/team/{user_id}")
async def delete_team_member(user_id: str, user: dict = Depends(get_current_user)):
    if not can_view_all(user):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    target_user = await db.users.find_one({"id": user_id, "organization_id": org_of(user)})
    if target_user:
        await db.users.delete_one({"id": user_id, "organization_id": org_of(user)})
    return {"ok": True}

@api.put("/team/{user_id}")
async def update_team_member(user_id: str, body: TeamMemberUpdate, user: dict = Depends(get_current_user)):
    if not can_view_all(user) and user["id"] != user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    update_data = {
        "name": body.name,
        "phone": body.phone.strip(),
        "email": body.email.lower().strip(),
        "role": body.role if body.role in ("admin", "team_leader", "sales", "admin_staff") else "sales"
    }
    
    await db.users.update_one(
        {"id": user_id, "organization_id": org_of(user)},
        {"$set": update_data}
    )
    _extra = {k: v for k, v in {"location": body.location, "joining_date": body.joining_date}.items() if v}
    if _extra:
        await db.users.update_one({"id": user_id}, {"$set": _extra})
    return {"ok": True}

class NoteIn(BaseModel):
    text: str

def can_view_all_notes(user: dict) -> bool:
    return user.get("role") in ("admin", "admin_staff")

@api.post("/notes")
async def create_note(body: NoteIn, user: dict = Depends(get_current_user)):
    text = (body.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Note is empty")
    if len(text) > 5000:
        raise HTTPException(status_code=400, detail="Note is too long")
    doc = {
        "id": str(uuid.uuid4()), "organization_id": org_of(user),
        "user_id": user.get("id"), "user_name": user.get("name", ""), "user_role": user.get("role", ""),
        "text": text, "status": "new", "noted_by": None, "noted_at": None, "created_at": now_iso(),
    }
    await db.notes.insert_one(dict(doc))
    return clean(doc)

@api.get("/notes")
async def list_notes(user: dict = Depends(get_current_user)):
    q = {"organization_id": org_of(user)}
    if not can_view_all_notes(user):
        q["user_id"] = user.get("id")
    notes = await db.notes.find(q).sort("created_at", -1).to_list(1000)
    return [clean(n) for n in notes]

@api.post("/notes/{note_id}/noted")
async def mark_note_noted(note_id: str, user: dict = Depends(get_current_user)):
    if not can_view_all_notes(user):
        raise HTTPException(status_code=403, detail="Not authorized")
    await db.notes.update_one({"id": note_id, "organization_id": org_of(user)},
                              {"$set": {"status": "noted", "noted_by": user.get("name", ""), "noted_at": now_iso()}})
    return {"ok": True}

@api.get("/team/activity")
async def team_activity(period: str = "today", start: str = "", end: str = "",
                        user: dict = Depends(get_current_user)):
    """Per-member activity report for a date range (IST). Admin, team leader, admin+staff."""
    if not can_view_team(user):
        raise HTTPException(status_code=403, detail="Not authorized")
    IST = timezone(timedelta(hours=5, minutes=30))
    today = datetime.now(IST).replace(hour=0, minute=0, second=0, microsecond=0)
    one_day = timedelta(days=1)
    try:
        if period == "custom" and start:
            s = datetime.fromisoformat(start[:10]).replace(tzinfo=IST)
            e = (datetime.fromisoformat(end[:10]).replace(tzinfo=IST) if end else s) + one_day
        elif period == "yesterday":
            s, e = today - one_day, today
        elif period == "week":
            s, e = today - timedelta(days=today.weekday()), today + one_day
        elif period == "month":
            s, e = today.replace(day=1), today + one_day
        else:
            s, e = today, today + one_day
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date")
    if e <= s:
        raise HTTPException(status_code=400, detail="End date must be after start date")
    rng = {"$gte": s.astimezone(timezone.utc).isoformat(), "$lt": e.astimezone(timezone.utc).isoformat()}

    org = org_of(user)
    users = await db.users.find({"organization_id": org}).to_list(500)
    calls = await db.calls.find({"organization_id": org, "user_id": {"$ne": None}, "created_at": rng}).to_list(50000)
    acts = await db.activities.find({"organization_id": org, "user_id": {"$ne": None}, "created_at": rng,
                                     "type": {"$in": ["converted", "status_change"]}}).to_list(50000)
    # Common leads TAKEN in this period -> credit the staff who clicked "Assign to me"
    created = await db.leads.find({"organization_id": org, "claimed_at": rng,
                                   "assigned_to": {"$ne": None}}).to_list(50000)
    new_rnr = await db.leads.find({"organization_id": org, "created_at": rng, "status": "rnr"}).to_list(50000)
    new_interested = await db.leads.find({"organization_id": org, "created_at": rng,
                                          "segment": "driver", "status": "interested"}).to_list(50000)
    added = await db.leads.find({"organization_id": org, "created_at": rng, "created_by": {"$ne": None},
                                 "is_common": {"$ne": True}, "from_common": {"$ne": True},
                                 "created_as_common": {"$ne": True}},
                                {"id": 1, "created_by": 1}).to_list(100000)
    fus = await db.followups.find({"organization_id": org, "due_at": rng}).to_list(50000)

    lead_ids = {c.get("lead_id") for c in calls if c.get("lead_id")} | {a.get("lead_id") for a in acts if a.get("lead_id")}
    leads = {l["id"]: l for l in await db.leads.find({"id": {"$in": list(lead_ids)}}).to_list(50000)} if lead_ids else {}
    custs = {c["lead_id"]: c for c in await db.customers.find({"lead_id": {"$in": list(lead_ids)}}).to_list(50000)} if lead_ids else {}

    connected_states = getattr(comm, "CONNECTED_STATES", {"answered", "completed", "connected"})

    def blank():
        return {"total_calls": 0, "connected": 0, "talk_seconds": 0, "tele_call": 0,
                "spoke_investor": set(), "spoke_driver": set(), "prev_followup": set(),
                "conv_investor": set(), "interested_driver": set(), "payment": 0.0, "rnr": set(),
                "tele_ids": set(), "call_leads": set(), "added_ids": set(), "no_lead_calls": 0, "fu": []}
    st = {}

    for c in calls:
        x = st.setdefault(c["user_id"], blank())
        x["total_calls"] += 1
        dur = int(c.get("duration_seconds") or 0)
        lid = c.get("lead_id")
        if lid:
            x["call_leads"].add(lid)
        else:
            x["no_lead_calls"] += 1
        lead = leads.get(lid) or {}
        seg = lead.get("segment") or c.get("segment") or "investor"
        if lead.get("status") == "converted" and seg == "investor":
            conv_at = (custs.get(lid) or {}).get("converted_at") or ""
            if c.get("created_at", "") >= conv_at:
                x["prev_followup"].add(lid)
        if c.get("status") in connected_states or dur > 0:
            x["connected"] += 1
            x["talk_seconds"] += dur
            if lid:
                x["spoke_driver" if seg == "driver" else "spoke_investor"].add(lid)

    for a in acts:
        x = st.setdefault(a["user_id"], blank())
        lid = a.get("lead_id")
        seg = (leads.get(lid) or {}).get("segment") or "investor"
        if a.get("type") == "converted" and seg == "investor" and lid not in x["conv_investor"]:
            x["conv_investor"].add(lid)
            try:
                x["payment"] += float((a.get("meta") or {}).get("value") or 0)
            except (TypeError, ValueError):
                pass
        elif a.get("type") == "status_change" and seg == "driver" and (a.get("meta") or {}).get("to") == "interested":
            x["interested_driver"].add(lid)
        if a.get("type") == "status_change" and (a.get("meta") or {}).get("to") == "rnr" and lid:
            x["rnr"].add(lid)

    for l in created:
        if l.get("assigned_to"):
            st.setdefault(l["assigned_to"], blank())["tele_call"] += 1
            st[l["assigned_to"]]["tele_ids"].add(l["id"])
    # Admin / team leader who POSTED common leads in this period -> Tele Call count
    posted = await db.leads.find({"organization_id": org, "created_at": rng, "created_by": {"$ne": None},
                                  "$or": [{"is_common": True}, {"from_common": True}, {"created_as_common": True}]},
                                 {"id": 1, "created_by": 1}).to_list(50000)
    for l in posted:
        st.setdefault(l["created_by"], blank())["tele_call"] += 1
    for l in new_interested:
        if l.get("created_by"):
            st.setdefault(l["created_by"], blank())["interested_driver"].add(l["id"])

    for l in new_rnr:
        if l.get("created_by"):
            st.setdefault(l["created_by"], blank())["rnr"].add(l["id"])

    for l in added:
        st.setdefault(l["created_by"], blank())["added_ids"].add(l["id"])
    for f in fus:
        if f.get("assigned_to"):
            st.setdefault(f["assigned_to"], blank())["fu"].append({
                "lead_id": f.get("lead_id"), "lead_name": f.get("lead_name", ""), "due_at": f.get("due_at"),
                "status": f.get("status", "pending"), "reason": f.get("reason", "")})

    rows = []
    for u in users:
        uid = u.get("id") or str(u.get("_id", ""))
        x = st.get(uid, blank())
        logged = x["tele_ids"] | x["rnr"] | x["interested_driver"] | x["added_ids"]
        total_calls = len(x["call_leads"] | logged) + x["no_lead_calls"]  # unique leads touched
        fu_list = sorted(x["fu"], key=lambda f: f.get("due_at") or "")
        rows.append({
            "id": uid, "name": u.get("name", ""), "role": u.get("role", ""), "rnr": len(x["rnr"]),
            "location": u.get("location", ""),
            "joining_date": u.get("joining_date", ""),
            "total_calls": total_calls, "tele_call": x["tele_call"],
            "spoke_investor": len(x["spoke_investor"]), "spoke_driver": len(x["spoke_driver"]),
            "prev_followup": len(x["prev_followup"]), "conv_investor": len(x["conv_investor"]),
            "interested_driver": len(x["interested_driver"]), "payment": round(x["payment"], 2),
            "connected": x["connected"], "talk_seconds": x["talk_seconds"],
            "followups_total": len(fu_list), "followups": fu_list,
            "followups_done": sum(1 for f in fu_list if f["status"] == "completed"),
        })
    rows.sort(key=lambda r: (r["conv_investor"], r["spoke_investor"] + r["spoke_driver"], r["total_calls"]), reverse=True)
    keys = ("total_calls", "tele_call", "spoke_investor", "spoke_driver", "prev_followup",
            "conv_investor", "interested_driver", "payment", "connected", "talk_seconds", "rnr")
    totals = {k: sum(r[k] for r in rows) for k in keys}
    return {"from": s.date().isoformat(), "to": (e - one_day).date().isoformat(),
            "rows": rows, "totals": totals}

@api.get("/team")
async def team_performance(user: dict = Depends(get_current_user)):
    users = await db.users.find({"organization_id": org_of(user)}).to_list(200)
    if not can_view_team(user):
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
        base["segment"] = seg_match(segment)
    base["is_common"] = {"$ne": True}  # unclaimed common leads live in /common-leads
    if status:
        base["status"] = status
    elif exclude_status:
        base["status"] = {"$ne": exclude_status}
    if source:
        base["source"] = source
    if assigned_to and can_view_all(user):
        base["assigned_to"] = assigned_to
    if q:
        base["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"company": {"$regex": q, "$options": "i"}},
            {"phone": {"$regex": q, "$options": "i"}},
        ]
    leads = await db.leads.find(scope_leads(user, base)).sort("updated_at", -1).to_list(2000)
    return [clean(l) for l in leads]

# ---------------------------------------------------------------------------
# Common leads: admin-posted pool that any staff can see and claim
# ---------------------------------------------------------------------------
CITY_STATE = {
    "bangalore": "Karnataka", "bengaluru": "Karnataka", "banglore": "Karnataka", "blr": "Karnataka",
    "chennai": "Tamil Nadu", "coimbatore": "Tamil Nadu", "kovai": "Tamil Nadu",
    "tirupur": "Tamil Nadu", "tiruppur": "Tamil Nadu",
}

def state_of(location: str) -> str:
    """City / free-text location -> state ('' if unknown)."""
    loc = (location or "").strip().lower()
    if not loc:
        return ""
    if loc in ("karnataka", "tamil nadu", "tamilnadu", "tn"):
        return "Karnataka" if loc == "karnataka" else "Tamil Nadu"
    for city, st in CITY_STATE.items():
        if city in loc:
            return st
    return ""

def lead_state(lead: dict) -> str:
    return lead.get("state") or state_of(lead.get("location", ""))

def user_sees_lead(user: dict, lead: dict) -> bool:
    """Staff only see / hear common leads of their own state. Unknown state on either side -> visible."""
    if can_view_all(user):
        return True
    us, ls = state_of(user.get("location", "")), lead_state(lead)
    return not us or not ls or us == ls

def common_query(user: dict, segment: Optional[str] = None) -> dict:
    q = {"organization_id": org_of(user), "is_common": True, "assigned_to": None}
    if segment:
        q["segment"] = segment
    reg = staff_region(user)
    if reg:
        q["region"] = reg
    return q

@api.get("/common-leads")
async def list_common_leads(segment: Optional[str] = None, user: dict = Depends(get_current_user)):
    leads = await db.leads.find(common_query(user, segment)).sort("created_at", -1).to_list(2000)
    leads = [l for l in leads if user_sees_lead(user, l)]
    return [clean(l) for l in leads]

@api.get("/common-leads/latest")
async def latest_common_leads(since: str, user: dict = Depends(get_current_user)):
    """Polled by every staff for the popup + sound notification."""
    q = common_query(user)
    q["created_at"] = {"$gt": since}
    q["created_by"] = {"$ne": user["id"]}
    leads = await db.leads.find(q).sort("created_at", 1).to_list(50)
    leads = [l for l in leads if user_sees_lead(user, l)]
    return [{"id": l["id"], "name": l.get("name"), "segment": l.get("segment", "investor"), "state": lead_state(l),
             "created_at": l.get("created_at"), "created_by_name": l.get("created_by_name", "")} for l in leads]

@api.get("/common-leads/report-mine")
async def common_leads_report_mine(segment: Optional[str] = None, user: dict = Depends(get_current_user)):
    """Staff version of the common-leads report: own state only; others' phone numbers masked."""
    q = {"organization_id": org_of(user), "$or": [{"from_common": True}, {"is_common": True}, {"created_as_common": True}]}
    if segment:
        q["segment"] = segment
    reg = staff_region(user)
    if reg:
        q["region"] = reg
    leads = await db.leads.find(q).sort("created_at", -1).to_list(3000)
    out = []
    for l in leads:
        mine_or_open = (not l.get("assigned_to")) or l.get("assigned_to") == user.get("id")
        ph = l.get("phone", "") or ""
        out.append({
            "id": l.get("id"), "name": l.get("name", ""),
            "phone": ph if mine_or_open else ("XXXXXX" + ph[-4:] if len(ph) >= 4 else "XXXX"),
            "location": l.get("location", ""), "region": l.get("region", ""), "language": l.get("language", ""),
            "segment": l.get("segment", "investor"), "status": l.get("status", "new"),
            "assigned_to": l.get("assigned_to"), "assigned_name": l.get("assigned_name", ""),
            "claimed_at": l.get("claimed_at"), "created_at": l.get("created_at"),
            "created_by_name": l.get("created_by_name", ""),
        })
    return out

@api.post("/common-leads/{lead_id}/claim")
async def claim_common_lead(lead_id: str, user: dict = Depends(get_current_user)):
    """Atomic claim: only the first staff to click gets it."""
    lead = await db.leads.find_one_and_update(
        {"id": lead_id, "organization_id": org_of(user), "is_common": True, "assigned_to": None,
         **({"region": staff_region(user)} if staff_region(user) else {})},
        {"$set": {"assigned_to": user["id"], "assigned_name": user.get("name", ""),
                  "is_common": False, "from_common": True, "claimed_at": now_iso(), "updated_at": now_iso()}},
        return_document=True,
    )
    if not lead:
        raise HTTPException(status_code=409, detail="This lead was already taken by someone else")
    await db.followups.update_many({"lead_id": lead_id, "assigned_to": None},
                                   {"$set": {"assigned_to": user["id"], "assigned_name": user.get("name", "")}})
    await log_activity("lead_claimed", lead, user, "assigned a common lead to themselves")
    return clean(lead)

@api.get("/common-leads/report")
async def common_leads_report(segment: Optional[str] = None, user: dict = Depends(get_current_user)):
    if not can_view_all(user):
        raise HTTPException(status_code=403, detail="Not authorized")
    q = {"organization_id": org_of(user),
         "$or": [{"is_common": True}, {"from_common": True}, {"claimed_at": {"$exists": True}}]}
    if segment:
        q["segment"] = seg_match(segment)
    leads = await db.leads.find(q).sort("created_at", -1).to_list(5000)
    keys = ("id", "name", "phone", "location", "region", "segment", "status", "assigned_to",
            "assigned_name", "claimed_at", "created_at", "created_by_name", "remarks")
    return [{k: l.get(k) for k in keys} for l in leads]

class RegionIn(BaseModel):
    region: str = ""

@api.put("/team/{user_id}/region")
async def set_team_region(user_id: str, body: RegionIn, user: dict = Depends(get_current_user)):
    if not can_view_all(user):
        raise HTTPException(status_code=403, detail="Not authorized")
    if body.region and body.region not in REGIONS:
        raise HTTPException(status_code=400, detail="Invalid state")
    await db.users.update_one({"id": user_id, "organization_id": org_of(user)}, {"$set": {"region": body.region}})
    return {"ok": True}

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
    # Duplicate check: same phone number already in leads -> block
    _n = norm_phone(body.phone)
    if _n:
        _q = {"organization_id": org_of(user), "$or": [{"phone_norm": _n}]}
        if len(_n) == 10:
            _q["$or"].append({"phone": {"$regex": re.escape(_n) + "$"}})
        _dup = await db.leads.find_one(_q)
        if _dup:
            _who = _dup.get("assigned_name") or ("Common Leads (not taken)" if _dup.get("is_common") else "Unassigned")
            raise HTTPException(status_code=409, detail=f"This number already exists — {_dup.get('name', '')} · {_who}")
    if body.is_common and is_manager(user) and body.region not in REGIONS:
        raise HTTPException(status_code=400, detail="Select a state (Tamil Nadu / Karnataka)")
    if not (body.name or "").strip() or len(norm_phone(body.phone)) < 10:
        raise HTTPException(status_code=400, detail="Name and a valid 10-digit phone are required")
    try:
        assigned = None
        is_common = bool(body.is_common and (is_manager(user) or user.get("role") == "admin_staff"))
        if is_common:
            assigned = None  # common pool: no owner until a staff claims it
        elif body.assigned_to:
            assigned = await db.users.find_one({"id": body.assigned_to})
        elif not can_view_all(user):
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
            "segment": body.segment, "is_common": is_common,
            "region": body.region or "", "language": body.language or "", "from_common": is_common,
            "assigned_to": actual_assigned_to, "assigned_name": actual_assigned_name,
            "value": body.value, "notes": body.notes or "", "next_followup": None,
            "no_of_vehicles": body.no_of_vehicles or "", "remarks": body.remarks or "",
            "rc": body.rc or "", "aadhaar_url": body.aadhaar_url or "",
            "pan_url": body.pan_url or "", "license_url": body.license_url or "",
            "state": (body.state or state_of(body.location or "")),
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
        with open("driver_error.log", "a") as f:
            f.write("ERROR:\n")
            f.write(traceback.format_exc() + "\n")
        raise HTTPException(status_code=400, detail=f"Server error: {str(e)}\n{traceback.format_exc()}")
@api.put("/leads/{lead_id}")
async def update_lead(lead_id: str, body: LeadIn, user: dict = Depends(get_current_user)):
    lead = await lead_or_403(lead_id, user)
    assigned = None
    if body.assigned_to:
        assigned = await db.users.find_one({"id": body.assigned_to})
    update = body.model_dump()
    update.pop("is_common", None)
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
async def _wa_visible_lead_ids(user: dict, lead_ids: list) -> dict:
    """Leads this user may see: managers see all, staff see own + unassigned/common."""
    q = {"organization_id": org_of(user), "id": {"$in": lead_ids}}
    if not is_manager(user):
        q["$or"] = [{"assigned_to": user["id"]}, {"assigned_to": None}]
    leads = await db.leads.find(q, {"_id": 0, "id": 1, "name": 1, "segment": 1}).to_list(1000)
    return {l["id"]: l for l in leads}

@api.get("/whatsapp/latest")
async def whatsapp_latest(since: str, user: dict = Depends(get_current_user)):
    msgs = await db.messages.find(
        {"direction": "incoming", "created_at": {"$gt": since}, "lead_id": {"$ne": None}}
    ).sort("created_at", 1).to_list(100)
    visible = await _wa_visible_lead_ids(user, list({m["lead_id"] for m in msgs}))
    out = []
    for m in msgs:
        l = visible.get(m["lead_id"])
        if l:
            out.append({"id": m["id"], "lead_id": m["lead_id"], "lead_name": l.get("name"),
                        "segment": l.get("segment") or "investor", "text": (m.get("text") or "")[:120],
                        "created_at": m.get("created_at")})
    last = msgs[-1]["created_at"] if msgs else since
    return {"items": out, "last": last}

@api.get("/whatsapp/unread-count")
async def whatsapp_unread_count(user: dict = Depends(get_current_user)):
    msgs = await db.messages.find(
        {"direction": "incoming", "read": False, "lead_id": {"$ne": None}}, {"_id": 0, "lead_id": 1}
    ).to_list(5000)
    visible = await _wa_visible_lead_ids(user, list({m["lead_id"] for m in msgs}))
    by_lead = {}
    for m in msgs:
        if m["lead_id"] in visible:
            by_lead[m["lead_id"]] = by_lead.get(m["lead_id"], 0) + 1
    return {"total": sum(by_lead.values()), "by_lead": by_lead}

@api.post("/leads/{lead_id}/messages/read")
async def whatsapp_mark_read(lead_id: str, user: dict = Depends(get_current_user)):
    await lead_or_403(lead_id, user)
    r = await db.messages.update_many({"lead_id": lead_id, "direction": "incoming", "read": False},
                                      {"$set": {"read": True}})
    return {"ok": True, "updated": r.modified_count}

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
            new_status = "rnr"
        elif body.duration_seconds > 0 and lead.get("status") in ("new", "rnr"):
            new_status = "contacted"
        
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
    if not can_view_all(user) and call.get("user_id") != user["id"]:
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
    adapter = comm.get_whatsapp_adapter()
    if not (body.text or "").strip() and not body.media_url:
        raise HTTPException(status_code=400, detail="Type a message or attach a file")
    media = None
    if body.media_url:
        public = body.media_url
        if public.startswith("/"):
            base = os.environ.get("PUBLIC_API_BASE", "").rstrip("/")
            if not base:
                raise HTTPException(status_code=400, detail="PUBLIC_API_BASE is not set, files cannot be sent")
            public = base + public
        media = {"url": public, "type": body.media_type or "document", "filename": body.filename}
    try:
        kwargs = {"media": media} if media else {}
        result = await adapter.send_whatsapp(
            from_number=os.environ.get("EXOTEL_WHATSAPP_NUMBER") or None,
            to_number=lead.get("whatsapp") or lead["phone"], text=body.text, **kwargs,
        )
    except TypeError:
        raise HTTPException(status_code=400, detail="This WhatsApp provider cannot send files")
    except comm.CommunicationError:
        await log_integration("whatsapp_error", {"lead_id": lead_id, "provider": adapter.provider})
        raise HTTPException(status_code=502, detail="Message could not be sent. Please try again.")

    msg = {
        "id": str(uuid.uuid4()), "organization_id": org_of(user), "lead_id": lead_id,
        "provider": adapter.provider, "provider_message_id": result.get("provider_message_id"),
        "direction": "outgoing", "type": (media or {}).get("type") or "text", "text": body.text,
        "status": result.get("status", "sent"), "media_url": body.media_url, "filename": body.filename,
        "user_id": user["id"], "created_at": now_iso(),
    }
    await db.messages.insert_one(dict(msg))
    await log_activity("whatsapp", lead, user, "sent a WhatsApp message", {"text": (body.text or body.filename or "[file]")[:60]})
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
            "segment": (lead or {}).get("segment") or "investor",
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
_WA_EXT = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf",
           "video/mp4": "mp4", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/aac": "aac", "audio/mp4": "m4a"}

async def _wa_fetch_media(mobj: dict, mtype: str):
    """Download an incoming WhatsApp file into /uploads; falls back to the remote URL."""
    url = (mobj or {}).get("url") or (mobj or {}).get("link")
    if not url:
        return None
    try:
        import httpx
        auth = None
        if "exotel" in url:
            auth = (os.environ.get("EXOTEL_API_KEY", ""), os.environ.get("EXOTEL_API_TOKEN", ""))
        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as c:
            r = await c.get(url, auth=auth)
        if r.status_code >= 400:
            return url
        mime = (mobj.get("mime_type") or r.headers.get("content-type") or "").split(";")[0]
        ext = _WA_EXT.get(mime) or (mobj.get("filename") or "").rsplit(".", 1)[-1].lower() or "bin"
        os.makedirs("uploads", exist_ok=True)
        name = f"wa_{uuid.uuid4().hex}.{ext[:5]}"
        with open(os.path.join("uploads", name), "wb") as f:
            f.write(r.content)
        return f"/uploads/{name}"
    except Exception:
        return url

@api.api_route("/webhooks/wabridge/lead", methods=["GET", "POST"])
async def wabridge_bot_lead(request: Request, key: str = ""):
    secret = os.environ.get("WABRIDGE_LEAD_KEY", "")
    if secret and key != secret:
        raise HTTPException(status_code=401, detail="Invalid key")
    data = dict(request.query_params)
    if request.method == "POST":
        try:
            body = await request.json()
            if isinstance(body, dict):
                data.update(body)
        except Exception:
            try:
                data.update(dict(await request.form()))
            except Exception:
                pass
    pick = lambda *ks: next((str(data[k]).strip() for k in ks if data.get(k) not in (None, "")), "")
    phone = norm_phone(pick("phone", "mobile", "number", "from", "wa_id", "customer_number"))
    if not phone:
        raise HTTPException(status_code=400, detail="phone is required")
    name = pick("name", "customer_name", "profile_name") or phone
    choice = pick("segment", "interest", "option", "button", "choice").lower()
    segment = "driver" if "driver" in choice else "investor"
    note = pick("message", "text", "note") or choice
    lead = await find_lead_by_phone(phone)
    created = False
    if not lead:
        lead = {
            "id": str(uuid.uuid4()), "organization_id": DEFAULT_ORG,
            "name": name, "company": "", "phone": phone, "phone_norm": phone, "whatsapp": phone,
            "email": "", "location": "", "product": "",
            "source": "whatsapp", "status": "new", "priority": "medium",
            "segment": segment, "is_common": True,
            "assigned_to": None, "assigned_name": None,
            "value": 0, "notes": "", "next_followup": None,
            "remarks": f"WA Bot: {note}" if note else "WA Bot",
            "created_by": None, "created_by_name": "WhatsApp Bot",
            "created_at": now_iso(), "updated_at": now_iso(),
        }
        await db.leads.insert_one(dict(lead))
        created = True
    await log_activity("lead_created" if created else "whatsapp", lead, {"id": None, "name": "WhatsApp Bot"},
                       "came from WhatsApp bot" if created else "selected an option in WhatsApp bot", {"text": note[:60]})
    await log_integration("wabridge_bot_lead", {"lead_id": lead["id"], "created": created, "segment": segment})
    return {"ok": True, "created": created, "lead_id": lead["id"]}

@api.post("/webhooks/exotel/whatsapp")
async def webhook_whatsapp(request: Request):
    body = await request.body()
    if not comm.verify_webhook_signature(body, request.headers.get("X-Exotel-Signature", "")):
        raise HTTPException(status_code=401, detail="Invalid webhook signature")
    try:
        payload = await request.json()
    except Exception:
        payload = {}
    try:
        payload = await request.json()
    except Exception:
        payload = {}
    if payload.get("type") == "verification":
        return {"challenge": payload.get("challenge")}

    items = (payload.get("whatsapp") or {}).get("messages") or [payload.get("data", payload.get("message", payload)) or {}]
    saved = 0
    for d in items:
        ctype = d.get("callback_type") or payload.get("type") or ""
        msg_id = d.get("message_sid") or d.get("message_id") or d.get("id")

        if ctype == "dlr" or (ctype != "incoming_message" and d.get("status")):
            raw = (d.get("exo_detailed_status") or d.get("status") or "").replace("EX_MESSAGE_", "").lower()
            status = comm.map_msg_status(raw)
            if msg_id and await _once(f"wa:{msg_id}:{status}", d):
                await db.messages.update_one({"provider_message_id": msg_id}, {"$set": {"status": status}})
            continue

        print("WA RAW:", d)
        from_num = d.get("from") or ""
        if len(norm_phone(str(from_num))) < 10:  # skip payloads without a sender (tests / pings)
            continue
        content = d.get("content") or d.get("message") or {}
        mtype = content.get("type") or "text"
        txt = content.get("text")
        text = ((txt or {}).get("body") if isinstance(txt, dict) else content.get("body")) \
            or (content.get("button") or {}).get("text") \
            or ((content.get("interactive") or {}).get("button_reply") or {}).get("title") \
            or f"[{mtype}]"
        media_url = None
        mobj = content.get(mtype) if isinstance(content.get(mtype), dict) else {}
        if mtype in ("image", "document", "video", "audio", "sticker", "voice"):
            media_url = await _wa_fetch_media(mobj, mtype)
            text = mobj.get("caption") or mobj.get("filename") or ""
        key = msg_id or f"{from_num}:{d.get('timestamp')}:{text[:40]}"
        if not await _once(f"wa-in:{key}", d):
            continue

        lead = await find_lead_by_phone(from_num)
        if not lead:
            ten = norm_phone(from_num)
            lead = {
                "id": str(uuid.uuid4()), "organization_id": DEFAULT_ORG,
                "name": d.get("profile_name") or ten, "company": "",
                "phone": ten, "phone_norm": ten, "whatsapp": ten,
                "email": "", "location": "", "product": "",
                "source": "whatsapp", "status": "new", "priority": "medium",
                "segment": "driver" if any(w in (text or "").lower() for w in ("driver", "drive", "டிரைவர்", "ஓட்டுநர்")) else "investor", "is_common": True,
                "assigned_to": None, "assigned_name": None,
                "value": 0, "notes": "", "next_followup": None,
                "created_by": None, "created_by_name": "WhatsApp",
                "created_at": now_iso(), "updated_at": now_iso(),
            }
            await db.leads.insert_one(dict(lead))
            await log_activity("lead_created", lead, {"id": None, "name": "WhatsApp"}, "created from incoming WhatsApp")

        await db.messages.insert_one({
            "id": str(uuid.uuid4()), "organization_id": lead.get("organization_id") or DEFAULT_ORG,
            "lead_id": lead["id"], "provider": "exotel", "provider_message_id": msg_id,
            "direction": "incoming", "type": mtype, "text": text,
            "status": "delivered", "media_url": media_url, "filename": mobj.get("filename"), "from_number": from_num,
            "read": False, "created_at": now_iso(),
        })
        await db.leads.update_one({"id": lead["id"]}, {"$set": {"last_inbound_at": now_iso(), "updated_at": now_iso()}})
        await log_activity("whatsapp", lead, {"id": None, "name": lead.get("name") or "Lead"}, "sent an incoming WhatsApp message", {"text": (text or f"[{mtype}]")[:60]})
        saved += 1

    await log_integration("whatsapp_inbound", {"saved": saved})
    return {"ok": True, "saved": saved}

class ManualCallIn(BaseModel):
    from_number: str
    to_number: str
    segment: Optional[str] = None

# ---------------------------------------------------------------------------
# ExoPhones — mirror of the full Exotel call Inbox (same data for Investor + Driver)
# ---------------------------------------------------------------------------
_EXO_STATUS = {"completed": "Call was successful", "no-answer": "No user answered",
               "busy": "Busy", "failed": "Call failed", "canceled": "Client hung-up before connecting"}

def _exo_outcome(x: dict, direction: str):
    """Same outcome labels as the Exotel Inbox, derived from leg statuses."""
    d = x.get("Details") or {}
    l1 = (d.get("Leg1Status") or "").lower()
    l2 = (d.get("Leg2Status") or "").lower()
    talk = int(d.get("ConversationDuration") or 0)
    if l2 == "completed" and talk > 0:
        return "success", "Call was successful"
    if direction == "outgoing" and l1 in ("busy", "failed", "no-answer", "canceled"):
        return "failed", {"busy": "Agent was busy", "no-answer": "Agent did not answer"}.get(l1, "Agent leg failed")
    if l2 == "no-answer":
        return "no_answer", "No user answered"
    if l2 in ("failed", "canceled", "busy"):
        return "hangup_during", "Client hung-up during call"
    if not l2 and l1 == "completed":
        return "hangup_before", "Client hung-up before connecting to any user"
    st = (x.get("Status") or "").lower()
    if st == "completed":
        return "success", "Call was successful"
    return "failed", _EXO_STATUS.get(st, st.replace("-", " ").title())

_EXO_AGENT_CACHE = {"at": 0, "map": {}}

async def _exo_agents(c, key, token, sid):
    """Exotel CCM users -> {last10: (name, initials)}; cached 10 min."""
    import time
    if time.time() - _EXO_AGENT_CACHE["at"] < 600 and _EXO_AGENT_CACHE["map"]:
        return _EXO_AGENT_CACHE["map"]
    m = {}
    try:
        r = await c.get(f"https://ccm-api.exotel.com/v2/accounts/{sid}/users?limit=50&fields=devices", auth=(key, token))
        for u in (r.json().get("response") or []):
            d = u.get("data") or {}
            fn, ln = (d.get("first_name") or "").strip(), (d.get("last_name") or "").strip()
            name = (fn + " " + ln).strip()
            ini = ((fn[:1] + ln[:1]) or name[:2]).upper()
            for dev in d.get("devices") or []:
                n10 = "".join(ch for ch in str(dev.get("contact_uri") or "") if ch.isdigit())[-10:]
                if len(n10) == 10:
                    m[n10] = (name, ini)
        if m:
            _EXO_AGENT_CACHE.update({"at": time.time(), "map": m})
    except Exception as e:
        logger.warning("Exotel users fetch failed: %s", e)
    return m or _EXO_AGENT_CACHE["map"]

async def exo_sync_calls(pages: int = 1):
    """Pull latest calls from Exotel Calls API and upsert into db.exo_calls."""
    import httpx
    key, token = os.environ.get("EXOTEL_API_KEY"), os.environ.get("EXOTEL_API_TOKEN")
    sid = os.environ.get("EXOTEL_ACCOUNT_SID")
    if not (key and token and sid):
        return {"ok": False, "error": "Exotel keys missing"}
    base = "https://" + os.environ.get("EXOTEL_SUBDOMAIN", "api.exotel.com")
    url = f"{base}/v1/Accounts/{sid}/Calls.json?PageSize=100&details=true"
    saved = 0
    async with httpx.AsyncClient(timeout=30) as c:
        agents = await _exo_agents(c, key, token, sid)
        for _ in range(pages):
            r = await c.get(url, auth=(key, token))
            if r.status_code >= 400:
                logger.warning("Exotel calls sync failed: %s %s", r.status_code, r.text[:200])
                return {"ok": False, "error": f"Exotel {r.status_code}"}
            data = r.json()
            calls = data.get("Calls") or ([data["Call"]] if isinstance(data.get("Call"), dict) else data.get("Call") or [])
            for x in calls:
                csid = x.get("Sid")
                if not csid:
                    continue
                direction = "incoming" if (x.get("Direction") or "").startswith("inbound") else "outgoing"
                customer = x.get("From") if direction == "incoming" else x.get("To")
                lead = await find_lead_by_phone(customer or "")
                status = (x.get("Status") or "").lower()
                doc = {
                    "sid": csid, "from_number": x.get("From"), "to_number": x.get("To"),
                    "exophone": x.get("PhoneNumberSid"), "direction": direction,
                    "status": status, "outcome_kind": _exo_outcome(x, direction)[0], "outcome": _exo_outcome(x, direction)[1],
                    "talk_time": int((x.get("Details") or {}).get("ConversationDuration") or 0),
                    "duration": int(x.get("Duration") or 0),
                    "start_time": x.get("StartTime") or x.get("DateCreated"),
                    "end_time": x.get("EndTime"), "recording_url": x.get("RecordingUrl"),
                    "caller_name": x.get("CallerName"), "answered_by": x.get("AnsweredBy"),
                    "lead_id": (lead or {}).get("id"), "lead_name": (lead or {}).get("name"),
                    "lead_segment": (lead or {}).get("segment"),
                    "synced_at": now_iso(),
                }
                # Incoming: "To" becomes the staff number once routed (else it equals the ExoPhone)
                if direction == "incoming":
                    to10 = "".join(ch for ch in str(x.get("To") or "") if ch.isdigit())[-10:]
                    exo10 = "".join(ch for ch in str(x.get("PhoneNumberSid") or "") if ch.isdigit())[-10:]
                    ag = x.get("To") if to10 and to10 != exo10 else ""
                else:
                    ag = x.get("From") or ""
                ag10 = "".join(ch for ch in str(ag) if ch.isdigit())[-10:]
                hit = agents.get(ag10) if len(ag10) == 10 else None
                doc.update({"exophone_number": x.get("PhoneNumber"), "agent_number": ag or None,
                            "agent_name": hit[0] if hit else None, "agent_initials": hit[1] if hit else None,
                            "l1answered_by": x.get("l1answered_by"), "l2answered_by": x.get("l2answered_by")})
                res = await db.exo_calls.update_one({"sid": csid}, {"$set": doc}, upsert=True)
                saved += 1 if res.upserted_id else 0
            nxt = (data.get("Metadata") or {}).get("NextPageUri")
            if not nxt:
                break
            url = base + nxt
    return {"ok": True, "new": saved}

async def _exo_sync_loop():
    while True:
        try:
            await exo_sync_calls()
        except Exception as e:
            logger.warning("ExoPhones sync error: %s", e)
        await asyncio.sleep(60)

@api.get("/exophones/calls")
async def exophones_calls(q: str = "", direction: str = "", limit: int = 25, skip: int = 0, user: dict = Depends(get_current_user)):
    f = {}
    if direction in ("incoming", "outgoing"):
        f["direction"] = direction
    if q:
        rx = {"$regex": q.strip(), "$options": "i"}
        f["$or"] = [{"from_number": rx}, {"to_number": rx}, {"lead_name": rx}, {"sid": rx}, {"caller_name": rx}]
    total = await db.exo_calls.count_documents(f)
    rows = await db.exo_calls.find(f, {"_id": 0}).sort("start_time", -1).skip(max(skip, 0)).limit(min(limit, 1000)).to_list(min(limit, 1000))
    last = await db.exo_calls.find_one({}, {"_id": 0, "synced_at": 1}, sort=[("synced_at", -1)])
    # Who owns each lead now (name + location) -> row shows as taken
    lids = list({r["lead_id"] for r in rows if r.get("lead_id")})
    leads = {l["id"]: l for l in await db.leads.find({"id": {"$in": lids}}, {"_id": 0, "id": 1, "assigned_to": 1, "assigned_name": 1}).to_list(2000)}
    uids = list({l["assigned_to"] for l in leads.values() if l.get("assigned_to")} | {r["claimed_by"] for r in rows if r.get("claimed_by")})
    users = {u["id"]: u for u in await db.users.find({"id": {"$in": uids}}, {"_id": 0, "id": 1, "name": 1, "location": 1}).to_list(500)}
    is_admin = user.get("role") == "admin"
    for r in rows:
        owner = (leads.get(r.get("lead_id")) or {}).get("assigned_to") or r.get("claimed_by")
        u = users.get(owner) if owner else None
        r["claimed_by"] = owner or None
        r["claimed_name"] = (u or {}).get("name") or r.get("claimed_name")
        r["claimed_location"] = (u or {}).get("location") or r.get("claimed_location") or ""
        if not is_admin:
            for k in ("recording_url", "duration", "talk_time"):
                r.pop(k, None)
    return {"items": rows, "last_sync": (last or {}).get("synced_at"), "is_admin": is_admin, "total": total}

@api.post("/exophones/sync")
async def exophones_sync(user: dict = Depends(get_current_user)):
    return await exo_sync_calls(pages=3)

@api.post("/exophones/calls/{sid}/claim")
async def exophones_claim(sid: str, segment: str = "investor", user: dict = Depends(get_current_user)):
    """Assign to me: first staff to click gets the caller's lead (created if new)."""
    call = await db.exo_calls.find_one_and_update(
        {"sid": sid, "claimed_by": None},
        {"$set": {"claimed_by": user["id"], "claimed_name": user.get("name", ""),
                  "claimed_location": user.get("location", ""), "claimed_at": now_iso()}},
        return_document=True)
    if not call:
        row = await db.exo_calls.find_one({"sid": sid}, {"_id": 0, "claimed_name": 1})
        if not row:
            raise HTTPException(status_code=404, detail="Call not found")
        raise HTTPException(status_code=409, detail=f"Already taken by {row.get('claimed_name') or 'someone'}")
    customer = call.get("from_number") if call.get("direction") == "incoming" else call.get("to_number")
    c10 = norm_phone(customer or "")
    org = org_of(user)
    lead = await find_lead_by_phone(customer or "", org)
    if lead and lead.get("assigned_to") and lead["assigned_to"] != user["id"]:
        owner = await db.users.find_one({"id": lead["assigned_to"]}, {"_id": 0, "name": 1, "location": 1}) or {}
        await db.exo_calls.update_one({"sid": sid}, {"$set": {"claimed_by": lead["assigned_to"],
            "claimed_name": owner.get("name") or lead.get("assigned_name"), "claimed_location": owner.get("location", ""),
            "lead_id": lead["id"], "lead_name": lead.get("name")}})
        raise HTTPException(status_code=409, detail=f"Lead already assigned to {owner.get('name') or lead.get('assigned_name')}")
    seg = "driver" if segment == "driver" else "investor"
    if lead:
        await db.leads.update_one({"id": lead["id"]}, {"$set": {"assigned_to": user["id"], "assigned_name": user.get("name", ""),
                                  "is_common": False, "claimed_at": now_iso(), "updated_at": now_iso()}})
        await db.followups.update_many({"lead_id": lead["id"], "assigned_to": None},
                                       {"$set": {"assigned_to": user["id"], "assigned_name": user.get("name", "")}})
    else:
        lead = {
            "id": str(uuid.uuid4()), "organization_id": org,
            "name": call.get("caller_name") or customer, "company": "", "phone": customer, "phone_norm": c10, "whatsapp": customer,
            "email": "", "location": "", "product": "", "source": "exotel_call", "status": "new", "priority": "medium",
            "segment": seg, "is_common": False, "assigned_to": user["id"], "assigned_name": user.get("name", ""),
            "value": 0, "notes": "", "next_followup": None, "remarks": "From ExoPhones call",
            "created_by": user["id"], "created_by_name": user.get("name", ""),
            "created_at": now_iso(), "updated_at": now_iso(),
        }
        await db.leads.insert_one(dict(lead))
    await log_activity("lead_claimed", lead, user, "assigned an ExoPhones caller to themselves")
    if len(c10) == 10:
        rx = {"$regex": c10 + "$"}
        await db.exo_calls.update_many({"$or": [{"direction": "incoming", "from_number": rx}, {"direction": "outgoing", "to_number": rx}]},
                                       {"$set": {"lead_id": lead["id"], "lead_name": lead.get("name"), "lead_segment": lead.get("segment", seg)}})
    return {"ok": True, "lead_id": lead["id"], "claimed_name": user.get("name", ""), "claimed_location": user.get("location", "")}

@api.get("/exophones/recording/{sid}")
async def exophones_recording(sid: str, user: dict = Depends(get_current_user)):
    import httpx
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only admin can play recordings")
    row = await db.exo_calls.find_one({"sid": sid})
    if not row or not row.get("recording_url"):
        raise HTTPException(status_code=404, detail="No recording")
    async with httpx.AsyncClient(timeout=60, follow_redirects=True) as c:
        r = await c.get(row["recording_url"], auth=(os.environ.get("EXOTEL_API_KEY", ""), os.environ.get("EXOTEL_API_TOKEN", "")))
    if r.status_code >= 400:
        raise HTTPException(status_code=502, detail="Recording not available")
    return Response(content=r.content, media_type=r.headers.get("content-type", "audio/mpeg"))

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
        q["segment"] = seg_match(segment)
        
    if date_from or date_to:
        created_filter = {}
        if date_from:
            created_filter["$gte"] = date_from + "T00:00:00.000Z"
        if date_to:
            created_filter["$lte"] = date_to + "T23:59:59.999Z"
        if created_filter:
            q["created_at"] = created_filter

    if can_view_all(user):
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

    m_lead = await find_lead_by_phone(to_num, org_of(user))
    call = {
        "id": str(uuid.uuid4()), "organization_id": org_of(user), "lead_id": (m_lead or {}).get("id"),
        "segment": (m_lead or {}).get("segment") or body.segment or "investor",
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
    if not can_view_all(user):
        base["assigned_to"] = user["id"]
    if segment:
        leads = await db.leads.find({"segment": seg_match(segment)}).to_list(None)
        lead_ids = [l["id"] for l in leads]
        base["lead_id"] = {"$in": lead_ids}
    fs = await db.followups.find(base).sort("due_at", 1).to_list(1000)
    _fu_ok = {l["id"] for l in await db.leads.find({"id": {"$in": [f.get("lead_id") for f in fs]}, "status": "follow_up"}).to_list(None)}
    fs = [f for f in fs if f.get("lead_id") in _fu_ok]
    now = datetime.now(timezone.utc)
    out = []
    for f in fs:
        try:
            due = datetime.fromisoformat(f["due_at"])
        except Exception:
            continue
        overdue = due < now
        today = ist_date(due) == today_ist()
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
    if not can_view_all(user):
        base["assigned_to"] = user["id"]
    if segment:
        seg_leads = await db.leads.find({"segment": seg_match(segment), "organization_id": org_of(user)}).to_list(None)
        base["lead_id"] = {"$in": [l["id"] for l in seg_leads]}
    
    fs = await db.followups.find(base).sort("due_at", 1).to_list(1000)
    _fu_ok = {l["id"] for l in await db.leads.find({"id": {"$in": [f.get("lead_id") for f in fs]}, "status": "follow_up"}).to_list(None)}
    fs = [f for f in fs if f.get("lead_id") in _fu_ok]
    now = datetime.now(timezone.utc)
    today = today_ist()

    overdue, today_list = [], []
    for f in fs:
        try:
            due = datetime.fromisoformat(f["due_at"])
        except Exception:
            continue
        (overdue if due < now else today_list).append((due, f))
    today_only = [x for x in today_list if ist_date(x[0]) == today]

    lead_scope = {"priority": "high", "status": {"$nin": ["converted", "lost"]}}
    if segment:
        lead_scope["segment"] = seg_match(segment)
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
    if not can_view_all(user):
        base["assigned_to"] = user["id"]
    if segment:
        base["segment"] = seg_match(segment)
    cs = await db.customers.find(base).sort("converted_at", -1).to_list(1000)
    return [clean(c) for c in cs]

@api.get("/customers/{cid}")
async def get_customer(cid: str, user: dict = Depends(get_current_user)):
    c = await db.customers.find_one({"id": cid})
    if not c or c.get("organization_id", DEFAULT_ORG) != org_of(user):
        raise HTTPException(status_code=404, detail="Customer not found")
    if not can_view_all(user) and c.get("assigned_to") != user["id"]:
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
    if not can_view_all(user):
        q["user_id"] = user["id"]
    if segment:
        seg_leads = await db.leads.find({"segment": seg_match(segment), "organization_id": org_of(user)}).to_list(None)
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
        lead_q["segment"] = seg_match(segment)
        cust_q["segment"] = seg_match(segment)
    leads = await db.leads.find(lead_q).to_list(10)
    if not can_view_all(user):
        cust_q["assigned_to"] = user["id"]
    custs = await db.customers.find(cust_q).to_list(10)
    return {"leads": [clean(l) for l in leads], "customers": [clean(c) for c in custs]}

# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------
@api.get("/dashboard/stats")
async def dashboard_stats(segment: Optional[str] = None, user: dict = Depends(get_current_user)):
    base = {"is_common": {"$ne": True}}
    if segment:
        base["segment"] = seg_match(segment)
    all_leads = await db.leads.find(scope_leads(user, base)).to_list(5000)
    lead_ids = [l["id"] for l in all_leads]
    now = datetime.now(timezone.utc)
    today = today_ist()

    def created_on(l, d):
        try:
            return ist_date(l["created_at"]) == d
        except Exception:
            return False

    new_today = len([l for l in all_leads if created_on(l, today)])
    funnel = {s: len([l for l in all_leads if l.get("status") == s]) for s in STATUSES}

    loose = {"lead_id": None, "organization_id": org_of(user)}
    if segment:
        loose["segment"] = seg_match(segment)
    if not can_view_all(user):
        loose["user_id"] = user["id"]
    calls = await db.calls.find({"$or": [{"lead_id": {"$in": lead_ids}}, loose]}).to_list(5000)
    connected = len([c for c in calls if c.get("status") in comm.CONNECTED_STATES])

    fu_base = {"status": "pending", "organization_id": org_of(user), "lead_id": {"$in": lead_ids}}
    if not can_view_all(user):
        fu_base["assigned_to"] = user["id"]
    followups = await db.followups.find(fu_base).to_list(2000)
    _fu_ok = {l["id"] for l in all_leads if l.get("status") == "follow_up"}
    followups = [f for f in followups if f.get("lead_id") in _fu_ok]
    fu_today = 0
    for f in followups:
        try:
            if ist_date(f["due_at"]) == today:
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
                    if ist_date(it[key_date]) == d:
                        c += 1
                except Exception:
                    pass
            counts.append(c)
        return counts

    conv_items = [{"d": l.get("converted_at") or l.get("updated_at") or l.get("created_at")} for l in converted]
    def _in(it, a, b):
        try:
            return a <= ist_date(it["d"]) <= b
        except Exception:
            return False
    wk = len([c for c in conv_items if _in(c, today - timedelta(days=6), today)])
    pw = len([c for c in conv_items if _in(c, today - timedelta(days=13), today - timedelta(days=7))])
    conv_delta = round((wk - pw) / pw * 100) if pw else (100 if wk else 0)

    return {
        "new_leads": {"total": len(all_leads), "delta_today": new_today, "spark": spark(all_leads, "created_at")},
        "follow_ups": {"total": len(followups), "due_today": fu_today},
        "calls": {"total": len(calls), "connected": connected,
                  "rate": round(connected / (len(calls) or 1) * 100)},
        "conversions": {"total": len(converted), "delta_pct": conv_delta, "spark": spark(conv_items, "d")},
        "funnel": funnel, "sources": sources,
    }

@api.get("/config")
async def get_config(user: dict = Depends(get_current_user)):
    return {"communication_provider": comm.provider_name(), "role": user.get("role")}

@api.get("/config/balance")
async def get_balance(user: dict = Depends(get_current_user)):
    if not can_view_all(user):
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
        await db.users.create_index("phone", unique=True, partialFilterExpression={"phone": {"$type": "string"}})
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
    # Demo team + demo leads only when explicitly enabled (never on live)
    if os.environ.get("SEED_DEMO_DATA", "false").lower() == "true" and os.environ.get("APP_ENV", "development").lower() != "production":
        await seed_team()
        await seed()
    await migrate()
    asyncio.create_task(_exo_sync_loop())
@api.post("/upload")
async def upload_file(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    try:
        os.makedirs("uploads", exist_ok=True)
        ext = file.filename.rsplit('.', 1)[-1].lower() if '.' in file.filename else 'bin'
        allowed = {'jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt', 'mp4', '3gp', 'mp3', 'ogg', 'aac', 'm4a', 'amr', 'bin'}
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
