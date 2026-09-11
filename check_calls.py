import asyncio, os
from dotenv import load_dotenv
load_dotenv('backend/.env')
from motor.motor_asyncio import AsyncIOMotorClient
import certifi

client = AsyncIOMotorClient(os.environ['MONGO_URL'], tlsCAFile=certifi.where())
db = client[os.environ['DB_NAME']]

async def main():
    calls = await db.calls.find({"provider": "exotel"}).sort("created_at", -1).to_list(5)
    for c in calls:
        print(f"Call to {c['to_number']} from {c['from_number']} Status: {c['status']}")
    
asyncio.run(main())
