import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv

load_dotenv('.env')

async def main():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    users = await db.users.find().to_list(10)
    for u in users:
        print(f"User _id: {u.get('_id')}, id: {u.get('id')}, email: {u.get('email')}, phone: {u.get('phone')}")

asyncio.run(main())
