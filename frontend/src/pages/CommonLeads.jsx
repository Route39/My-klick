import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Inbox, Plus, UserPlus, Phone, MapPin } from "lucide-react";
import { toast } from "sonner";
import api, { formatApiErrorDetail } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { EmptyState } from "@/components/EmptyState";
import { ListSkeleton } from "@/components/Skeletons";
import { formatDay } from "@/lib/constants";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

const EMPTY = { name: "", phone: "", location: "", remarks: "" };

function AddCommonLeadDialog({ open, onOpenChange, segment }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(EMPTY);
  const create = useMutation({
    mutationFn: async () => (await api.post("/leads", {
      ...form, whatsapp: form.phone, segment, is_common: true, source: "manual", status: "new",
    })).data,
    onSuccess: () => {
      toast.success("Common lead posted — all staff notified");
      setForm(EMPTY);
      onOpenChange(false);
      qc.invalidateQueries({ queryKey: ["common-leads"] });
    },
    onError: (e) => toast.error(formatApiErrorDetail(e.response?.data?.detail)),
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="rounded-3xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New common {segment === "driver" ? "driver" : "investor"} lead</DialogTitle>
        </DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
          <div><Label>Name *</Label><Input required className="rounded-xl" value={form.name} onChange={set("name")} /></div>
          <div><Label>Phone *</Label><Input required type="tel" className="rounded-xl" value={form.phone} onChange={set("phone")} /></div>
          <div><Label>Location</Label><Input className="rounded-xl" value={form.location} onChange={set("location")} /></div>
          <div><Label>Remarks</Label><Input className="rounded-xl" value={form.remarks} onChange={set("remarks")} /></div>
          <Button type="submit" className="w-full rounded-xl" disabled={create.isPending}>
            {create.isPending ? "Posting..." : "Post to all staff"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function CommonLeads({ segment = "investor" }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const isManager = ["admin", "team_leader"].includes(user?.role);
  const canPost = isManager || user?.role === "admin_staff";
  const myLeadsPath = segment === "driver" ? "/drivers/leads" : "/leads";

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["common-leads", segment],
    queryFn: async () => (await api.get("/common-leads", { params: { segment } })).data,
    refetchInterval: 15000,
  });

  const claim = useMutation({
    mutationFn: async (id) => (await api.post(`/common-leads/${id}/claim`)).data,
    onSuccess: (lead) => {
      toast.success(`${lead.name} added to your leads`, {
        action: { label: "Open", onClick: () => navigate(`${myLeadsPath}/${lead.id}`) },
      });
      qc.invalidateQueries({ queryKey: ["common-leads"] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
    onError: (e) => {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
      qc.invalidateQueries({ queryKey: ["common-leads"] });
    },
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-slate-900">Common Leads</h1>
          <p className="mt-1 text-sm text-slate-500">
            {leads.length} open {segment === "driver" ? "driver" : "investor"} leads · first to assign gets it
          </p>
        </div>
        {canPost && (
          <Button className="rounded-xl" onClick={() => setAddOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Common Lead
          </Button>
        )}
      </div>

      {isLoading ? <ListSkeleton /> : leads.length === 0 ? (
        <EmptyState icon={Inbox} title="No common leads right now"
          subtitle={canPost ? "Post a lead here and every staff member gets notified." : "You'll hear a sound when admin posts a new one."} />
      ) : (
        <div className="overflow-hidden rounded-3xl border border-slate-200/70 bg-white">
          {leads.map((l) => (
            <div key={l.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 last:border-0">
              <div className="min-w-0">
                <div className="font-semibold text-slate-900">{l.name}</div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                  <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{l.phone}</span>
                  {l.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{l.location}</span>}
                  <span>Posted by {l.created_by_name || "Admin"} · {formatDay(l.created_at)}</span>
                </div>
                {l.remarks && <div className="mt-1 text-xs text-slate-400">{l.remarks}</div>}
              </div>
              <Button size="sm" className="rounded-xl" disabled={claim.isPending}
                onClick={() => claim.mutate(l.id)}>
                <UserPlus className="mr-1 h-4 w-4" /> Assign to me
              </Button>
            </div>
          ))}
        </div>
      )}

      <AddCommonLeadDialog open={addOpen} onOpenChange={setAddOpen} segment={segment} />
    </div>
  );
}
