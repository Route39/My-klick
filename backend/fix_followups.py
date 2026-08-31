import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def main():
    db = AsyncIOMotorClient("mongodb://localhost:27017").myklick
    async for fu in db.followups.find({}):
        lead = await db.leads.find_one({"id": fu.get("lead_id")})
        if lead:
            await db.followups.update_one({"_id": fu["_id"]}, {"$set": {"lead_name": lead["name"]}})

asyncio.run(main())
