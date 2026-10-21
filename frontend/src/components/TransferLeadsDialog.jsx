import React, { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import api, { formatApiErrorDetail } from "@/lib/api";
import { STATUS_META } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Move a staff member's leads to one or more other staff (several = equal split). */
export function TransferLeadsDialog({ staff, open, onOpenChange }) {
  const qc = useQueryClient();
  const [seg, setSeg] = useState("all");
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState(() => new Set());
  const [targets, setTargets] = useState(() => new Set());

  React.useEffect(() => {
    if (open) { setPicked(new Set()); setTargets(new Set()); setSeg("all"); setStatus("all"); setQ(""); }
  }, [open, staff?.id]);

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["transfer-leads", staff?.id],
    queryFn: async () => (await api.get("/leads", { params: { assigned_to: staff.id } })).data,
    enabled: open && !!staff,
  });
  const { data: users = [] } = useQuery({
    queryKey: ["users"], queryFn: async () => (await api.get("/users")).data, enabled: open,
  });
  const staffList = users.filter((u) => u.id !== staff?.id);

  const statuses = useMemo(() => [...new Set(leads.map((l) => l.status))], [leads]);
  const shown = useMemo(() => leads.filter((l) =>
    (seg === "all" || (l.segment || "investor") === seg) &&
    (status === "all" || l.status === status) &&
    (!q || `${l.name} ${l.phone}`.toLowerCase().includes(q.toLowerCase()))
  ), [leads, seg, status, q]);
  const allShownPicked = shown.length > 0 && shown.every((l) => picked.has(l.id));

  const toggle = (set, setter, id) => { const n = new Set(set); n.has(id) ? n.delete(id) : n.add(id); setter(n); };
  const toggleAll = () => {
    const n = new Set(picked);
    shown.forEach((l) => (allShownPicked ? n.delete(l.id) : n.add(l.id)));
    setPicked(n);
  };

  const move = useMutation({
    mutationFn: async () => (await api.post(`/team/${staff.id}/transfer`, {
      lead_ids: [...picked], to_user_ids: [...targets],
    })).data,
    onSuccess: (r) => {
      toast.success(`${r.moved} leads transferred ✓`, { description: r.summary.map((s) => `${s.to}: ${s.count}`).join(" · ") });
      setPicked(new Set());
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Transfer failed"),
  });

  if (!staff) return null;
  const per = targets.size ? Math.ceil(picked.size / targets.size) : 0;
  const sel = "h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="rounded-2xl sm:max-w-2xl">
        <div>
          <DialogTitle className="font-display text-xl font-bold text-slate-900">Transfer leads · {staff.name}</DialogTitle>
          <p className="mt-1 text-sm text-slate-500">
            {leads.length} leads with {staff.name}. Select leads → pick staff → Transfer. Pick several staff to split equally.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <select value={seg} onChange={(e) => setSeg(e.target.value)} className={sel}>
            <option value="all">All segments</option>
            <option value="investor">Investor</option>
            <option value="driver">Driver</option>
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={sel}>
            <option value="all">All status</option>
            {statuses.map((s) => <option key={s} value={s}>{STATUS_META[s]?.label || s}</option>)}
          </select>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name / phone"
            className="h-10 min-w-[160px] flex-1 rounded-xl" />
        </div>

        <div className="max-h-[40dvh] overflow-y-auto rounded-xl border border-slate-200">
          <label className="sticky top-0 z-10 flex cursor-pointer items-center gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
            <input type="checkbox" checked={allShownPicked} onChange={toggleAll} className="h-4 w-4" />
            Select all ({shown.length})
          </label>
          {isLoading ? (
            <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
          ) : shown.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-400">No leads</div>
          ) : shown.map((l) => (
            <label key={l.id} className="flex cursor-pointer items-center gap-3 border-b border-slate-100 px-3 py-2 text-sm last:border-0 hover:bg-slate-50">
              <input type="checkbox" checked={picked.has(l.id)} onChange={() => toggle(picked, setPicked, l.id)} className="h-4 w-4" />
              <span className="min-w-0 flex-1 truncate font-medium text-slate-900">{l.name}</span>
              <span className="hidden text-xs text-slate-500 sm:inline">{l.phone}</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs capitalize text-slate-600">{l.segment || "investor"}</span>
              <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700">{STATUS_META[l.status]?.label || l.status}</span>
            </label>
          ))}
        </div>

        <div>
          <div className="mb-2 text-sm font-semibold text-slate-700">Transfer to</div>
          <div className="flex flex-wrap gap-2">
            {staffList.map((u) => (
              <button type="button" key={u.id} onClick={() => toggle(targets, setTargets, u.id)}
                className={cn("rounded-full border px-3 py-1.5 text-sm transition",
                  targets.has(u.id) ? "border-primary bg-primary text-white" : "border-slate-200 bg-white text-slate-700 hover:border-primary/50")}>
                {u.name}{u.location ? ` · ${u.location}` : ""}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <span className="text-sm text-slate-500">
            {picked.size} selected{targets.size > 1 && picked.size ? ` · ~${per} each` : ""}
          </span>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="rounded-xl">Close</Button>
            <Button type="button" disabled={!picked.size || !targets.size || move.isPending} onClick={() => move.mutate()} className="rounded-xl">
              {move.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Transfer
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
