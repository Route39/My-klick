import React, { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { Loader2, UploadCloud, Rocket } from "lucide-react";

export function AddDriverDialog({ open, onOpenChange, defaultStatus = "new" }) {
  const queryClient = useQueryClient();
  
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    location: "",
    rc: "yes",
  });
  
  const [files, setFiles] = useState({
    aadhaar: null,
    pan: null,
    license: null
  });

  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (open) {
      setFormData({ name: "", phone: "", location: "", rc: "yes" });
      setFiles({ aadhaar: null, pan: null, license: null });
    }
  }, [open]);

  const addLead = useMutation({
    mutationFn: async (data) => (await api.post("/leads", data)).data,
    onSuccess: () => {
      queryClient.invalidateQueries(["leads"]);
      queryClient.invalidateQueries(["stats"]);
      toast.success("Driver added successfully!");
      onOpenChange(false);
    },
    onError: (e) => toast.error("Failed to add driver"),
  });

  const uploadFile = async (file) => {
    if (!file) return "";
    const fd = new FormData();
    fd.append("file", file);
    const res = await api.post("/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
    return res.data.url;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.phone) return toast.error("Name and Phone are required");
    
    setIsUploading(true);
    try {
      const aadhaar_url = await uploadFile(files.aadhaar);
      const pan_url = await uploadFile(files.pan);
      const license_url = await uploadFile(files.license);
      
      addLead.mutate({
        ...formData,
        status: defaultStatus,
        segment: "driver",
        aadhaar_url,
        pan_url,
        license_url,
      });
    } catch (error) {
      toast.error("Failed to upload files");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl sm:max-w-md">
        <DialogHeader>
          <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-2xl bg-accent text-primary">
            <Rocket className="h-5 w-5" />
          </div>
          <DialogTitle className="font-display text-2xl">Add New Driver</DialogTitle>
          <p className="text-sm text-slate-500">Enter the driver's details and upload required documents.</p>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-1.5">
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
              <Label className="text-xs text-slate-500">Aadhaar Card</Label>
              <Input type="file" className="rounded-xl text-xs" onChange={(e) => setFiles({ ...files, aadhaar: e.target.files[0] })} accept="image/*,.pdf" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pb-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-500">PAN Card</Label>
              <Input type="file" className="rounded-xl text-xs" onChange={(e) => setFiles({ ...files, pan: e.target.files[0] })} accept="image/*,.pdf" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-500">Original License</Label>
              <Input type="file" className="rounded-xl text-xs" onChange={(e) => setFiles({ ...files, license: e.target.files[0] })} accept="image/*,.pdf" />
            </div>
          </div>

          <Button data-testid="create-driver-submit" type="submit" disabled={isUploading || addLead.isPending}
            className="w-full rounded-xl py-6 text-base font-semibold">
            {isUploading || addLead.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {isUploading ? "Uploading…" : "Add Driver"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
