import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { PhoneCall, Play, CheckCircle2, PartyPopper, Clock } from "lucide-react";
import api from "@/lib/api";
import { useCall } from "@/context/CallContext";
import { Avatar } from "@/components/InitialsAvatar";
import { SourceBadge } from "@/components/Badges";
import { formatClock, formatDay } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function Briefing({ segment = "investor" }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { startCall } = useCall();
  const { data, isLoading } = useQuery({ queryKey: ["briefing", segment], queryFn: async () => (await api.get("/briefing", { params: { segment } })).data });

  const complete = useMutation({
    mutationFn: async (fid) => (await api.patch(`/followups/${fid}/complete`)).data,
    onSuccess: () => { qc.invalidateQueries(); toast.success("Follow-up completed ✓"); },
  });
  const reschedule = useMutation({
    mutationFn: async (fid) => (await api.patch(`/followups/${fid}/reschedule`, { due_at: new Date(Date.now() + 864e5).toISOString() })).data,
    onSuccess: () => { qc.invalidateQueries(); toast.success("Rescheduled to tomorrow ✓"); },
  });
  const whatsapp = async (lid, name) => {
    await api.post(`/leads/${lid}/whatsapp`, { text: "Hi, following up on your enquiry." });
    toast.success("WhatsApp sent ✓", { description: name });
  };

  if (isLoading || !data) return null;
  const { counts, items } = data;
  const first = items[0];

  return (
    <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      data-testid="briefing-card"
      className="relative overflow-hidden rounded-3xl border border-slate-200/60 bg-gradient-to-br from-slate-900 to-indigo-950 p-6 text-white sm:p-8">
      <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-indigo-500/20 blur-3xl" />
      <div className="relative">
        <h2 className="font-display text-2xl font-extrabold">Today's Briefing</h2>
        <p className="mt-1 text-slate-300">Here's what needs your attention today.</p>

        <div className="mt-5 flex flex-wrap gap-3">
          <Pill color="bg-red-500/20 text-red-200 ring-red-400/30" dot="#ef4444" label="Overdue" value={counts.overdue} testid="briefing-overdue" />
          <Pill color="bg-amber-500/20 text-amber-200 ring-amber-400/30" dot="#f59e0b" label="High priority" value={counts.high_priority} testid="briefing-high" />
          <Pill color="bg-emerald-500/20 text-emerald-200 ring-emerald-400/30" dot="#10b981" label="Due today" value={counts.today} testid="briefing-today" />
        </div>

        {first ? (
          <div className="mt-6">
            <div className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-400">Start with this</div>
            <div className="rounded-2xl bg-white/10 p-4 backdrop-blur" data-testid="briefing-top-item">
              <div className="flex items-center gap-3">
                <Avatar name={first.name} size={44} />
                <button onClick={() => navigate(segment === "driver" ? `/drivers/leads/${first.lead_id}` : `/leads/${first.lead_id}`)} className="min-w-0 flex-1 text-left">
                  <div className="truncate font-display font-bold">{first.name}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-300">
                    <span className="capitalize">{first.status?.replace("_", " ")}</span>
                    {first.followup_at && <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {formatClock(first.followup_at)}</span>}
                    {first.last_call && <span>Last call · {first.last_call}</span>}
                  </div>
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Act testid="briefing-call" onClick={() => startCall({ ...first, id: first.lead_id })} className="bg-indigo-500 hover:bg-indigo-600">📞 Call</Act>
                <Act testid="briefing-whatsapp" onClick={() => whatsapp(first.lead_id, first.name)} className="bg-emerald-500 hover:bg-emerald-600">💬 WhatsApp</Act>
                {first.followup_id && <Act testid="briefing-complete" onClick={() => complete.mutate(first.followup_id)} className="bg-white/15 hover:bg-white/25">✓ Complete</Act>}
                {first.followup_id && <Act testid="briefing-reschedule" onClick={() => reschedule.mutate(first.followup_id)} className="bg-white/15 hover:bg-white/25">Reschedule</Act>}
              </div>
            </div>

            {items.length > 1 && (
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {items.slice(1, 5).map((it) => (
                  <button key={it.lead_id} onClick={() => navigate(segment === "driver" ? `/drivers/leads/${it.lead_id}` : `/leads/${it.lead_id}`)}
                    className="flex items-center gap-3 rounded-xl bg-white/5 p-3 text-left transition hover:bg-white/10">
                    <span className="h-2 w-2 rounded-full" style={{ background: it.bucket === "overdue" ? "#ef4444" : it.bucket === "today" ? "#10b981" : "#f59e0b" }} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{it.name}</div>
                      <div className="truncate text-xs text-slate-400">{it.reason || it.status?.replace("_", " ")}</div>
                    </div>
                    {it.followup_at && <span className="text-xs text-slate-400">{formatClock(it.followup_at)}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="mt-6 rounded-2xl bg-white/10 p-6 text-center backdrop-blur">
            <PartyPopper className="mx-auto h-8 w-8 text-emerald-300" />
            <p className="mt-2 font-display text-lg font-bold">You're all caught up 🎉</p>
            <p className="text-sm text-slate-300">No urgent follow-ups right now.</p>
          </div>
        )}
      </div>
    </motion.section>
  );
}

function Pill({ color, dot, label, value, testid }) {
  return (
    <div data-testid={testid} className={cn("inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-semibold ring-1", color)}>
      <span className="h-2 w-2 rounded-full" style={{ background: dot }} />
      <span className="font-display text-lg font-extrabold">{value}</span> {label}
    </div>
  );
}

function Act({ children, onClick, className, testid }) {
  return (
    <button data-testid={testid} onClick={onClick}
      className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition active:scale-95", className)}>
      {children}
    </button>
  );
}
