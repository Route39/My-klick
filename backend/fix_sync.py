import asyncio
import os
from dotenv import load_dotenv
load_dotenv()

from motor.motor_asyncio import AsyncIOMotorClient
import certifi
import uuid
from datetime import datetime, timedelta, timezone

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url, tlsCAFile=certifi.where())
db = client["myklick"]

async def main():
    # Find all leads with status="follow_up"
    leads = await db.leads.find({"status": "follow_up"}).to_list(None)
    fixed = 0
    for lead in leads:
        # Check if they have a pending followup
        pending = await db.followups.find_one({"lead_id": lead["id"], "status": "pending"})
        if not pending:
            # Auto-create one
            due = (datetime.now(timezone.utc) + timedelta(days=1)).replace(hour=10, minute=0, second=0, microsecond=0)
            fu = {
                "id": str(uuid.uuid4()), 
                "organization_id": lead.get("organization_id", "default"),
                "lead_id": lead["id"],
                "lead_name": lead["name"],
                "reason": "System auto-scheduled from status change",
                "assigned_to": lead.get("assigned_to"), 
                "assigned_name": lead.get("assigned_name"),
                "status": "pending", 
                "due_at": due.isoformat(),
                "created_at": datetime.now(timezone.utc).isoformat(), 
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
            await db.followups.insert_one(fu)
            await db.leads.update_one({"id": lead["id"]}, {"$set": {"next_followup": due.isoformat()}})
            fixed += 1
            print(f"Fixed {lead['name']}")
    print(f"Total fixed: {fixed}")

if __name__ == "__main__":
    asyncio.run(main())
