import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import api from "@/lib/api";
import { SOURCES, SOURCE_META } from "@/lib/constants";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Rocket } from "lucide-react";

export function AddLeadDialog({ open, onOpenChange, defaultStatus = "new" }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "", phone: "", whatsapp: "", source: "manual", assigned_to: "", value: "", no_of_vehicles: "", remarks: "",
  });

  const { data: users = [] } = useQuery({
    queryKey: ["users"], queryFn: async () => (await api.get("/users")).data, enabled: open,
  });

  const create = useMutation({
    mutationFn: async () => (await api.post("/leads", {
      ...form,
      value: Number(form.value) || 0,
      status: defaultStatus,
      assigned_to: form.assigned_to || null,
    })).data,
    onSuccess: (lead) => {
      qc.invalidateQueries();
      toast.success("Lead created ✓", { description: lead.name });
      setForm({ name: "", phone: "", whatsapp: "", source: "manual", assigned_to: "", value: "", no_of_vehicles: "", remarks: "" });
      onOpenChange(false);
      navigate(`/leads/${lead.id}`);
    },
    onError: () => toast.error("Could not create lead"),
  });

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl sm:max-w-md" data-testid="add-lead-dialog">
        <DialogHeader>
          <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-2xl bg-accent text-primary">
            <Rocket className="h-5 w-5" />
          </div>
          <DialogTitle className="font-display text-2xl">Add Lead</DialogTitle>
          <p className="text-sm text-slate-500">Add the essentials now — details later.</p>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => { e.preventDefault(); if (form.name && form.phone) create.mutate(); }}
        >
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input data-testid="lead-name-input" value={form.name} onChange={(e) => set("name")(e.target.value)}
              placeholder="Kumar Traders" required className="rounded-xl" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input data-testid="lead-phone-input" value={form.phone} onChange={(e) => set("phone")(e.target.value)}
                placeholder="+91 98765 43210" required className="rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label>WhatsApp</Label>
              <Input data-testid="lead-whatsapp-input" value={form.whatsapp} onChange={(e) => set("whatsapp")(e.target.value)}
                placeholder="Optional" className="rounded-xl" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Source</Label>
              <Select value={form.source} onValueChange={set("source")}>
                <SelectTrigger data-testid="lead-source-select" className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SOURCES.map((s) => <SelectItem key={s} value={s}>{SOURCE_META[s].label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Cash value</Label>
              <Input data-testid="lead-value-input" type="number" value={form.value} onChange={(e) => set("value")(e.target.value)}
                placeholder="₹" className="rounded-xl" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>No of vehicles</Label>
              <Input data-testid="lead-vehicles-input" value={form.no_of_vehicles} onChange={(e) => set("no_of_vehicles")(e.target.value)}
                placeholder="e.g. 2" className="rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label>Assign to</Label>
              <Select value={form.assigned_to} onValueChange={set("assigned_to")}>
                <SelectTrigger data-testid="lead-assign-select" className="rounded-xl"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Remarks</Label>
            <Input data-testid="lead-remarks-input" value={form.remarks} onChange={(e) => set("remarks")(e.target.value)}
              placeholder="Any additional remarks..." className="rounded-xl" />
          </div>
          <Button data-testid="create-lead-submit" type="submit" disabled={create.isPending}
            className="w-full rounded-xl py-6 text-base font-semibold">
            {create.isPending ? "Creating…" : "Create Lead"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
