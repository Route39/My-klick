import re

with open("frontend/src/pages/Team.jsx", "r") as f:
    content = f.read()

content = content.replace('export default function Team() {', 'export default function Team({ segment = "investor" }) {')
content = content.replace('queryKey: ["team"],', 'queryKey: ["team", segment],')
content = content.replace('api.get("/team")', 'api.get("/team", { params: { segment } })')

with open("frontend/src/pages/Team.jsx", "w") as f:
    f.write(content)

print("Patched Team.jsx")
