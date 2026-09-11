import re

with open("backend/server.py", "r") as f:
    content = f.read()

old_stats = r'''    fu_base = \{"status": "pending", "organization_id": org_of\(user\)\}
    if not is_manager\(user\):
        fu_base\["assigned_to"\] = user\["id"\]
    followups = await db.followups.find\(fu_base\).to_list\(2000\)'''

new_stats = r'''    fu_base = {"status": "pending", "organization_id": org_of(user), "lead_id": {"$in": lead_ids}}
    if not is_manager(user):
        fu_base["assigned_to"] = user["id"]
    followups = await db.followups.find(fu_base).to_list(2000)'''

content = re.sub(old_stats, new_stats, content)

with open("backend/server.py", "w") as f:
    f.write(content)

print("Patched dashboard_stats")
