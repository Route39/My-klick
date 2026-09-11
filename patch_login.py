import re

with open("frontend/src/pages/Login.jsx", "r") as f:
    content = f.read()

content = content.replace('useState("admin@route39.in")', 'useState("")')
content = content.replace('useState("Route@39")', 'useState("")')

with open("frontend/src/pages/Login.jsx", "w") as f:
    f.write(content)

print("Patched Login.jsx")
