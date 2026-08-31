import asyncio, os
from dotenv import load_dotenv
load_dotenv()
from motor.motor_asyncio import AsyncIOMotorClient
import certifi

client = AsyncIOMotorClient(os.environ['MONGO_URL'], tlsCAFile=certifi.where())
db = client["myklick"]

async def main():
    lead = await db.leads.find_one({})
    if lead:
        keys = list(lead.keys())
        print("Lead fields in DB:", keys)
        has_vehicles = "no_of_vehicles" in lead
        has_remarks = "remarks" in lead
        has_value = "value" in lead
        print(f"✓ no_of_vehicles: {has_vehicles} → '{lead.get('no_of_vehicles', 'NOT FOUND')}'")
        print(f"✓ remarks: {has_remarks} → '{lead.get('remarks', 'NOT FOUND')}'")
        print(f"✓ value: {has_value} → '{lead.get('value', 'NOT FOUND')}'")
    else:
        print("No leads found")

asyncio.run(main())
