import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ArrowLeft, Phone, MessageCircle, Mail, MapPin, Trophy, CalendarClock, PhoneCall,
  Play, UserPlus, PartyPopper, Repeat, CheckCircle2, Check, CheckCheck,
} from "lucide-react";
import api from "@/lib/api";
import { Avatar } from "@/components/InitialsAvatar";
import { SourceBadge } from "@/components/Badges";
import { CardSkeleton } from "@/components/Skeletons";
import { fullINR, formatDay, formatClock } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

const ACT_ICON = { lead_created: UserPlus, converted: PartyPopper, call: Phone, whatsapp: MessageCircle, followup_created: CalendarClock, followup_completed: CheckCircle2, status_change: Repeat, edit: Repeat };

export default function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: c, isLoading } = useQuery({ queryKey: ["customer", id], queryFn: async () => (await api.get(`/customers/${id}`)).data });

  if (isLoading || !c) return <div className="mx-auto max-w-5xl"><CardSkeleton /></div>;

  const upcoming = (c.followups || []).filter((f) => f.status === "pending");
  const completed = (c.followups || []).filter((f) => f.status === "completed");

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <button onClick={() => navigate("/customers")} data-testid="customer-back-btn"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" /> Customers
      </button>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl border border-emerald-100 bg-white p-6 sm:p-8" data-testid="customer-detail-header">
        <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-emerald-100/60 blur-2xl" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
          <Avatar name={c.name} size={92} />
          <div className="flex-1">
            <div className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-600"><Trophy className="h-3 w-3" /> CUSTOMER</div>
            <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-slate-900">{c.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-500">
              <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {c.phone}</span>
              {c.email && <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> {c.email}</span>}
              {c.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {c.location}</span>}
            </div>
          </div>
          <div className="rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-4 text-center text-white">
            <div className="font-display text-2xl font-extrabold">{fullINR(c.value)}</div>
            <div className="text-xs text-white/80">deal value</div>
          </div>
        </div>
        <div className="relative mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Info label="Source" value={<SourceBadge source={c.source} />} />
          <Info label="Converted" value={formatDay(c.converted_at)} />
          <Info label="Converted by" value={c.converted_by || "—"} />
          <Info label="Owner" value={c.assigned_name || c.converted_by || "—"} />
        </div>
      </motion.div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Metric label="Calls" value={(c.calls || []).length} icon={PhoneCall} color="#6366F1" />
        <Metric label="Messages" value={(c.messages || []).length} icon={MessageCircle} color="#10B981" />
        <Metric label="Upcoming" value={upcoming.length} icon={CalendarClock} color="#F59E0B" />
        <Metric label="Completed" value={completed.length} icon={CheckCircle2} color="#0EA5E9" />
      </div>

      <Tabs defaultValue="timeline">
        <TabsList className="rounded-xl bg-slate-100 p-1">
          <TabsTrigger value="timeline" data-testid="cust-tab-timeline">Timeline</TabsTrigger>
          <TabsTrigger value="calls" data-testid="cust-tab-calls">Calls</TabsTrigger>
          <TabsTrigger value="whatsapp" data-testid="cust-tab-whatsapp">WhatsApp</TabsTrigger>
          <TabsTrigger value="followups" data-testid="cust-tab-followups">Follow-ups</TabsTrigger>
        </TabsList>

        <TabsContent value="timeline">
          <Panel>
            {(c.timeline || []).length === 0 ? <Empty text="No activity recorded." /> : (
              <div className="relative space-y-6 pl-8">
                <span className="absolute left-[11px] top-1 h-[calc(100%-1rem)] w-0.5 bg-slate-100" />
                {c.timeline.map((a) => {
                  const Icon = ACT_ICON[a.type] || Repeat;
                  return (
                    <div key={a.id} className="relative">
                      <span className="absolute -left-8 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-primary ring-4 ring-white"><Icon className="h-3.5 w-3.5" /></span>
                      <div className="text-xs text-slate-400">{formatDay(a.created_at)} · {formatClock(a.created_at)}</div>
                      <div className="mt-0.5 text-sm text-slate-800"><b>{a.user_name}</b> {a.text}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="calls">
          <Panel className="space-y-2 p-4">
            {(c.calls || []).length === 0 ? <Empty text="No calls." /> : c.calls.map((call) => (
              <div key={call.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-slate-50">
                <div className={cn("flex h-9 w-9 items-center justify-center rounded-full", call.status === "completed" || call.status === "answered" ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500")}><PhoneCall className="h-4 w-4" /></div>
                <div className="flex-1"><div className="text-sm font-medium capitalize text-slate-900">{call.direction} · {call.status}</div>
                  <div className="text-xs text-slate-400">{formatDay(call.created_at)} {formatClock(call.created_at)}</div></div>
                {call.recording_url && <a href={call.recording_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-600"><Play className="h-3 w-3" /> Recording</a>}
                {call.duration_seconds > 0 && <span className="font-display font-bold text-slate-700">{Math.floor(call.duration_seconds / 60)}m {call.duration_seconds % 60}s</span>}
              </div>
            ))}
          </Panel>
        </TabsContent>

        <TabsContent value="whatsapp">
          <Panel className="space-y-2 bg-[#f7f9f8] p-4">
            {(c.messages || []).length === 0 ? <Empty text="No messages." /> : c.messages.map((m) => (
              <div key={m.id} className={cn("flex", m.direction === "outgoing" ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[75%] rounded-2xl px-3.5 py-2 text-sm shadow-sm", m.direction === "outgoing" ? "rounded-br-sm bg-emerald-500 text-white" : "rounded-bl-sm bg-white text-slate-800")}>
                  {m.text}
                  <div className={cn("mt-0.5 flex items-center justify-end gap-1 text-[10px]", m.direction === "outgoing" ? "text-white/70" : "text-slate-400")}>
                    {formatClock(m.created_at)}
                    {m.direction === "outgoing" && (m.status === "read" ? <CheckCheck className="h-3 w-3" /> : m.status === "delivered" ? <CheckCheck className="h-3 w-3" /> : <Check className="h-3 w-3" />)}
                  </div>
                </div>
              </div>
            ))}
          </Panel>
        </TabsContent>

        <TabsContent value="followups">
          <Panel className="space-y-3">
            {(c.followups || []).length === 0 ? <Empty text="No follow-ups." /> : c.followups.map((f) => (
              <div key={f.id} className={cn("flex items-center gap-4 rounded-xl border p-4", f.status === "completed" ? "border-emerald-100 bg-emerald-50/40" : "border-slate-200")}>
                <CalendarClock className={cn("h-5 w-5", f.status === "completed" ? "text-emerald-500" : "text-amber-500")} />
                <div className="flex-1"><div className="font-semibold text-slate-900">{f.reason}</div>
                  <div className="text-xs text-slate-500">{formatDay(f.due_at)} · {formatClock(f.due_at)}</div></div>
                <span className={cn("text-xs font-bold capitalize", f.status === "completed" ? "text-emerald-600" : "text-amber-600")}>{f.status}</span>
              </div>
            ))}
          </Panel>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Info({ label, value }) {
  return <div className="rounded-xl bg-slate-50 px-3 py-2.5"><div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div><div className="mt-0.5 text-sm font-semibold text-slate-900">{value}</div></div>;
}
function Metric({ label, value, icon: Icon, color }) {
  return (
    <div className="rounded-2xl border border-slate-200/60 bg-white p-4">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `${color}18`, color }}><Icon className="h-4 w-4" /></div>
      <div className="mt-2 font-display text-2xl font-extrabold text-slate-900">{value}</div>
      <div className="text-xs text-slate-400">{label}</div>
    </div>
  );
}
function Panel({ children, className = "" }) {
  return <div className={cn("mt-4 rounded-2xl border border-slate-200/60 bg-white p-6", className)}>{children}</div>;
}
function Empty({ text }) { return <p className="py-10 text-center text-sm text-slate-400">{text}</p>; }
