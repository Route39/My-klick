import re

with open("backend/server.py", "r") as f:
    content = f.read()

old_login = """    token = create_access_token(user["id"], user.get("email", ""))
    return {"token": token, "user": clean(user)}"""

new_login = """    u_id = user.get("id") or str(user.get("_id", ""))
    token = create_access_token(u_id, user.get("email", ""))
    cleaned = clean(user)
    if "id" not in cleaned:
        cleaned["id"] = u_id
    return {"token": token, "user": cleaned}"""

content = content.replace(old_login, new_login)

with open("backend/server.py", "w") as f:
    f.write(content)

print("Patched login")
