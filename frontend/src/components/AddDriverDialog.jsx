import React, { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import api, { formatApiErrorDetail } from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { Loader2, UploadCloud, Rocket, AlertTriangle, X } from "lucide-react";

export function AddDriverDialog({ open, onOpenChange, defaultStatus = "new" }) {
  const queryClient = useQueryClient();
  
  const [formData, setFormData] = useState({
    name: "", remarks: "",
    phone: "",
    location: "", branch: "",
    rc: "yes",
  });
  
  const [files, setFiles] = useState({
    aadhaar: null,
    pan: null,
    license: null
  });

  const [isUploading, setIsUploading] = useState(false);
  const [dup, setDup] = useState(null);
  const [esc, setEsc] = useState(null);
  const phoneDigits = (formData.phone || "").replace(/\D/g, "");
  useEffect(() => {
    if (phoneDigits.length < 10) { setDup(null); return; }
    const t = setTimeout(async () => {
      try { const r = (await api.get(`/leads-check-phone?phone=${phoneDigits}&segment=driver`)).data; setDup(r.exists ? r : null); } catch (e) { setDup(null); }
    }, 300);
    return () => clearTimeout(t);
  }, [phoneDigits]);

  useEffect(() => {
    if (open) {
      setFormData({ name: "", remarks: "", phone: "", location: "", branch: "", rc: "yes" });
      setFiles({ aadhaar: null, pan: null, license: null });
    }
  }, [open]);

  const addLead = useMutation({
    mutationFn: async ({ escData, ...data }) => {
      const lead = (await api.post("/leads", data)).data;
      if (escData) { try { await api.post("/escalations", { lead_id: lead.id, region: escData.region, reason: escData.reason, segment: "driver" }); toast.success(`Escalated to ${escData.region} team ✓`); } catch (e) { toast.error(e?.response?.data?.detail || "Driver added, but could not escalate"); } }
      return lead;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      queryClient.invalidateQueries({ queryKey: ["escalations"] }); setEsc(null);
      toast.success("Driver added successfully!");
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.response?.data?.detail ? formatApiErrorDetail(e.response.data.detail) : `DEBUG: ${e.message} | ${e.name}`),
  });

  const uploadFile = async (file) => {
    if (!file) return "";
    const fd = new FormData();
    fd.append("file", file);
    const res = await api.post("/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
    return res.data.url;
  };

  const handleSubmit = async (e, escData = null) => {
    e?.preventDefault?.();
    
    setIsUploading(true);
    try {
      const aadhaar_url = await uploadFile(files.aadhaar);
      const pan_url = await uploadFile(files.pan);
      const license_url = await uploadFile(files.license);
      
      addLead.mutate({
        ...formData,
        status: defaultStatus,
        segment: "driver",
        value: 0,
        assigned_to: null,
        aadhaar_url,
        pan_url,
        license_url,
        escData,
      });
    } catch (error) {
      toast.error("Failed to upload files");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="rounded-3xl sm:max-w-md">
        <DialogHeader>
          <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-2xl bg-accent text-primary">
            <Rocket className="h-5 w-5" />
          </div>
          <DialogTitle className="font-display text-2xl">Add New Driver</DialogTitle>
          <p className="text-sm text-slate-500">Enter the driver's details and upload required documents.</p>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Driver Name</Label>
            <Input className="rounded-xl" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. Ramesh Kumar" />
          </div>
          
          <div className="grid grid-cols-1 gap-3 m425:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Phone Number</Label>
              <Input type="tel" className="rounded-xl" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })} placeholder="e.g. 9876543210" />
            </div>
            <div className="space-y-1.5">
              <Label>City</Label>
              <Input className="rounded-xl" value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })} placeholder="e.g. Tiruppur" />
            </div>
          </div>
          
          <div className="grid grid-cols-1 gap-3 m425:grid-cols-2">
            <div className="space-y-2 pt-1">
              <Label>License Available?</Label>
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

          <div className="grid grid-cols-1 gap-3 m425:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-500">PAN Card</Label>
              <Input type="file" className="rounded-xl text-xs" onChange={(e) => setFiles({ ...files, pan: e.target.files[0] })} accept="image/*,.pdf" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-500">Original License</Label>
              <Input type="file" className="rounded-xl text-xs" onChange={(e) => setFiles({ ...files, license: e.target.files[0] })} accept="image/*,.pdf" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Branch</Label>
            <select className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm" value={formData.branch} onChange={(e) => setFormData({ ...formData, branch: e.target.value })}>
              <option value="">Select branch</option>
              {["Bangalore", "Coimbatore", "Chennai", "Tiruppur"].map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Remarks</Label>
            <textarea rows={2} className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={formData.remarks} onChange={(e) => setFormData({ ...formData, remarks: e.target.value })} placeholder="Any notes about this driver..." />
          </div>

          {dup && <p className="rounded-xl bg-red-50 px-3 py-2 text-center text-sm text-red-600">This lead already taken by <b>{dup.owner}</b> — {dup.name} ({dup.segment})</p>}
          <div className="sticky bottom-0 z-10 flex items-center gap-2 bg-background pt-2 pb-1">
            <button type="button" disabled={!formData.name.trim() || phoneDigits.length !== 10 || !!dup || isUploading || addLead.isPending} onClick={() => setEsc({ region: "", reason: "" })}
              className="inline-flex h-12 shrink-0 items-center gap-1.5 rounded-xl border border-red-300 bg-red-50 px-4 text-sm font-semibold text-red-600 hover:bg-red-100 disabled:opacity-50">
              <AlertTriangle className="h-3.5 w-3.5" /> Escalate
            </button>
          <Button data-testid="create-driver-submit" type="submit" disabled={isUploading || addLead.isPending || !!dup}
            className="h-12 flex-1 rounded-xl text-base font-semibold">
            {isUploading || addLead.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {isUploading ? "Uploading…" : "Add Driver"}
          </Button>
          </div>
        </form>
        {esc && (
          <div className="absolute inset-0 z-50 flex items-center justify-center rounded-3xl bg-black/40 p-4" onClick={() => !(isUploading || addLead.isPending) && setEsc(null)}>
            <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Escalate driver</h3>
                  <p className="text-sm text-slate-500">{formData.name}</p>
                </div>
                <button type="button" onClick={() => setEsc(null)} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
              </div>
              <p className="mt-4 text-sm font-medium text-slate-700">Send to which state?</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {["Tamil Nadu", "Karnataka"].map((r) => (
                  <button type="button" key={r} onClick={() => setEsc({ ...esc, region: r })}
                    className={`rounded-xl border px-3 py-3 text-sm font-semibold ${esc.region === r ? "border-red-500 bg-red-50 text-red-600" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}>{r}</button>
                ))}
              </div>
              {esc.region && (
                <>
                  <p className="mt-4 text-sm font-medium text-slate-700">Reason</p>
                  <textarea autoFocus value={esc.reason} onChange={(e) => setEsc({ ...esc, reason: e.target.value })} rows={3}
                    placeholder="Why does this driver need attention?"
                    className="mt-2 w-full resize-none rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-red-400" />
                  <button type="button" disabled={!esc.reason.trim() || isUploading || addLead.isPending} onClick={() => handleSubmit(null, esc)}
                    className="mt-3 w-full rounded-xl bg-red-500 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                    {isUploading || addLead.isPending ? "Sending…" : `Confirm · notify ${esc.region} team`}
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
