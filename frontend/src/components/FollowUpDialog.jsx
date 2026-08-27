import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { CalendarClock } from "lucide-react";

function defaultWhen() {
  const d = new Date(Date.now() + 24 * 3600 * 1000);
  d.setMinutes(0);
  return d.toISOString().slice(0, 16);
}

export function FollowUpDialog({ open, onOpenChange, leadId }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const [when, setWhen] = useState(defaultWhen());

  const create = useMutation({
    mutationFn: async () => (await api.post(`/leads/${leadId}/followups`, {
      reason, due_at: new Date(when).toISOString(),
    })).data,
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success("Follow-up scheduled ✓");
      setReason(""); onOpenChange(false);
    },
    onError: () => toast.error("Could not schedule follow-up"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl sm:max-w-md" data-testid="followup-dialog">
        <DialogHeader>
          <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
            <CalendarClock className="h-5 w-5" />
          </div>
          <DialogTitle className="font-display text-2xl">Schedule Follow-up</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (reason && when) create.mutate(); }}>
          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Input data-testid="followup-reason-input" value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="Investment discussion" required className="rounded-xl" />
          </div>
          <div className="space-y-1.5">
            <Label>When</Label>
            <Input data-testid="followup-when-input" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)}
              required className="rounded-xl" />
          </div>
          <Button data-testid="followup-submit" type="submit" disabled={create.isPending}
            className="w-full rounded-xl py-6 text-base font-semibold">
            {create.isPending ? "Scheduling…" : "Schedule Follow-up"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
