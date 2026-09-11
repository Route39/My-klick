import re

with open("frontend/src/components/layout/AppShell.jsx", "r") as f:
    content = f.read()

old_driver_nav = r'''const DRIVER_NAV = \[
  \{ to: "/drivers", label: "Dashboard", icon: LayoutDashboard, end: true \},
  \{ to: "/drivers/leads", label: "Leads", icon: Users \},
  \{ to: "/drivers/pipeline", label: "Pipeline", icon: KanbanSquare \},
  \{ to: "/drivers/followups", label: "Follow-ups", icon: CalendarClock \},
  \{ to: "/drivers/customers", label: "Customers", icon: UserCheck \},
\];'''

new_driver_nav = r'''const DRIVER_NAV = [
  { to: "/drivers", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/drivers/leads", label: "Leads", icon: Users },
  { to: "/drivers/pipeline", label: "Pipeline", icon: KanbanSquare },
  { to: "/drivers/followups", label: "Follow-ups", icon: CalendarClock },
  { to: "/drivers/customers", label: "Customers", icon: UserCheck },
  { to: "/drivers/team", label: "Team", icon: BarChart3 },
];'''

content = re.sub(old_driver_nav, new_driver_nav, content)

# Now fix the rendering logic so BOTH navigations are filtered by the isManager rule
old_nav_logic = r'''  const isManager = \["admin", "team_leader"\].includes\(user\?\.role\);
  const navItems = NAV.filter\(\(n\) => n\.label !== "Team" \|\| isManager\);'''

new_nav_logic = r'''  const isManager = ["admin", "team_leader"].includes(user?.role);
  const navItems = NAV.filter((n) => n.label !== "Team" || isManager);
  const driverNavItems = DRIVER_NAV.filter((n) => n.label !== "Team" || isManager);'''

content = re.sub(old_nav_logic, new_nav_logic, content)

old_nav_render = r'''\{\(currentSegment === "investor" \? navItems : DRIVER_NAV\)\.map'''
new_nav_render = r'''{(currentSegment === "investor" ? navItems : driverNavItems).map'''

content = re.sub(old_nav_render, new_nav_render, content)

with open("frontend/src/components/layout/AppShell.jsx", "w") as f:
    f.write(content)

print("Patched AppShell.jsx")
