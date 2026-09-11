import re

with open("server.py", "r") as f:
    content = f.read()

# 1. LeadIn model
content = re.sub(
    r'priority: str = "medium"',
    r'priority: str = "medium"\n    segment: str = "investor"',
    content
)

# 2. create_lead
content = re.sub(
    r'"source": body\.source, "status": body\.status, "priority": body\.priority,',
    r'"source": body.source, "status": body.status, "priority": body.priority,\n        "segment": body.segment,',
    content
)

# 3. list_leads
content = re.sub(
    r'assigned_to: Optional\[str\] = None, q: Optional\[str\] = None,',
    r'assigned_to: Optional[str] = None, q: Optional[str] = None, segment: Optional[str] = None,',
    content
)
content = re.sub(
    r'base = \{\}\n    if status:',
    r'base = {}\n    if segment:\n        base["segment"] = segment\n    if status:',
    content
)

# 4. dashboard_stats
content = re.sub(
    r'async def dashboard_stats\(user: dict = Depends\(get_current_user\)\):',
    r'async def dashboard_stats(segment: Optional[str] = None, user: dict = Depends(get_current_user)):',
    content
)
content = re.sub(
    r'all_leads = await db\.leads\.find\(scope_leads\(user\)\)\.to_list\(5000\)',
    r'base = {}\n    if segment:\n        base["segment"] = segment\n    all_leads = await db.leads.find(scope_leads(user, base)).to_list(5000)',
    content
)

# 5. change_stage (customer creation)
content = re.sub(
    r'"source": lead\.get\("source"\), "value": lead\.get\("value", 0\),',
    r'"source": lead.get("source"), "value": lead.get("value", 0),\n                "segment": lead.get("segment"),',
    content
)

# 6. list_customers
content = re.sub(
    r'async def list_customers\(user: dict = Depends\(get_current_user\)\):',
    r'async def list_customers(segment: Optional[str] = None, user: dict = Depends(get_current_user)):',
    content
)
content = re.sub(
    r'if not is_manager\(user\):\n        base\["assigned_to"\] = user\["id"\]\n    custs = await db\.customers\.find\(base\)',
    r'if not is_manager(user):\n        base["assigned_to"] = user["id"]\n    if segment:\n        base["segment"] = segment\n    custs = await db.customers.find(base)',
    content
)

# 7. list_followups
content = re.sub(
    r'async def list_followups\(scope: str = "all", user: dict = Depends\(get_current_user\)\):',
    r'async def list_followups(scope: str = "all", segment: Optional[str] = None, user: dict = Depends(get_current_user)):',
    content
)
content = re.sub(
    r'if not is_manager\(user\):\n        base\["assigned_to"\] = user\["id"\]\n    fs = await db\.followups\.find\(base\)',
    r'if not is_manager(user):\n        base["assigned_to"] = user["id"]\n    if segment:\n        leads = await db.leads.find({"segment": segment}).to_list(None)\n        lead_ids = [l["id"] for l in leads]\n        base["lead_id"] = {"$in": lead_ids}\n    fs = await db.followups.find(base)',
    content
)

with open("server.py", "w") as f:
    f.write(content)

print("Patched server.py")
