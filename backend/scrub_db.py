import asyncio, os
from dotenv import load_dotenv
load_dotenv()
from motor.motor_asyncio import AsyncIOMotorClient
import certifi

client = AsyncIOMotorClient(os.environ['MONGO_URL'], tlsCAFile=certifi.where())
db = client["myklick"]

async def main():
    # Delete pending followups if lead status != 'follow_up'
    fus = await db.followups.find({"status": "pending"}).to_list(None)
    deleted = 0
    for fu in fus:
        lead = await db.leads.find_one({"id": fu["lead_id"]})
        if lead and lead.get("status") != "follow_up":
            await db.followups.delete_one({"id": fu["id"]})
            deleted += 1
    print(f"Deleted {deleted} orphaned follow-ups.")

asyncio.run(main())
