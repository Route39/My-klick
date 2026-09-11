import re

with open("backend/server.py", "r") as f:
    content = f.read()

old_logic = """    try:
        agent_phone = user.get("phone") or os.environ.get("EXOTEL_VIRTUAL_NUMBER")
        # Remove spaces, dashes, parentheses to ensure Exotel accepts it perfectly
        agent_phone = "".join([c for c in agent_phone if c.isdigit() or c == "+"])"""

new_logic = """    agent_phone = user.get("phone")
    if not agent_phone or agent_phone.strip() == "":
        raise HTTPException(status_code=400, detail="Please add your number on your profile")

    try:
        # Remove spaces, dashes, parentheses to ensure Exotel accepts it perfectly
        agent_phone = "".join([c for c in agent_phone if c.isdigit() or c == "+"])"""

content = content.replace(old_logic, new_logic)

with open("backend/server.py", "w") as f:
    f.write(content)
