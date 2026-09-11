import re

with open("frontend/src/pages/Login.jsx", "r") as f:
    content = f.read()

content = content.replace('autoComplete="new-password"', 'autoComplete="off"')
content = content.replace('name="myklick_email_field"', 'name="email_nope"')
content = content.replace('name="myklick_password_field"', 'name="password_nope"')

with open("frontend/src/pages/Login.jsx", "w") as f:
    f.write(content)

print("Patched autocomplete")
