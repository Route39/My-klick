import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { PhoneCall, Play, CheckCircle2, PartyPopper, Clock, Users, Inbox, AlertTriangle, CalendarClock } from "lucide-react";
import api from "@/lib/api";
import { useCall } from "@/context/CallContext";
import { useAuth } from "@/context/AuthContext";
import { Avatar } from "@/components/InitialsAvatar";
import { SourceBadge } from "@/components/Badges";
import { formatClock, formatDay } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function Briefing({ segment = "investor" }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { startCall } = useCall();
  const { user } = useAuth();
  const isManager = ["admin", "team_leader", "admin_staff"].includes(user?.role);
  const [filter, setFilter] = useState("overdue"); // "overdue" | "today"
  const { data, isLoading } = useQuery({ queryKey: ["briefing", segment], queryFn: async () => (await api.get("/briefing", { params: { segment } })).data });
  const { data: stats } = useQuery({ queryKey: ["stats", segment], queryFn: async () => (await api.get("/dashboard/stats", { params: { segment } })).data });
  const commonEndpoint = isManager ? "/common-leads/report" : "/common-leads/report-mine";
  const { data: common } = useQuery({ queryKey: ["common-leads", "report", segment, commonEndpoint], queryFn: async () => (await api.get(commonEndpoint, { params: { segment } })).data });

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
  const list = filter ? items.filter((it) => it.bucket === filter) : items;
  const first = list[0];

  return (
    <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      data-testid="briefing-card"
      className="relative overflow-hidden rounded-3xl border border-slate-200/60 bg-gradient-to-br from-slate-900 to-indigo-950 p-6 text-white sm:p-8">
      <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-indigo-500/20 blur-3xl" />
      <div className="relative">
        <h2 className="font-display text-2xl font-extrabold">Today's Briefing</h2>
        <p className="mt-1 text-slate-300">Here's what needs your attention today.</p>

        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
          <StatCard icon={Users} label="Total leads" value={stats?.new_leads?.total} tone={TONES.indigo} testid="briefing-total" />
          <StatCard icon={Inbox} label="Common leads" value={common?.length} sub={common ? `Not taken ${common.filter((r) => !r.assigned_to).length}` : undefined} tone={TONES.sky} testid="briefing-common" />
          <StatCard icon={CheckCircle2} label="Converted leads" value={stats?.funnel?.converted} tone={TONES.violet} testid="briefing-converted" />
          <StatCard icon={AlertTriangle} label="Overdue" value={counts.overdue} tone={TONES.red} testid="briefing-overdue" />
          <StatCard icon={CalendarClock} label="Due today" value={counts.today} tone={TONES.emerald} testid="briefing-today" />
        </div>

        
      </div>
    </motion.section>
  );
}

function Pill({ color, dot, label, value, testid, onClick, active }) {
  return (
    <button type="button" data-testid={testid} onClick={onClick}
      className={cn("inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-semibold ring-1 transition hover:brightness-125 active:scale-95", color, active && "ring-2 ring-white/70")}>
      <span className="h-2 w-2 rounded-full" style={{ background: dot }} />
      <span className="font-display text-lg font-extrabold">{value}</span> {label}
    </button>
  );
}

const TONES = {
  indigo:  { glow: "shadow-[0_8px_32px_rgba(0,0,0,0.35),0_0_26px_rgba(99,102,241,0.30),inset_0_1px_0_rgba(255,255,255,0.35)] hover:shadow-[0_0_34px_rgba(99,102,241,0.55),inset_0_1px_0_rgba(255,255,255,0.5)]",  blob: "bg-indigo-500/30",  icon: "bg-indigo-500/20 text-indigo-200 ring-indigo-400/40" },
  sky:     { glow: "shadow-[0_8px_32px_rgba(0,0,0,0.35),0_0_26px_rgba(14,165,233,0.30),inset_0_1px_0_rgba(255,255,255,0.35)] hover:shadow-[0_0_34px_rgba(14,165,233,0.55),inset_0_1px_0_rgba(255,255,255,0.5)]",    blob: "bg-sky-500/30",     icon: "bg-sky-500/20 text-sky-200 ring-sky-400/40" },
  violet:  { glow: "shadow-[0_8px_32px_rgba(0,0,0,0.35),0_0_26px_rgba(168,85,247,0.30),inset_0_1px_0_rgba(255,255,255,0.35)] hover:shadow-[0_0_34px_rgba(168,85,247,0.55),inset_0_1px_0_rgba(255,255,255,0.5)]",  blob: "bg-purple-500/30",  icon: "bg-purple-500/20 text-purple-200 ring-purple-400/40" },
  red:     { glow: "shadow-[0_8px_32px_rgba(0,0,0,0.35),0_0_26px_rgba(239,68,68,0.30),inset_0_1px_0_rgba(255,255,255,0.35)] hover:shadow-[0_0_34px_rgba(239,68,68,0.55),inset_0_1px_0_rgba(255,255,255,0.5)]",    blob: "bg-red-500/30",     icon: "bg-red-500/20 text-red-200 ring-red-400/40" },
  emerald: { glow: "shadow-[0_8px_32px_rgba(0,0,0,0.35),0_0_26px_rgba(16,185,129,0.30),inset_0_1px_0_rgba(255,255,255,0.35)] hover:shadow-[0_0_34px_rgba(16,185,129,0.55),inset_0_1px_0_rgba(255,255,255,0.5)]",  blob: "bg-emerald-500/30", icon: "bg-emerald-500/20 text-emerald-200 ring-emerald-400/40" },
};

function StatCard({ icon: Icon, label, value, sub, tone, testid }) {
  return (
    <div data-testid={testid}
      className={cn("relative flex min-h-[132px] flex-col justify-between overflow-hidden rounded-2xl border border-white/20 bg-gradient-to-br from-white/15 to-white/5 p-4 backdrop-blur-md transition hover:border-white/40", tone.glow)}>
      <span className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent" />
      <span className="pointer-events-none absolute inset-x-6 bottom-0 h-px bg-gradient-to-r from-transparent via-white/50 to-transparent" />
      <span className={cn("pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full blur-2xl", tone.blob)} />
      <div className={cn("relative flex h-10 w-10 items-center justify-center rounded-xl ring-1", tone.icon)}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="relative mt-4">
        <div className="font-display text-4xl font-extrabold leading-none">{value ?? "–"}</div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-slate-300">
          <span>{label}</span>
          {sub && <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-xs font-semibold text-amber-200 ring-1 ring-amber-300/30">{sub}</span>}
        </div>
      </div>
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
