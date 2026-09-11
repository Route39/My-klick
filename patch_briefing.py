import re

with open("frontend/src/components/Briefing.jsx", "r") as f:
    content = f.read()

content = content.replace('export function Briefing() {', 'export function Briefing({ segment = "investor" }) {')
content = content.replace('queryKey: ["briefing"],', 'queryKey: ["briefing", segment],')
content = content.replace('api.get("/briefing")', 'api.get("/briefing", { params: { segment } })')

# Handle navigation replacements correctly
content = content.replace('navigate(`/leads', 'navigate(segment === "driver" ? `/drivers/leads` : `/leads')
content = content.replace('` : `/leads/${', '` : `/leads/${') # Fix up the string if needed

with open("frontend/src/components/Briefing.jsx", "w") as f:
    f.write(content)

print("Patched Briefing.jsx")
