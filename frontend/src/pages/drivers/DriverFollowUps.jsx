import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useOutletContext } from "react-router-dom";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { CalendarClock, Clock, CheckCircle2, PartyPopper, Trash, Phone, MessageCircle, Pencil } from "lucide-react";
import api from "@/lib/api";
import { Avatar } from "@/components/InitialsAvatar";
import { StatusBadge } from "@/components/Badges";
import { EmptyState } from "@/components/EmptyState";
import { ListSkeleton } from "@/components/Skeletons";
import { formatClock, formatDay, formatINR } from "@/lib/constants";
import { useCall } from "@/context/CallContext";
import { cn } from "@/lib/utils";

export default function DriverFollowUps({ segment = "driver" }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { openAdd } = useOutletContext();
  const { data = [], isLoading } = useQuery({
    queryKey: ["followups", "all", segment],
    queryFn: async () => (await api.get("/followups", { params: { scope: "all", segment } })).data,
    refetchInterval: 15000,
    placeholderData: (prev) => prev,
  });

  const complete = useMutation({
    mutationFn: async (id) => (await api.patch(`/followups/${id}/complete`)).data,
    onSuccess: () => { qc.invalidateQueries(); toast.success("Follow-up completed ✓"); },
  });
  const reschedule = useMutation({
    mutationFn: async (id) => (await api.patch(`/followups/${id}/reschedule`, { due_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString() })).data,
    onSuccess: () => { qc.invalidateQueries(); toast.success("Rescheduled to tomorrow ✓"); },
  });
  const deleteFollowup = useMutation({
    mutationFn: async (id) => (await api.delete(`/followups/${id}`)).data,
    onSuccess: () => { qc.invalidateQueries(); toast.success("Follow-up deleted ✓"); },
    onError: (e) => toast.error(e.response?.data?.detail || "Could not delete follow-up"),
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
        <EmptyState icon={PartyPopper} title="You're all caught up 🎉" subtitle="No pending follow-ups. Schedule one from a Lead's profile." testid="followups-empty"
          action={<button onClick={() => openAdd("follow_up")} className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary/25 transition hover:bg-indigo-700">+ Add Lead</button>} />
      ) : (
        <div className="space-y-6">
          {overdue.length > 0 && (
            <Section title="Overdue" count={overdue.length} danger>
              {overdue.map((f, i) => <Row key={f.id} f={f} i={i} onComplete={() => complete.mutate(f.id)} onReschedule={() => reschedule.mutate(f.id)} onDelete={() => { if(window.confirm("Delete this follow-up?")) deleteFollowup.mutate(f.id); }} onOpen={() => navigate(`/drivers/leads/${f.lead_id}`)} onEdit={() => navigate(`/drivers/leads/${f.lead_id}?edit=true`)} />)}
            </Section>
          )}
          {upcoming.length > 0 && (
            <Section title="Upcoming" count={upcoming.length}>
              {upcoming.map((f, i) => <Row key={f.id} f={f} i={i} onComplete={() => complete.mutate(f.id)} onReschedule={() => reschedule.mutate(f.id)} onDelete={() => { if(window.confirm("Delete this follow-up?")) deleteFollowup.mutate(f.id); }} onOpen={() => navigate(`/drivers/leads/${f.lead_id}`)} onEdit={() => navigate(`/drivers/leads/${f.lead_id}?edit=true`)} />)}
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

function Row({ f, i, onComplete, onReschedule, onDelete, onOpen, onEdit }) {
  const { startCall } = useCall();
  const hrs = Math.round((Date.now() - new Date(f.due_at)) / 3600000);
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.04, 0.3) }}
      data-testid={`followup-card-${f.id}`}
      className={cn("flex flex-col gap-3 rounded-2xl border p-4 transition hover:shadow-md",
        f.overdue ? "border-red-200 bg-red-50/30 hover:border-red-300" : "border-slate-200 bg-white hover:border-primary/30")}>
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <button onClick={onOpen} className="min-w-0 flex-1 text-left flex items-start gap-4">
          <Avatar name={f.lead_name || "?"} size={46} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-display font-semibold text-slate-900">{f.lead_name || "Unknown Lead"}</span>
              {f.lead_status && <StatusBadge status={f.lead_status} />}
            </div>
            <div className="mt-0.5 flex items-center gap-3 text-xs text-slate-500">
              <span>{f.lead_phone || "No Phone"}</span>
              {f.lead_value > 0 && <span className="font-semibold text-slate-700">{formatINR(f.lead_value)}</span>}
            </div>
            <div className="mt-1 truncate text-sm text-slate-600">{f.reason}</div>
          </div>
        </button>

        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 sm:border-0 sm:pt-0 shrink-0">
          <div className={cn("inline-flex items-center gap-1.5 text-xs font-semibold mr-3", f.overdue ? "text-red-600" : "text-amber-600")}>
            <Clock className="h-3.5 w-3.5" />
            {f.overdue ? `Overdue by ${hrs}h` : `${formatDay(f.due_at)} · ${formatClock(f.due_at)}`}
          </div>

          <button data-testid={`call-followup-${f.id}`} onClick={() => startCall({ id: f.lead_id, name: f.lead_name, phone: f.lead_phone })}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 transition hover:bg-indigo-100 active:scale-90"><Phone className="h-4 w-4" /></button>
          
          <button data-testid={`whatsapp-followup-${f.id}`} onClick={async () => { await api.post(`/leads/${f.lead_id}/whatsapp`, { text: "Hi, following up on your enquiry." }); toast.success("WhatsApp sent ✓"); }}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 transition hover:bg-emerald-100 active:scale-90"><MessageCircle className="h-4 w-4" /></button>

          <button data-testid={`edit-followup-${f.id}`} onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition hover:bg-slate-200 active:scale-90"><Pencil className="h-4 w-4" /></button>

          <div className="h-6 w-px bg-slate-200 mx-1 hidden sm:block" />

          <button data-testid={`complete-followup-${f.id}`} onClick={onComplete}
            className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-600 active:scale-95">
            <CheckCircle2 className="h-3.5 w-3.5" /> Complete
          </button>
          <button data-testid={`reschedule-followup-${f.id}`} onClick={onReschedule}
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 active:scale-95">
            Reschedule
          </button>
          <button data-testid={`delete-followup-${f.id}`} onClick={onDelete}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-50 text-red-600 transition hover:bg-red-100 active:scale-90">
            <Trash className="h-4 w-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
