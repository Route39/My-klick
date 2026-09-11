import re

with open("frontend/src/pages/drivers/DriverDashboard.jsx", "r") as f:
    content = f.read()

content = content.replace('<Briefing />', '<Briefing segment="driver" />')

with open("frontend/src/pages/drivers/DriverDashboard.jsx", "w") as f:
    f.write(content)

print("Patched DriverDashboard.jsx")
