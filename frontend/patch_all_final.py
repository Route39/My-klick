import re

def patch(path, patterns):
    try:
        with open(path, "r") as f:
            content = f.read()
        for p, repl in patterns:
            content = re.sub(p, repl, content)
        with open(path, "w") as f:
            f.write(content)
        print(f"Patched {path}")
    except Exception as e:
        print(f"Error {path}: {e}")

patch("src/pages/Dashboard.jsx", [
    (r'export default function Dashboard\(\) \{', r'export default function Dashboard({ segment = "investor" }) {'),
    (r'api\.get\("/dashboard/stats"\)', r'api.get("/dashboard/stats", { params: { segment } })'),
    (r'api\.get\(`/activities\?limit=\$\{limit\}`\)', r'api.get(`/activities`, { params: { limit, segment } })'),
    (r'queryKey: \["stats"\]', r'queryKey: ["stats", segment]'),
    (r'queryKey: \["activities"\]', r'queryKey: ["activities", segment]')
])

patch("src/pages/Leads.jsx", [
    (r'export default function Leads\(\) \{', r'export default function Leads({ segment = "investor" }) {'),
    (r'api\.get\("/leads", \{ params \}\)', r'api.get("/leads", { params: { ...params, segment } })'),
    (r'queryKey: \["leads", params\]', r'queryKey: ["leads", params, segment]')
])

patch("src/pages/Pipeline.jsx", [
    (r'export default function Pipeline\(\) \{', r'export default function Pipeline({ segment = "investor" }) {'),
    (r'api\.get\("/leads", \{ params \}\)', r'api.get("/leads", { params: { ...params, segment } })'),
    (r'queryKey: \["leads", params\]', r'queryKey: ["leads", params, segment]')
])

patch("src/pages/FollowUps.jsx", [
    (r'export default function FollowUps\(\) \{', r'export default function FollowUps({ segment = "investor" }) {'),
    (r'api\.get\(`/followups\?scope=\$\{scope\}`\)', r'api.get(`/followups`, { params: { scope, segment } })'),
    (r'queryKey: \["followups", scope\]', r'queryKey: ["followups", scope, segment]')
])

patch("src/pages/Customers.jsx", [
    (r'export default function Customers\(\) \{', r'export default function Customers({ segment = "investor" }) {'),
    (r'api\.get\("/customers"\)', r'api.get("/customers", { params: { segment } })'),
    (r'queryKey: \["customers"\]', r'queryKey: ["customers", segment]')
])

patch("src/components/AddLeadDialog.jsx", [
    (r'export function AddLeadDialog\(\{ open, onOpenChange, defaultStatus = "new" \}\) \{', r'export function AddLeadDialog({ open, onOpenChange, defaultStatus = "new", segment = "investor" }) {'),
    (r'api\.post\("/leads", \{', r'api.post("/leads", { segment,'),
    (r'status: defaultStatus\n        \}\)\)', r'status: defaultStatus,\n          segment\n        }))')
])

