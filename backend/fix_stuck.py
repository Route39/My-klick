import asyncio, os
from dotenv import load_dotenv
load_dotenv()
from motor.motor_asyncio import AsyncIOMotorClient
import certifi
from datetime import datetime, timezone

client = AsyncIOMotorClient(os.environ['MONGO_URL'], tlsCAFile=certifi.where())
db = client["myklick"]

async def main():
    # Find all leads stuck in follow_up with no pending follow-ups
    leads = await db.leads.find({"status": "follow_up"}).to_list(None)
    fixed = 0
    for lead in leads:
        pending = await db.followups.find_one({"lead_id": lead["id"], "status": "pending"})
        if not pending:
            await db.leads.update_one(
                {"id": lead["id"]},
                {"$set": {"status": "contacted", "next_followup": None, "updated_at": datetime.now(timezone.utc).isoformat()}}
            )
            fixed += 1
            print(f"Fixed stuck lead: {lead['name']}")
    print(f"Total fixed: {fixed}")

asyncio.run(main())
