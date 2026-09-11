import os
import re

os.makedirs("src/pages/drivers", exist_ok=True)

# 1. Dashboard
with open("src/pages/Dashboard.jsx", "r") as f:
    content = f.read()
content = content.replace("export default function Dashboard({ segment = \"investor\" }) {", "export default function DriverDashboard() {\n  const segment = \"driver\";")
with open("src/pages/drivers/DriverDashboard.jsx", "w") as f:
    f.write(content)

# 2. Leads
with open("src/pages/Leads.jsx", "r") as f:
    content = f.read()
content = content.replace("export default function Leads({ segment = \"investor\" }) {", "export default function DriverLeads() {\n  const segment = \"driver\";")
with open("src/pages/drivers/DriverLeads.jsx", "w") as f:
    f.write(content)

# 3. Pipeline
with open("src/pages/Pipeline.jsx", "r") as f:
    content = f.read()
content = content.replace("export default function Pipeline({ segment = \"investor\" }) {", "export default function DriverPipeline() {\n  const segment = \"driver\";")
with open("src/pages/drivers/DriverPipeline.jsx", "w") as f:
    f.write(content)

# 4. FollowUps
with open("src/pages/FollowUps.jsx", "r") as f:
    content = f.read()
content = content.replace("export default function FollowUps({ segment = \"investor\" }) {", "export default function DriverFollowUps() {\n  const segment = \"driver\";")
with open("src/pages/drivers/DriverFollowUps.jsx", "w") as f:
    f.write(content)

# 5. Customers
with open("src/pages/Customers.jsx", "r") as f:
    content = f.read()
content = content.replace("export default function Customers({ segment = \"investor\" }) {", "export default function DriverCustomers() {\n  const segment = \"driver\";")
with open("src/pages/drivers/DriverCustomers.jsx", "w") as f:
    f.write(content)

# 6. AddDriverDialog
with open("src/components/AddLeadDialog.jsx", "r") as f:
    content = f.read()
content = content.replace("export function AddLeadDialog", "export function AddDriverDialog")
content = content.replace('segment = "investor"', 'segment = "driver"')
with open("src/components/AddDriverDialog.jsx", "w") as f:
    f.write(content)

print("Duplication complete!")
