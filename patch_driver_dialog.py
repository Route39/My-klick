import re

with open("frontend/src/components/AddDriverDialog.jsx", "r") as f:
    content = f.read()

# Replace the DialogContent and Header with the styled versions
new_header = r'''      <DialogContent className="rounded-3xl sm:max-w-md">
        <DialogHeader>
          <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-2xl bg-accent text-primary">
            <Rocket className="h-5 w-5" />
          </div>
          <DialogTitle className="font-display text-2xl">Add New Driver</DialogTitle>
          <p className="text-sm text-slate-500">Enter the driver's details and upload required documents.</p>
        </DialogHeader>'''

content = re.sub(r'      <DialogContent.*?>\s*<DialogHeader>.*?</DialogHeader>', new_header, content, flags=re.DOTALL)

# Add Rocket icon import
if 'Rocket' not in content:
    content = content.replace('UploadCloud', 'UploadCloud, Rocket')

# Add className="rounded-xl" to all Inputs
content = content.replace('<Input required value', '<Input required className="rounded-xl" value')
content = content.replace('<Input type="tel" required value', '<Input type="tel" required className="rounded-xl" value')
content = content.replace('<Input value={formData.location}', '<Input className="rounded-xl" value={formData.location}')
content = content.replace('<Input type="file" onChange', '<Input type="file" className="rounded-xl text-xs" onChange')
# The original script had className="text-xs" for file inputs, let's just do a generic replace
content = re.sub(r'<Input (.*?)className="text-xs"', r'<Input \1className="rounded-xl text-xs"', content)

# Update the Button to look exactly like the Investor one
old_footer = r'''          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isUploading || addLead.isPending}>
              {isUploading || addLead.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {isUploading ? "Uploading..." : "Add Driver"}
            </Button>
          </DialogFooter>'''

new_footer = r'''          <Button data-testid="create-driver-submit" type="submit" disabled={isUploading || addLead.isPending}
            className="w-full rounded-xl py-6 text-base font-semibold">
            {isUploading || addLead.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {isUploading ? "Uploading…" : "Add Driver"}
          </Button>'''

content = re.sub(old_footer, new_footer, content)

# I should use grid-cols-2 for Phone and Location, since the user might have meant "I want the exact same left-right layout".
# "how investor perfectly have same like accrate perfect i want one by one dont want left right left right"
# Let's keep it stacked (one-by-one) because "dont want left right left right" is explicit.

with open("frontend/src/components/AddDriverDialog.jsx", "w") as f:
    f.write(content)

print("Patched styling")
