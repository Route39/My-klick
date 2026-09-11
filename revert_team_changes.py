import re

# 1. Revert App.js
with open("frontend/src/App.js", "r") as f:
    app_content = f.read()

app_content = app_content.replace('<Route path="/team" element={<Team segment="investor" />} />', '<Route path="/team" element={<Team />} />')
app_content = app_content.replace('            <Route path="/drivers/team" element={<Team segment="driver" />} />\n', '')

with open("frontend/src/App.js", "w") as f:
    f.write(app_content)

# 2. Revert Team.jsx
with open("frontend/src/pages/Team.jsx", "r") as f:
    team_content = f.read()

team_content = team_content.replace('export default function Team({ segment = "investor" }) {', 'export default function Team() {')
team_content = team_content.replace('queryKey: ["team", segment],', 'queryKey: ["team"],')
team_content = team_content.replace('api.get("/team", { params: { segment } })', 'api.get("/team")')

with open("frontend/src/pages/Team.jsx", "w") as f:
    f.write(team_content)

# 3. Revert server.py
with open("backend/server.py", "r") as f:
    server_content = f.read()

old_server_team = """@api.get("/team")
async def team_performance(segment: str = "investor", user: dict = Depends(get_current_user)):
    users = await db.users.find({"organization_id": org_of(user)}).to_list(200)
    if not is_manager(user):
        users = [u for u in users if u["id"] == user["id"]]
    out = []
    for u in users:
        leads = await db.leads.find({"assigned_to": u["id"], "segment": segment}).to_list(2000)"""

new_server_team = """@api.get("/team")
async def team_performance(user: dict = Depends(get_current_user)):
    users = await db.users.find({"organization_id": org_of(user)}).to_list(200)
    if not is_manager(user):
        users = [u for u in users if u["id"] == user["id"]]
    out = []
    for u in users:
        leads = await db.leads.find({"assigned_to": u["id"]}).to_list(2000)"""

server_content = server_content.replace(old_server_team, new_server_team)

with open("backend/server.py", "w") as f:
    f.write(server_content)

print("Reverted team changes successfully")
