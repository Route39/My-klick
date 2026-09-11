import re
import glob

for file in glob.glob("src/pages/drivers/*.jsx"):
    with open(file, "r") as f:
        content = f.read()
    content = content.replace("Investor", "Driver")
    with open(file, "w") as f:
        f.write(content)
        
with open("src/components/AddDriverDialog.jsx", "r") as f:
    content = f.read()
content = content.replace("Add Lead", "Add Driver")
content = content.replace("Create Lead", "Create Driver")
with open("src/components/AddDriverDialog.jsx", "w") as f:
    f.write(content)

print("Text replaced")
