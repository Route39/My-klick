import asyncio, os
from dotenv import load_dotenv
load_dotenv()
from motor.motor_asyncio import AsyncIOMotorClient
import certifi
client = AsyncIOMotorClient(os.environ['MONGO_URL'], tlsCAFile=certifi.where())
db = client["myklick"]
async def main():
    print("Leads in follow_up:", await db.leads.count_documents({"status": "follow_up"}))
    print("Followups pending:", await db.followups.count_documents({"status": "pending"}))
asyncio.run(main())
