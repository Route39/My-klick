import shutil, sys

F = "server.py"
src = open(F, encoding="utf-8").read()
shutil.copy(F, F + ".bak")

if "def own_only(" in src:
    print("Already patched."); sys.exit(0)

def rep(old, new, count=1):
    global src
    n = src.count(old)
    if n != count:
        print(f"!! expected {count} match(es), found {n} for:\n{old}\n"); sys.exit(1)
    src = src.replace(old, new)

rep('''def is_manager(user: dict) -> bool:
    return user.get("role") in ("admin", "team_leader")
''', '''def is_manager(user: dict) -> bool:
    return user.get("role") in ("admin", "team_leader")

def own_only(user: dict) -> bool:
    return user.get("role") == "admin_staff"
''')

rep('''    q["organization_id"] = org_of(user)
    if not can_view_all(user):
        q["$and"] = q.get("$and", []) + [''', '''    q["organization_id"] = org_of(user)
    if own_only(user):
        q["$and"] = q.get("$and", []) + [
            {"$or": [{"assigned_to": user["id"]}, {"created_by": user["id"]}]}
        ]
    elif not can_view_all(user):
        q["$and"] = q.get("$and", []) + [''')

rep('''        raise HTTPException(status_code=404, detail="Lead not found")
    if not can_view_all(user):
        # Sales exec: leads assigned to them, or unassigned leads''', '''        raise HTTPException(status_code=404, detail="Lead not found")
    if own_only(user) and lead.get("assigned_to") != user["id"] and lead.get("created_by") != user["id"]:
        raise HTTPException(status_code=403, detail="You don't have access to this lead")
    if not can_view_all(user):
        # Sales exec: leads assigned to them, or unassigned leads''')

rep('''    if not can_view_all(user):
        q["$or"] = [{"assigned_to": user["id"]}, {"assigned_to": None}]''', '''    if own_only(user):
        q["$or"] = [{"assigned_to": user["id"]}, {"created_by": user["id"]}]
    elif not can_view_all(user):
        q["$or"] = [{"assigned_to": user["id"]}, {"assigned_to": None}]''')

rep('''    base = {"status": "pending", "organization_id": org_of(user)}
    if not can_view_all(user):
        base["assigned_to"] = user["id"]''', '''    base = {"status": "pending", "organization_id": org_of(user)}
    if not can_view_all(user) or own_only(user):
        base["assigned_to"] = user["id"]''', count=2)

rep('''    base = {"organization_id": org_of(user)}
    if not can_view_all(user):
        base["assigned_to"] = user["id"]''', '''    base = {"organization_id": org_of(user)}
    if not can_view_all(user) or own_only(user):
        base["assigned_to"] = user["id"]''')
rep('''if not can_view_all(user) and c.get("assigned_to") != user["id"]:''',
    '''if (not can_view_all(user) or own_only(user)) and c.get("assigned_to") != user["id"]:''')
rep('''    if not can_view_all(user):
        cust_q["assigned_to"] = user["id"]''', '''    if not can_view_all(user) or own_only(user):
        cust_q["assigned_to"] = user["id"]''')

rep('''    q = {"organization_id": org_of(user)}
    if not can_view_all(user):
        q["user_id"] = user["id"]''', '''    q = {"organization_id": org_of(user)}
    if not can_view_all(user) or own_only(user):
        q["user_id"] = user["id"]''')

rep('''    if can_view_all(user):
        if staff_id and staff_id != "all":''', '''    if can_view_all(user) and not own_only(user):
        if staff_id and staff_id != "all":''')
rep('''if not can_view_all(user) and call.get("user_id") != user["id"]:''',
    '''if (not can_view_all(user) or own_only(user)) and call.get("user_id") != user["id"]:''')

rep('''    if not can_view_all(user):
        loose["user_id"] = user["id"]''', '''    if not can_view_all(user) or own_only(user):
        loose["user_id"] = user["id"]''')
rep('''    if not can_view_all(user):
        fu_base["assigned_to"] = user["id"]''', '''    if not can_view_all(user) or own_only(user):
        fu_base["assigned_to"] = user["id"]''')

open(F, "w", encoding="utf-8").write(src)
print("Patched OK. Restart backend.")
