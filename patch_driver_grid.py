import re

with open("frontend/src/components/AddDriverDialog.jsx", "r") as f:
    content = f.read()

# Replace the form fields with a grid layout
old_form_fields = r'''          <div className="space-y-2">
            <Label>Driver Name \*</Label>
            <Input required className="rounded-xl" value=\{formData\.name\} onChange=\{\(e\) => setFormData\(\{ \.\.\.formData, name: e\.target\.value \}\)\} placeholder="e\.g\. Ramesh Kumar" />
          </div>
          
          <div className="space-y-2">
            <Label>Phone Number \*</Label>
            <Input type="tel" required className="rounded-xl" value=\{formData\.phone\} onChange=\{\(e\) => setFormData\(\{ \.\.\.formData, phone: e\.target\.value \}\)\} placeholder="e\.g\. 9876543210" />
          </div>
          
          <div className="space-y-2">
            <Label>Location</Label>
            <Input className="rounded-xl" value=\{formData\.location\} onChange=\{\(e\) => setFormData\(\{ \.\.\.formData, location: e\.target\.value \}\)\} placeholder="e\.g\. Mumbai" />
          </div>
          
          <div className="space-y-3 pt-2">
            <Label>RC Available\?</Label>
            <RadioGroup value=\{formData\.rc\} onValueChange=\{\(v\) => setFormData\(\{ \.\.\.formData, rc: v \}\)\} className="flex gap-4">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="yes" id="rc-yes" />
                <Label htmlFor="rc-yes" className="cursor-pointer font-normal">Yes</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="no" id="rc-no" />
                <Label htmlFor="rc-no" className="cursor-pointer font-normal">No</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-3 pt-4 border-t">
            <Label className="text-sm font-semibold">Document Uploads</Label>
            
            <div className="space-y-1\.5">
              <Label className="text-xs text-slate-500">Aadhaar Card</Label>
              <Input type="file" className="rounded-xl text-xs" onChange=\{\(e\) => setFiles\(\{ \.\.\.files, aadhaar: e\.target\.files\[0\] \}\)\} accept="image/\*,\.pdf" />
            </div>
            
            <div className="space-y-1\.5">
              <Label className="text-xs text-slate-500">PAN Card</Label>
              <Input type="file" className="rounded-xl text-xs" onChange=\{\(e\) => setFiles\(\{ \.\.\.files, pan: e\.target\.files\[0\] \}\)\} accept="image/\*,\.pdf" />
            </div>
            
            <div className="space-y-1\.5">
              <Label className="text-xs text-slate-500">Original License</Label>
              <Input type="file" className="rounded-xl text-xs" onChange=\{\(e\) => setFiles\(\{ \.\.\.files, license: e\.target\.files\[0\] \}\)\} accept="image/\*,\.pdf" />
            </div>
          </div>'''

new_form_fields = r'''          <div className="space-y-1.5">
            <Label>Driver Name *</Label>
            <Input required className="rounded-xl" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. Ramesh Kumar" />
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Phone Number *</Label>
              <Input type="tel" required className="rounded-xl" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder="e.g. 9876543210" />
            </div>
            <div className="space-y-1.5">
              <Label>Location</Label>
              <Input className="rounded-xl" value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })} placeholder="e.g. Mumbai" />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2 pt-1">
              <Label>RC Available?</Label>
              <RadioGroup value={formData.rc} onValueChange={(v) => setFormData({ ...formData, rc: v })} className="flex gap-4 mt-1">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="yes" id="rc-yes" />
                  <Label htmlFor="rc-yes" className="cursor-pointer font-normal">Yes</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="no" id="rc-no" />
                  <Label htmlFor="rc-no" className="cursor-pointer font-normal">No</Label>
                </div>
              </RadioGroup>
            </div>
            <div className="space-y-1.5">
              <Label>Aadhaar Card</Label>
              <Input type="file" className="rounded-xl text-xs" onChange={(e) => setFiles({ ...files, aadhaar: e.target.files[0] })} accept="image/*,.pdf" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pb-4">
            <div className="space-y-1.5">
              <Label>PAN Card</Label>
              <Input type="file" className="rounded-xl text-xs" onChange={(e) => setFiles({ ...files, pan: e.target.files[0] })} accept="image/*,.pdf" />
            </div>
            <div className="space-y-1.5">
              <Label>Original License</Label>
              <Input type="file" className="rounded-xl text-xs" onChange={(e) => setFiles({ ...files, license: e.target.files[0] })} accept="image/*,.pdf" />
            </div>
          </div>'''

content = re.sub(old_form_fields, new_form_fields, content)

with open("frontend/src/components/AddDriverDialog.jsx", "w") as f:
    f.write(content)

print("Patched to grid layout")
