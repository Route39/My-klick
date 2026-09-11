import re

with open("backend/server.py", "r") as f:
    content = f.read()

old_briefing = """@api.get("/briefing")
async def briefing(user: dict = Depends(get_current_user)):
    base = {"status": "pending", "organization_id": org_of(user)}
    if not is_manager(user):
        base["assigned_to"] = user["id"]
    fs = await db.followups.find(base).sort("due_at", 1).to_list(1000)"""

new_briefing = """@api.get("/briefing")
async def briefing(segment: Optional[str] = None, user: dict = Depends(get_current_user)):
    # Scope followups by segment if provided
    base = {"status": "pending", "organization_id": org_of(user)}
    if not is_manager(user):
        base["assigned_to"] = user["id"]
    if segment:
        seg_leads = await db.leads.find({"segment": segment, "organization_id": org_of(user)}).to_list(None)
        base["lead_id"] = {"$in": [l["id"] for l in seg_leads]}
    
    fs = await db.followups.find(base).sort("due_at", 1).to_list(1000)"""

# Also need to fix high_leads logic to use segment!
old_high_leads = """    lead_scope = scope_leads(user, {"priority": "high", "status": {"$nin": ["converted", "lost"]}})
    high_leads = await db.leads.find(lead_scope).to_list(500)"""

new_high_leads = """    lead_scope = {"priority": "high", "status": {"$nin": ["converted", "lost"]}}
    if segment:
        lead_scope["segment"] = segment
    lead_scope = scope_leads(user, lead_scope)
    high_leads = await db.leads.find(lead_scope).to_list(500)"""

content = content.replace(old_briefing, new_briefing)
content = content.replace(old_high_leads, new_high_leads)

with open("backend/server.py", "w") as f:
    f.write(content)

print("Patched server.py briefing properly")
