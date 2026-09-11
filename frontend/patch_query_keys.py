import os
import re

def patch_file(path, replacements):
    with open(path, "r") as f:
        content = f.read()
    for (pattern, repl) in replacements:
        content = re.sub(pattern, repl, content, flags=re.MULTILINE)
    with open(path, "w") as f:
        f.write(content)

patch_file("src/pages/Dashboard.jsx", [
    (r'queryKey: \["dashboard-stats"\]', r'queryKey: ["dashboard-stats", segment]'),
    (r'queryKey: \["activities"\]', r'queryKey: ["activities", segment]')
])

patch_file("src/pages/Leads.jsx", [
    (r'queryKey: \["leads", params\]', r'queryKey: ["leads", params, segment]')
])

patch_file("src/pages/Pipeline.jsx", [
    (r'queryKey: \["leads", params\]', r'queryKey: ["leads", params, segment]')
])

patch_file("src/pages/FollowUps.jsx", [
    (r'queryKey: \["followups", scope\]', r'queryKey: ["followups", scope, segment]')
])

patch_file("src/pages/Customers.jsx", [
    (r'queryKey: \["customers"\]', r'queryKey: ["customers", segment]')
])

print("Patched query keys")
