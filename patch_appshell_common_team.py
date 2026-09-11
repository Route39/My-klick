import re

with open("frontend/src/components/layout/AppShell.jsx", "r") as f:
    content = f.read()

# Remove Team from NAV
old_nav = r'''  \{ to: "/customers", label: "Customers", icon: UserCheck \},
  \{ to: "/team", label: "Team", icon: BarChart3 \},
\];'''
new_nav = r'''  { to: "/customers", label: "Customers", icon: UserCheck },
];'''
content = re.sub(old_nav, new_nav, content)

# Remove Team from DRIVER_NAV
old_driver_nav = r'''  \{ to: "/drivers/customers", label: "Customers", icon: UserCheck \},
  \{ to: "/drivers/team", label: "Team", icon: BarChart3 \},
\];'''
new_driver_nav = r'''  { to: "/drivers/customers", label: "Customers", icon: UserCheck },
];'''
content = re.sub(old_driver_nav, new_driver_nav, content)

# Update navItems to stop filtering Team since it's no longer in NAV
old_navItems = r'''  const navItems = NAV\.filter\(\(n\) => n\.label !== "Team" \|\| isManager\);
  const driverNavItems = DRIVER_NAV\.filter\(\(n\) => n\.label !== "Team" \|\| isManager\);'''
new_navItems = r'''  const navItems = NAV;
  const driverNavItems = DRIVER_NAV;'''
content = re.sub(old_navItems, new_navItems, content)

# Add the Admin/Common section at the bottom of the nav list
old_nav_end = r'''              </NavLink>
            \)\)}
          </nav>
          <div className="border-t border-slate-100 p-3">'''

new_nav_end = r'''              </NavLink>
            ))}

            {isManager && (
              <>
                <div className="px-3 pb-2 pt-6">
                  <span className="font-display text-xxl font-bold uppercase tracking-widest text-slate-400">
                    ADMIN
                  </span>
                </div>
                <NavLink to="/team" data-testid="nav-team"
                  className={({ isActive }) => cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
                    isActive ? "bg-accent text-primary" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                  )}>
                  <BarChart3 className="h-[18px] w-[18px]" /> Team
                </NavLink>
              </>
            )}
          </nav>
          <div className="border-t border-slate-100 p-3">'''

content = re.sub(old_nav_end, new_nav_end, content)

with open("frontend/src/components/layout/AppShell.jsx", "w") as f:
    f.write(content)

print("Patched AppShell.jsx")
