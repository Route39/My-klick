import re

with open("src/App.js", "r") as f:
    content = f.read()

# Add imports for Driver components
imports = """
import DriverDashboard from "./pages/drivers/DriverDashboard";
import DriverLeads from "./pages/drivers/DriverLeads";
import DriverPipeline from "./pages/drivers/DriverPipeline";
import DriverFollowUps from "./pages/drivers/DriverFollowUps";
import DriverCustomers from "./pages/drivers/DriverCustomers";
"""

content = re.sub(r'import Customers from "./pages/Customers";', r'import Customers from "./pages/Customers";\n' + imports, content)

# Replace Driver Routes
content = re.sub(r'<Route path="/drivers" element=\{<Dashboard segment="driver" />\} />', r'<Route path="/drivers" element={<DriverDashboard />} />', content)
content = re.sub(r'<Route path="/drivers/leads" element=\{<Leads segment="driver" />\} />', r'<Route path="/drivers/leads" element={<DriverLeads />} />', content)
content = re.sub(r'<Route path="/drivers/pipeline" element=\{<Pipeline segment="driver" />\} />', r'<Route path="/drivers/pipeline" element={<DriverPipeline />} />', content)
content = re.sub(r'<Route path="/drivers/followups" element=\{<FollowUps segment="driver" />\} />', r'<Route path="/drivers/followups" element={<DriverFollowUps />} />', content)
content = re.sub(r'<Route path="/drivers/customers" element=\{<Customers segment="driver" />\} />', r'<Route path="/drivers/customers" element={<DriverCustomers />} />', content)

with open("src/App.js", "w") as f:
    f.write(content)

print("App.js patched")
