"""Removes QA-created TEST_ demo records (leads, customers, activities, followups, messages, calls)."""
import os
from dotenv import load_dotenv
from pathlib import Path
from pymongo import MongoClient

load_dotenv(Path(__file__).resolve().parents[1] / ".env")
db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]

lead_ids = [l["id"] for l in db.leads.find({"name": {"$regex": "^TEST_"}}, {"id": 1})]
lead_ids += [c["lead_id"] for c in db.customers.find({"name": {"$regex": "^TEST_"}}, {"lead_id": 1})]
lead_ids = list(set(lead_ids))
print("lead ids:", len(lead_ids))
for coll in ["leads", "customers", "activities", "followups", "messages", "calls"]:
    key = "lead_id" if coll != "leads" else "id"
    res = db[coll].delete_many({key: {"$in": lead_ids}})
    print(coll, res.deleted_count)
db.messages.delete_many({"text": {"$regex": "^TEST_"}})
db.followups.delete_many({"reason": {"$regex": "^TEST_"}})
print("done")
