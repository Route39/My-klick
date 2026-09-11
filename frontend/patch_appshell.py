import re

with open("src/components/layout/AppShell.jsx", "r") as f:
    content = f.read()

# Add import
content = re.sub(
    r'import \{ AddLeadDialog \} from "\.\./AddLeadDialog";',
    r'import { AddLeadDialog } from "../AddLeadDialog";\nimport { AddDriverDialog } from "../AddDriverDialog";',
    content
)

# Update dialog rendering
content = re.sub(
    r'<AddLeadDialog open=\{addState\.open\} onOpenChange=\{\(v\) => setAddState\(\(s\) => \(\{ \.\.\.s, open: v \}\)\)\} defaultStatus=\{addState\.status\} segment=\{currentSegment\} />',
    r'{currentSegment === "driver" ? (\n          <AddDriverDialog open={addState.open} onOpenChange={(v) => setAddState((s) => ({ ...s, open: v }))} defaultStatus={addState.status} />\n        ) : (\n          <AddLeadDialog open={addState.open} onOpenChange={(v) => setAddState((s) => ({ ...s, open: v }))} defaultStatus={addState.status} />\n        )}',
    content
)

with open("src/components/layout/AppShell.jsx", "w") as f:
    f.write(content)

print("AppShell patched")
