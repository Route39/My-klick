import re
import os

# 1. Update GlobalSearch.jsx
with open("frontend/src/components/GlobalSearch.jsx", "r") as f:
    content = f.read()

content = re.sub(
    r'export function GlobalSearch\(\{ open, onOpenChange \}\) \{',
    r'export function GlobalSearch({ open, onOpenChange, segment }) {',
    content
)

content = re.sub(
    r'api\.get\(`/search\?q=\$\{encodeURIComponent\(q\)\}`\)',
    r'api.get(`/search?q=${encodeURIComponent(q)}&segment=${segment || ""}`)',
    content
)

# Route to proper lead details page based on segment
content = re.sub(
    r'go\(`/leads/\$\{l\.id\}`\)',
    r'go(segment === "driver" ? `/drivers/leads/${l.id}` : `/leads/${l.id}`)',
    content
)

with open("frontend/src/components/GlobalSearch.jsx", "w") as f:
    f.write(content)

# 2. Update AppShell.jsx
with open("frontend/src/components/layout/AppShell.jsx", "r") as f:
    content = f.read()

content = re.sub(
    r'<GlobalSearch open=\{searchOpen\} onOpenChange=\{setSearchOpen\} />',
    r'<GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} segment={currentSegment} />',
    content
)

with open("frontend/src/components/layout/AppShell.jsx", "w") as f:
    f.write(content)

# 3. Update server.py
with open("backend/server.py", "r") as f:
    content = f.read()

content = re.sub(
    r'@api\.get\("/search"\)\nasync def search\(q: str, user: dict = Depends\(get_current_user\)\):',
    r'@api.get("/search")\nasync def search(q: str, segment: str = "", user: dict = Depends(get_current_user)):',
    content
)

old_search = r'''    regex = {"\$regex": q, "\$options": "i"}
    lead_q = scope_leads\(user, \{"\$or": \[\{"name": regex\}, \{"company": regex\}, \{"phone": regex\}, \{"whatsapp": regex\}\]\}\)
    leads = await db\.leads\.find\(lead_q\)\.to_list\(10\)
    cust_q = \{"organization_id": org_of\(user\), "\$or": \[\{"name": regex\}, \{"phone": regex\}\]\}'''

new_search = r'''    regex = {"$regex": q, "$options": "i"}
    lead_q = scope_leads(user, {"$or": [{"name": regex}, {"company": regex}, {"phone": regex}, {"whatsapp": regex}]})
    cust_q = {"organization_id": org_of(user), "$or": [{"name": regex}, {"phone": regex}]}
    if segment:
        lead_q["segment"] = segment
        cust_q["segment"] = segment
    leads = await db.leads.find(lead_q).to_list(10)'''

content = re.sub(old_search, new_search, content)

with open("backend/server.py", "w") as f:
    f.write(content)

print("Patch applied")
