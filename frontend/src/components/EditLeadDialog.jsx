import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import api, { formatApiErrorDetail } from "@/lib/api";
import { SOURCES, SOURCE_META, STAGES, STATUS_META } from "@/lib/constants";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pencil } from "lucide-react";

const PRIORITIES = ["high", "medium", "low"];

export function EditLeadDialog({ open, onOpenChange, lead }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(() => shape(lead));

  React.useEffect(() => { if (open) setForm(shape(lead)); }, [open, lead]);

  const { data: users = [] } = useQuery({
    queryKey: ["users"], queryFn: async () => (await api.get("/users")).data, enabled: open,
  });

  const save = useMutation({
    mutationFn: async () => (await api.put(`/leads/${lead.id}`, {
      ...form, value: Number(form.value) || 0, assigned_to: form.assigned_to || null,
    })).data,
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success("Lead updated ✓");
      onOpenChange(false);
    },
    onError: (e) => toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Could not update lead"),
  });

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="max-h-[90vh] overflow-y-auto rounded-3xl sm:max-w-lg thin-scroll" data-testid="edit-lead-dialog">
        <DialogHeader>
          <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-2xl bg-accent text-primary">
            <Pencil className="h-5 w-5" />
          </div>
          <DialogTitle className="font-display text-2xl">Edit Lead</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <Field label="Name"><Input data-testid="edit-name" value={form.name} onChange={(e) => set("name")(e.target.value)} className="rounded-xl" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone"><Input data-testid="edit-phone" value={form.phone} onChange={(e) => set("phone")(e.target.value)} className="rounded-xl" /></Field>
            <Field label="WhatsApp"><Input value={form.whatsapp} onChange={(e) => set("whatsapp")(e.target.value)} className="rounded-xl" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Email"><Input value={form.email} onChange={(e) => set("email")(e.target.value)} className="rounded-xl" /></Field>
            <Field label="Location"><Input value={form.location} onChange={(e) => set("location")(e.target.value)} className="rounded-xl" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Source">
              <Select value={form.source} onValueChange={set("source")}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>{SOURCES.map((s) => <SelectItem key={s} value={s}>{SOURCE_META[s].label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Product / interest"><Input value={form.product} onChange={(e) => set("product")(e.target.value)} className="rounded-xl" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cash value (₹)"><Input data-testid="edit-value" type="number" value={form.value} onChange={(e) => set("value")(e.target.value)} className="rounded-xl" /></Field>
            <Field label="No of vehicles"><Input data-testid="edit-vehicles" value={form.no_of_vehicles} onChange={(e) => set("no_of_vehicles")(e.target.value)} className="rounded-xl" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Priority">
              <Select value={form.priority} onValueChange={set("priority")}>
                <SelectTrigger data-testid="edit-priority" className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Assigned to">
              <Select value={form.assigned_to} onValueChange={set("assigned_to")}>
                <SelectTrigger data-testid="edit-assign" className="rounded-xl"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>{users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Status">
              <Select value={form.status} onValueChange={set("status")}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>{STAGES.map((s) => <SelectItem key={s} value={s}>{STATUS_META[s].label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Notes"><Textarea value={form.notes} onChange={(e) => set("notes")(e.target.value)} className="rounded-xl" rows={3} /></Field>
          <Field label="Remarks"><Input data-testid="edit-remarks" value={form.remarks} onChange={(e) => set("remarks")(e.target.value)} className="rounded-xl" /></Field>
          <Button data-testid="edit-lead-submit" type="submit" disabled={save.isPending} className="w-full rounded-xl py-6 text-base font-semibold">
            {save.isPending ? "Saving…" : "Save Changes"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}

function shape(l = {}) {
  return {
    name: l.name || "", phone: l.phone || "", whatsapp: l.whatsapp || "", email: l.email || "",
    location: l.location || "", product: l.product || "", source: l.source || "manual",
    status: l.status || "new", priority: l.priority || "medium",
    assigned_to: l.assigned_to || "", value: l.value || 0, notes: l.notes || "", company: l.company || "",
    no_of_vehicles: l.no_of_vehicles || "", remarks: l.remarks || "",
    segment: l.segment || "investor", rc: l.rc || "",
    aadhaar_url: l.aadhaar_url || "", pan_url: l.pan_url || "", license_url: l.license_url || "",
  };
}
