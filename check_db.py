import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def main():
    db = AsyncIOMotorClient("mongodb://localhost:27017").myklick
    users = await db.users.find().to_list(100)
    for u in users:
        print(f"_id: {u.get('_id')}, id: {u.get('id')}, name: {u.get('name')}, email: {u.get('email')}, phone: {u.get('phone')}")

asyncio.run(main())
