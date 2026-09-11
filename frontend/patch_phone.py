import re
with open("src/components/layout/AppShell.jsx", "r") as f:
    content = f.read()

content = content.replace('MoreHorizontal, Zap,', 'MoreHorizontal, Zap, Phone,')

with open("src/components/layout/AppShell.jsx", "w") as f:
    f.write(content)
