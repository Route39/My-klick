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
async def team_performance(user: dict = Depends(get_current_user)):
    users = await db.users.find({"organization_id": org_of(user)}).to_list(200)
    if not is_manager(user):
        users = [u for u in users if u.get("id") == user.get("id")]
    out = []
    for u in users:
        u_id = u.get("id") or str(u.get("_id", ""))
        leads = await db.leads.find({"assigned_to": u_id}).to_list(2000)"""

content = content.replace(old_team, new_team)

old_loop = """        out.append({
            "id": u["id"], "name": u["name"], "role": u["role"], "avatar": u.get("avatar"),
            "phone": u.get("phone", ""), "email": u.get("email", ""),"""

new_loop = """        out.append({
            "id": u_id, "name": u.get("name", "Unknown"), "role": u.get("role", "sales"), "avatar": u.get("avatar"),
            "phone": u.get("phone", ""), "email": u.get("email", ""),"""

content = content.replace(old_loop, new_loop)

with open("backend/server.py", "w") as f:
    f.write(content)

print("Fixed team performance KeyError")
