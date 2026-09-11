import re

with open("backend/server.py", "r") as f:
    content = f.read()

old_team = """@api.get("/team")
async def team_performance(user: dict = Depends(get_current_user)):
    users = await db.users.find({"organization_id": org_of(user)}).to_list(200)
    if not is_manager(user):
        users = [u for u in users if u["id"] == user["id"]]
    out = []
    for u in users:
        leads = await db.leads.find({"assigned_to": u["id"]}).to_list(2000)"""

new_team = """@api.get("/team")
async def team_performance(segment: str = "investor", user: dict = Depends(get_current_user)):
    users = await db.users.find({"organization_id": org_of(user)}).to_list(200)
    if not is_manager(user):
        users = [u for u in users if u["id"] == user["id"]]
    out = []
    for u in users:
        leads = await db.leads.find({"assigned_to": u["id"], "segment": segment}).to_list(2000)"""

content = content.replace(old_team, new_team)

with open("backend/server.py", "w") as f:
    f.write(content)

print("Patched server.py team")
