import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { CalendarClock, Clock, CheckCircle2, PartyPopper } from "lucide-react";
import api from "@/lib/api";
import { Avatar } from "@/components/InitialsAvatar";
import { EmptyState } from "@/components/EmptyState";
import { ListSkeleton } from "@/components/Skeletons";
import { formatClock, formatDay } from "@/lib/constants";
import { cn } from "@/lib/utils";

export default function FollowUps() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data = [], isLoading } = useQuery({ queryKey: ["followups", "all"], queryFn: async () => (await api.get("/followups?scope=all")).data });

  const complete = useMutation({
    mutationFn: async (id) => (await api.patch(`/followups/${id}/complete`)).data,
    onSuccess: () => { qc.invalidateQueries(); toast.success("Follow-up completed ✓"); },
  });
  const reschedule = useMutation({
    mutationFn: async (id) => (await api.patch(`/followups/${id}/reschedule`, { due_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString() })).data,
    onSuccess: () => { qc.invalidateQueries(); toast.success("Rescheduled to tomorrow ✓"); },
  });

  const overdue = data.filter((f) => f.overdue);
  const upcoming = data.filter((f) => !f.overdue);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-slate-900">Follow-ups</h1>
        <p className="mt-1 text-slate-500">{data.length} pending · {overdue.length} overdue</p>
      </div>

      {isLoading ? <ListSkeleton count={5} /> : data.length === 0 ? (
        <EmptyState icon={PartyPopper} title="You're all caught up 🎉" subtitle="No pending follow-ups. Great work!" testid="followups-empty" />
      ) : (
        <div className="space-y-6">
          {overdue.length > 0 && (
            <Section title="Overdue" count={overdue.length} danger>
              {overdue.map((f, i) => <Row key={f.id} f={f} i={i} onComplete={() => complete.mutate(f.id)} onReschedule={() => reschedule.mutate(f.id)} onOpen={() => navigate(`/leads/${f.lead_id}`)} />)}
            </Section>
          )}
          {upcoming.length > 0 && (
            <Section title="Upcoming" count={upcoming.length}>
              {upcoming.map((f, i) => <Row key={f.id} f={f} i={i} onComplete={() => complete.mutate(f.id)} onReschedule={() => reschedule.mutate(f.id)} onOpen={() => navigate(`/leads/${f.lead_id}`)} />)}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, count, danger, children }) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <h2 className={cn("font-display text-lg font-bold", danger ? "text-red-600" : "text-slate-900")}>{title}</h2>
        <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", danger ? "bg-red-100 text-red-600" : "bg-slate-100 text-slate-500")}>{count}</span>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Row({ f, i, onComplete, onReschedule, onOpen }) {
  const hrs = Math.round((Date.now() - new Date(f.due_at)) / 3600000);
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.04, 0.3) }}
      data-testid={`followup-card-${f.id}`}
      className={cn("flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center",
        f.overdue ? "border-red-200 bg-red-50/60" : "border-slate-200 bg-white")}>
      <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white", f.overdue ? "bg-red-500" : "bg-primary")}>
        <CalendarClock className="h-5 w-5" />
      </div>
      <button onClick={onOpen} className="min-w-0 flex-1 text-left">
        <div className="truncate font-display font-bold text-slate-900">{f.lead_name}</div>
        <div className="truncate text-sm text-slate-500">{f.reason}</div>
        <div className={cn("mt-1 inline-flex items-center gap-1 text-xs font-medium", f.overdue ? "text-red-600" : "text-amber-600")}>
          <Clock className="h-3 w-3" />
          {f.overdue ? `Overdue by ${hrs}h` : `${formatDay(f.due_at)} · ${formatClock(f.due_at)}`}
        </div>
      </button>
      <div className="flex items-center gap-2">
        <Avatar name={f.assigned_name || "?"} size={26} />
        <button data-testid={`complete-followup-${f.id}`} onClick={onComplete}
          className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-600 active:scale-95">
          <CheckCircle2 className="h-3.5 w-3.5" /> Complete
        </button>
        <button data-testid={`reschedule-followup-${f.id}`} onClick={onReschedule}
          className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 active:scale-95">
          Reschedule
        </button>
      </div>
    </motion.div>
  );
}
