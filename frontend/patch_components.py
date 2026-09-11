import os
import re

def patch_file(path, replacements):
    with open(path, "r") as f:
        content = f.read()
    for (pattern, repl) in replacements:
        content = re.sub(pattern, repl, content, flags=re.MULTILINE)
    with open(path, "w") as f:
        f.write(content)

# 1. Dashboard.jsx
patch_file("src/pages/Dashboard.jsx", [
    (r'export default function Dashboard\(\) \{', r'export default function Dashboard({ segment = "investor" }) {'),
    (r'API\.get\("/dashboard/stats"\)', r'API.get("/dashboard/stats", { params: { segment } })'),
    (r'API\.get\(`/activities\?limit=\$\{limit\}`\)', r'API.get(`/activities`, { params: { limit, segment } })')
])

# 2. Leads.jsx
patch_file("src/pages/Leads.jsx", [
    (r'export default function Leads\(\) \{', r'export default function Leads({ segment = "investor" }) {'),
    (r'API\.get\("/leads", \{ params \}\)', r'API.get("/leads", { params: { ...params, segment } })')
])

# 3. Pipeline.jsx
patch_file("src/pages/Pipeline.jsx", [
    (r'export default function Pipeline\(\) \{', r'export default function Pipeline({ segment = "investor" }) {'),
    (r'API\.get\("/leads", \{ params \}\)', r'API.get("/leads", { params: { ...params, segment } })')
])

# 4. FollowUps.jsx
patch_file("src/pages/FollowUps.jsx", [
    (r'export default function FollowUps\(\) \{', r'export default function FollowUps({ segment = "investor" }) {'),
    (r'API\.get\(`/followups\?scope=\$\{scope\}`\)', r'API.get(`/followups`, { params: { scope, segment } })')
])

# 5. Customers.jsx
patch_file("src/pages/Customers.jsx", [
    (r'export default function Customers\(\) \{', r'export default function Customers({ segment = "investor" }) {'),
    (r'API\.get\("/customers"\)', r'API.get("/customers", { params: { segment } })')
])

# 6. AddLeadDialog.jsx
patch_file("src/components/AddLeadDialog.jsx", [
    (r'export function AddLeadDialog\(\{ open, onOpenChange, defaultStatus = "new" \}\) \{', r'export function AddLeadDialog({ open, onOpenChange, defaultStatus = "new", segment = "investor" }) {'),
    (r'await API\.post\("/leads", \{', r'await API.post("/leads", { segment,'),
    (r'status: defaultStatus\n        \}\)', r'status: defaultStatus,\n          segment\n        })')
])

# 7. AppShell.jsx
patch_file("src/components/layout/AppShell.jsx", [
    (r'import \{ NavLink, Outlet, useNavigate \} from "react-router-dom";', r'import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";'),
    (r'const navigate = useNavigate\(\);', r'const navigate = useNavigate();\n  const location = useLocation();\n  const currentSegment = location.pathname.startsWith("/drivers") ? "driver" : "investor";'),
    (r'<AddLeadDialog open=\{addState\.open\} onOpenChange=\{\(v\) => setAddState\(\(s\) => \(\{ \.\.\.s, open: v \}\)\)\} defaultStatus=\{addState\.status\} />', r'<AddLeadDialog open={addState.open} onOpenChange={(v) => setAddState((s) => ({ ...s, open: v }))} defaultStatus={addState.status} segment={currentSegment} />')
])

print("Patched frontend components")
