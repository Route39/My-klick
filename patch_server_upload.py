import re
import os

with open("backend/server.py", "r") as f:
    content = f.read()

# 1. Add imports: UploadFile, File from fastapi
# Also StaticFiles
content = re.sub(
    r'from fastapi import FastAPI, APIRouter, HTTPException, Request, Depends, BackgroundTasks, Response',
    r'from fastapi import FastAPI, APIRouter, HTTPException, Request, Depends, BackgroundTasks, Response, UploadFile, File\nfrom fastapi.staticfiles import StaticFiles\nimport shutil\nimport uuid',
    content
)

# 2. Update LeadIn schema
old_leadin = r'''class LeadIn\(BaseModel\):
    name: str
    company: Optional\[str\] = ""
    phone: str
    whatsapp: Optional\[str\] = ""
    email: Optional\[str\] = ""
    location: Optional\[str\] = ""
    product: Optional\[str\] = ""
    source: str = "manual"
    status: str = "new"
    priority: str = "medium"
    segment: str = "investor"
    assigned_to: Optional\[str\] = None
    value: float = 0
    notes: Optional\[str\] = ""
    no_of_vehicles: Optional\[str\] = ""
    remarks: Optional\[str\] = ""'''

new_leadin = '''class LeadIn(BaseModel):
    name: str
    company: Optional[str] = ""
    phone: str
    whatsapp: Optional[str] = ""
    email: Optional[str] = ""
    location: Optional[str] = ""
    product: Optional[str] = ""
    source: str = "manual"
    status: str = "new"
    priority: str = "medium"
    segment: str = "investor"
    assigned_to: Optional[str] = None
    value: float = 0
    notes: Optional[str] = ""
    no_of_vehicles: Optional[str] = ""
    remarks: Optional[str] = ""
    rc: Optional[str] = ""
    aadhaar_url: Optional[str] = ""
    pan_url: Optional[str] = ""
    license_url: Optional[str] = ""'''

content = re.sub(old_leadin, new_leadin, content)

# 3. Add /api/upload endpoint
upload_endpoint = '''
@api.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    os.makedirs("uploads", exist_ok=True)
    ext = file.filename.split('.')[-1] if '.' in file.filename else 'bin'
    filename = f"{uuid.uuid4().hex}.{ext}"
    filepath = os.path.join("uploads", filename)
    with open(filepath, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    return {"url": f"/uploads/{filename}"}

@api.get("/")
'''

content = re.sub(r'\n@api\.get\("/"\)\n', upload_endpoint, content)

# 4. Mount /uploads static directory
mount_static = '''
app.include_router(api)
os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")
'''

content = re.sub(r'\napp\.include_router\(api\)\n', mount_static, content)

with open("backend/server.py", "w") as f:
    f.write(content)

print("Backend patched")
