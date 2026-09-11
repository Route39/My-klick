import re

# --- DriverLeads.jsx ---
with open("src/pages/drivers/DriverLeads.jsx", "r") as f:
    c = f.read()
# Fix queryKey and queryFn
c = re.sub(
    r'queryKey: \["leads", status\],\n    queryFn: async \(\) => \{\n      const queryParams = status \? `\?status=\$\{status\}` : `\?exclude_status=follow_up`;\n      return \(await api\.get\(`/leads\$\{queryParams\}`\)\)\.data;\n    \},',
    'queryKey: ["leads", status, "driver"],\n    queryFn: async () => {\n      const params = status ? { status, segment: "driver" } : { exclude_status: "follow_up", segment: "driver" };\n      return (await api.get("/leads", { params })).data;\n    },',
    c
)
with open("src/pages/drivers/DriverLeads.jsx", "w") as f:
    f.write(c)
print("DriverLeads fixed")

# --- DriverPipeline.jsx ---
with open("src/pages/drivers/DriverPipeline.jsx", "r") as f:
    c = f.read()
# Different patterns the pipeline might have
c = re.sub(
    r'queryKey: \["leads", "pipeline"\],\n    queryFn: async \(\) => \(await api\.get\("/leads\?exclude_status=follow_up"\)\)\.data',
    'queryKey: ["leads", "pipeline", "driver"],\n    queryFn: async () => (await api.get("/leads", { params: { exclude_status: "follow_up", segment: "driver" } })).data',
    c
)
c = re.sub(
    r'api\.get\("/leads\?exclude_status=follow_up"\)',
    'api.get("/leads", { params: { exclude_status: "follow_up", segment: "driver" } })',
    c
)
with open("src/pages/drivers/DriverPipeline.jsx", "w") as f:
    f.write(c)
print("DriverPipeline fixed")

# --- DriverFollowUps.jsx ---
with open("src/pages/drivers/DriverFollowUps.jsx", "r") as f:
    c = f.read()
c = re.sub(
    r'queryKey: \["followups", "all", "driver"\]',
    'queryKey: ["followups", "all", "driver"]',
    c
)
c = re.sub(
    r'api\.get\("/followups\?scope=all"\)',
    'api.get("/followups", { params: { scope: "all", segment: "driver" } })',
    c
)
c = re.sub(
    r'api\.get\(`/followups\?scope=\$\{scope\}`\)',
    'api.get("/followups", { params: { scope, segment: "driver" } })',
    c
)
with open("src/pages/drivers/DriverFollowUps.jsx", "w") as f:
    f.write(c)
print("DriverFollowUps fixed")

# --- DriverCustomers.jsx ---
with open("src/pages/drivers/DriverCustomers.jsx", "r") as f:
    c = f.read()
c = re.sub(
    r'api\.get\("/customers"\)',
    'api.get("/customers", { params: { segment: "driver" } })',
    c
)
with open("src/pages/drivers/DriverCustomers.jsx", "w") as f:
    f.write(c)
print("DriverCustomers fixed")

# --- DriverDashboard.jsx ---
with open("src/pages/drivers/DriverDashboard.jsx", "r") as f:
    c = f.read()
c = re.sub(
    r'api\.get\("/dashboard/stats"\)',
    'api.get("/dashboard/stats", { params: { segment: "driver" } })',
    c
)
c = re.sub(
    r'api\.get\("/activities\?limit=8"\)',
    'api.get("/activities", { params: { limit: 8, segment: "driver" } })',
    c
)
c = re.sub(
    r'api\.get\("/followups\?scope=today"\)',
    'api.get("/followups", { params: { scope: "today", segment: "driver" } })',
    c
)
# Also fix the params version if already there
c = re.sub(
    r'api\.get\("/activities", \{ params: \{ limit: 8, segment \} \}\)',
    'api.get("/activities", { params: { limit: 8, segment: "driver" } })',
    c
)
c = re.sub(
    r'api\.get\("/followups", \{ params: \{ scope: "today", segment \} \}\)',
    'api.get("/followups", { params: { scope: "today", segment: "driver" } })',
    c
)
with open("src/pages/drivers/DriverDashboard.jsx", "w") as f:
    f.write(c)
print("DriverDashboard fixed")

print("\nAll driver pages fixed!")
