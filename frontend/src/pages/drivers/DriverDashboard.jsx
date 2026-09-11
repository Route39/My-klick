import React, { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { motion, useInView } from "framer-motion";
import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line,
} from "recharts";
import {
  Sparkles, CalendarClock, Phone, TrendingUp, ArrowUpRight, Clock, MessageCircle,
  UserPlus, Repeat, PartyPopper, CheckCircle2,
} from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Avatar } from "@/components/InitialsAvatar";
import { StatSkeleton, ListSkeleton } from "@/components/Skeletons";
import { Briefing } from "@/components/Briefing";
import { STATUS_META, STAGES, SOURCE_META, formatINR, timeAgo, formatClock, formatDay } from "@/lib/constants";
import { cn } from "@/lib/utils";

function useCountUp(target = 0, dur = 900) {
  const [val, setVal] = useState(0);
  const ref = useRef();
  const inView = useInView(ref, { once: true });
  useEffect(() => {
    if (!inView) return;
    let start; const from = 0;
    const step = (t) => {
      if (!start) start = t;
      const p = Math.min((t - start) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(from + (target - from) * eased));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [inView, target, dur]);
  return [val, ref];
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function DriverDashboard() {
  const segment = "driver";
  const { user } = useAuth();
  const { data: stats, isLoading } = useQuery({ queryKey: ["stats", segment], queryFn: async () => (await api.get("/dashboard/stats", { params: { segment } })).data });
  const { data: activities = [] } = useQuery({ queryKey: ["activities", segment], queryFn: async () => (await api.get("/activities", { params: { limit: 8, segment: "driver" } })).data });
  const { data: followups = [] } = useQuery({ queryKey: ["followups", "today", segment], queryFn: async () => (await api.get("/followups", { params: { scope: "today", segment: "driver" } })).data });

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
          {greeting()}, {user?.name?.split(" ")[0]} 👋
        </h1>
        <p className="mt-1.5 text-slate-500">Here's what's happening with your sales today.</p>
      </motion.div>

      <Briefing segment="driver" />

      {/* Snapshot cards */}
      {isLoading || !stats ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <StatSkeleton key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
          <SnapshotCard label="New Leads" value={stats.new_leads.total} sub={`+${stats.new_leads.delta_today} today`}
            icon={Sparkles} accent="#0EA5E9" spark={stats.new_leads.spark} testid="stat-new-leads" />
          <FollowUpCard label="Follow-ups" value={stats.follow_ups.total} sub={`${stats.follow_ups.due_today} due today`}
            icon={CalendarClock} accent="#F59E0B" pct={stats.follow_ups.total ? Math.round(stats.follow_ups.due_today / stats.follow_ups.total * 100) : 0} />
          <RingCard label="Calls" value={stats.calls.total} sub={`${stats.calls.connected} connected`}
            icon={Phone} accent="#6366F1" rate={stats.calls.rate} />
          <SnapshotCard label="Conversions" value={stats.conversions.total} sub={`+${stats.conversions.delta_pct}%`}
            icon={TrendingUp} accent="#10B981" spark={stats.conversions.spark} line testid="stat-conversions" />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Funnel */}
        <div className="lg:col-span-2">
          {stats && <Funnel funnel={stats.funnel} />}
        </div>
        {/* Sources */}
        <div>{stats && <Sources sources={stats.sources} />}</div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2"><ActivityStream activities={activities} loading={isLoading} /></div>
        <div><TodayFollowUps followups={followups} /></div>
      </div>
    </div>
  );
}

function Card({ children, className = "" }) {
  return <div className={cn("rounded-2xl border border-slate-200/60 bg-white p-6", className)}>{children}</div>;
}

function SnapshotCard({ label, value, sub, icon: Icon, accent, spark = [], line, testid }) {
  const [v, ref] = useCountUp(value);
  const data = spark.map((y, i) => ({ i, y }));
  return (
    <motion.div ref={ref} whileHover={{ y: -4 }} data-testid={testid}
      className="overflow-hidden rounded-2xl border border-slate-200/60 bg-white p-6 transition-shadow hover:shadow-lg">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-widest text-slate-400">{label}</span>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: `${accent}18`, color: accent }}>
          <Icon className="h-4.5 w-4.5" />
        </div>
      </div>
      <div className="mt-3 font-display text-4xl font-extrabold tabular-nums text-slate-900">{v}</div>
      <div className="mt-1 inline-flex items-center gap-1 text-sm font-semibold" style={{ color: accent }}>
        <ArrowUpRight className="h-3.5 w-3.5" /> {sub}
      </div>
      <div className="mt-3 h-10">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={40}>
          {line ? (
            <LineChart data={data}><Line type="monotone" dataKey="y" stroke={accent} strokeWidth={2.5} dot={false} /></LineChart>
          ) : (
            <AreaChart data={data}>
              <defs><linearGradient id={`g${label}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={accent} stopOpacity={0.4} /><stop offset="100%" stopColor={accent} stopOpacity={0} />
              </linearGradient></defs>
              <Area type="monotone" dataKey="y" stroke={accent} strokeWidth={2.5} fill={`url(#g${label})`} />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}

function FollowUpCard({ label, value, sub, icon: Icon, accent, pct }) {
  const [v, ref] = useCountUp(value);
  return (
    <motion.div ref={ref} whileHover={{ y: -4 }} data-testid="stat-followups"
      className="rounded-2xl border border-slate-200/60 bg-white p-6 transition-shadow hover:shadow-lg">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-widest text-slate-400">{label}</span>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: `${accent}18`, color: accent }}><Icon className="h-4.5 w-4.5" /></div>
      </div>
      <div className="mt-3 font-display text-4xl font-extrabold tabular-nums text-slate-900">{v}</div>
      <div className="mt-1 text-sm font-semibold text-amber-600">{sub}</div>
      <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100">
        <motion.div className="h-full rounded-full" style={{ background: accent }}
          initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8, delay: 0.2 }} />
      </div>
    </motion.div>
  );
}

function RingCard({ label, value, sub, icon: Icon, accent, rate }) {
  const [v, ref] = useCountUp(value);
  const r = 26, c = 2 * Math.PI * r;
  return (
    <motion.div ref={ref} whileHover={{ y: -4 }} data-testid="stat-calls"
      className="rounded-2xl border border-slate-200/60 bg-white p-6 transition-shadow hover:shadow-lg">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-widest text-slate-400">{label}</span>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: `${accent}18`, color: accent }}><Icon className="h-4.5 w-4.5" /></div>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <div>
          <div className="font-display text-4xl font-extrabold tabular-nums text-slate-900">{v}</div>
          <div className="mt-1 text-sm font-medium text-slate-500">{sub}</div>
        </div>
        <div className="relative h-16 w-16">
          <svg className="h-16 w-16 -rotate-90" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r={r} fill="none" stroke="#EEF2FF" strokeWidth="7" />
            <motion.circle cx="32" cy="32" r={r} fill="none" stroke={accent} strokeWidth="7" strokeLinecap="round"
              strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c - (c * rate) / 100 }}
              transition={{ duration: 1, delay: 0.2 }} />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center font-display text-sm font-bold text-slate-900">{rate}%</div>
        </div>
      </div>
    </motion.div>
  );
}

function Funnel({ funnel }) {
  const navigate = useNavigate();
  const max = Math.max(...STAGES.map((s) => funnel[s] || 0), 1);
  const stages = STAGES.filter((s) => s !== "lost");
  return (
    <Card>
      <h2 className="font-display text-lg font-bold text-slate-900">Sales Funnel</h2>
      <p className="text-sm text-slate-400">Click a stage to open its leads</p>
      <div className="mt-5 space-y-3">
        {stages.map((s, i) => {
          const m = STATUS_META[s]; const count = funnel[s] || 0;
          return (
            <button key={s} data-testid={`funnel-stage-${s}`} onClick={() => navigate(`/leads?status=${s}`)}
              className="group flex w-full items-center gap-4 text-left">
              <span className="w-24 shrink-0 text-sm font-semibold text-slate-600">{m.label}</span>
              <div className="relative h-9 flex-1 overflow-hidden rounded-xl bg-slate-50">
                <motion.div className={cn("flex h-full items-center justify-end rounded-xl pr-3", m.bar)}
                  initial={{ width: 0 }} animate={{ width: `${Math.max((count / max) * 100, 8)}%` }}
                  transition={{ duration: 0.7, delay: i * 0.08 }}>
                  <span className="font-display text-sm font-bold text-white">{count}</span>
                </motion.div>
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function Sources({ sources = [] }) {
  return (
    <Card className="h-full">
      <h2 className="font-display text-lg font-bold text-slate-900">Lead Sources</h2>
      <div className="mt-5 space-y-4">
        {sources.slice(0, 6).map((s, i) => {
          const m = SOURCE_META[s.source] || SOURCE_META.manual; const Icon = m.icon;
          return (
            <div key={s.source}>
              <div className="mb-1.5 flex items-center justify-between text-sm">
                <span className="inline-flex items-center gap-2 font-medium text-slate-700"><Icon className={cn("h-4 w-4", m.color)} /> {m.label}</span>
                <span className="font-bold text-slate-900">{s.pct}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                <motion.div className="h-full rounded-full bg-primary" initial={{ width: 0 }}
                  animate={{ width: `${s.pct}%` }} transition={{ duration: 0.7, delay: i * 0.06 }} />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

const ACT_ICON = {
  lead_created: UserPlus, converted: PartyPopper, call: Phone, whatsapp: MessageCircle,
  followup_created: CalendarClock, followup_completed: CheckCircle2, status_change: Repeat,
};
const ACT_COLOR = {
  lead_created: "#0EA5E9", converted: "#10B981", call: "#6366F1", whatsapp: "#10B981",
  followup_created: "#F59E0B", followup_completed: "#10B981", status_change: "#8B5CF6",
};

function ActivityStream({ activities, loading }) {
  return (
    <Card>
      <h2 className="font-display text-lg font-bold text-slate-900">Live Sales Activity</h2>
      {loading ? <div className="mt-4"><ListSkeleton count={4} /></div> : (
        <div className="mt-5 space-y-1">
          {activities.map((a, i) => {
            const Icon = ACT_ICON[a.type] || Sparkles; const color = ACT_COLOR[a.type] || "#6366F1";
            return (
              <motion.div key={a.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                className="flex items-start gap-3 rounded-xl px-2 py-2.5 transition hover:bg-slate-50">
                <div className="relative">
                  <Avatar name={a.user_name || "System"} size={36} />
                  <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full ring-2 ring-white"
                    style={{ background: color }}><Icon className="h-3 w-3 text-white" /></span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-700">
                    <b className="font-semibold text-slate-900">{a.user_name}</b> {a.text}
                    {a.lead_name && <span className="text-slate-500"> · {a.lead_name}</span>}
                  </p>
                  <p className="text-xs text-slate-400">{timeAgo(a.created_at)}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function TodayFollowUps({ followups }) {
  const navigate = useNavigate();
  return (
    <Card className="h-full">
      <h2 className="font-display text-lg font-bold text-slate-900">Today's Follow-ups</h2>
      {followups.length === 0 ? (
        <div className="mt-6 rounded-xl bg-emerald-50 px-4 py-8 text-center">
          <p className="font-display text-lg font-bold text-emerald-700">You're all caught up 🎉</p>
          <p className="mt-1 text-sm text-emerald-600/80">No follow-ups due today.</p>
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {followups.slice(0, 6).map((f) => (
            <button key={f.id} onClick={() => navigate(`/leads/${f.lead_id}`)}
              data-testid={`today-followup-${f.id}`}
              className={cn("flex w-full items-center gap-3 rounded-xl border p-3 text-left transition hover:shadow-sm",
                f.overdue ? "border-red-200 bg-red-50" : "border-slate-200 bg-white")}>
              <div className={cn("flex flex-col items-center rounded-lg px-2.5 py-1.5 text-white",
                f.overdue ? "bg-red-500" : "bg-primary")}>
                <span className="font-display text-sm font-bold leading-none">{formatClock(f.due_at).split(" ")[0]}</span>
                <span className="text-[9px] uppercase">{formatClock(f.due_at).split(" ")[1]}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold text-slate-900">{f.lead_name}</div>
                <div className="truncate text-xs text-slate-500">{f.reason}</div>
              </div>
              {f.overdue && <span className="inline-flex items-center gap-1 text-xs font-bold text-red-600"><Clock className="h-3 w-3" /> Overdue</span>}
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}
