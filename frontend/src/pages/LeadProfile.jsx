import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import confetti from "canvas-confetti";
import { toast } from "sonner";
import {
  Phone, MessageCircle, CalendarClock, Pencil, ArrowLeft, Send, CheckCircle2, Trash,
  Repeat, UserPlus, PartyPopper, PhoneCall, Check, CheckCheck, Trophy, Play,
} from "lucide-react";
import api from "@/lib/api";
import { useCall } from "@/context/CallContext";
import { Avatar } from "@/components/InitialsAvatar";
import { StatusBadge, PriorityBadge, SourceBadge } from "@/components/Badges";
import { CardSkeleton } from "@/components/Skeletons";
import { STAGES, STATUS_META, fullINR, timeAgo, formatClock, formatDay } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FollowUpDialog } from "@/components/FollowUpDialog";
import { EditLeadDialog } from "@/components/EditLeadDialog";

export default function LeadProfile() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { startCall } = useCall();
  const [fuOpen, setFuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const { data: lead, isLoading, isError, error } = useQuery({
    queryKey: ["lead", id],
    queryFn: async () => (await api.get(`/leads/${id}`)).data,
    retry: (count, err) => {
      const s = err?.response?.status;
      if (s >= 400 && s < 500) return false;
      return count < 2;
    },
  });

  const stage = useMutation({
    mutationFn: async (status) => (await api.patch(`/leads/${id}/stage`, { status })).data,
    onSuccess: (d, status) => {
      qc.invalidateQueries();
      if (status === "converted") { fire(); toast.success("Lead converted 🎉", { description: lead?.name }); }
      else toast.success(`Status → ${STATUS_META[status].label} ✓`);
    },
  });

  const deleteLead = useMutation({
    mutationFn: async () => await api.delete(`/leads/${id}`),
    onSuccess: () => {
      toast.success("Lead permanently deleted");
      navigate("/leads");
    }
  });

  const handleDeleteLead = () => {
    if (window.confirm("Are you sure you want to permanently delete this lead and all its history?")) {
      deleteLead.mutate();
    }
  };

  if (isError) {
    const s = error?.response?.status;
    return (
      <div className="mx-auto max-w-lg pt-16 text-center" data-testid="lead-access-error">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-500">
          <ArrowLeft className="h-6 w-6" />
        </div>
        <h2 className="mt-4 font-display text-2xl font-bold text-slate-900">
          {s === 403 ? "No access to this lead" : "Lead not found"}
        </h2>
        <p className="mt-1.5 text-slate-500">
          {s === 403 ? "This lead is assigned to another team member." : "It may have been removed."}
        </p>
        <button onClick={() => navigate("/leads")} className="mt-5 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary/25 transition hover:bg-indigo-700">
          Back to Leads
        </button>
      </div>
    );
  }

  if (isLoading || !lead) return <div className="mx-auto max-w-5xl"><CardSkeleton /></div>;

  const converted = lead.status === "converted";

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-20 lg:pb-0">
      <button onClick={() => navigate(-1)} data-testid="back-btn"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl border border-slate-200/60 bg-white p-6 sm:p-8">
        <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-accent/60 blur-2xl" />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center">
          <Avatar name={lead.name} size={92} />
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-3xl font-extrabold tracking-tight text-slate-900">{lead.name}</h1>
              <PriorityBadge priority={lead.priority} />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <StatusBadge status={lead.status} />
              <SourceBadge source={lead.source} />
              <span className="text-sm text-slate-400">{lead.phone}</span>
            </div>
            {lead.value > 0 && (
              <div className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-1.5">
                <Trophy className="h-4 w-4 text-emerald-600" />
                <span className="font-display text-lg font-bold text-emerald-700">{fullINR(lead.value)}</span>
                <span className="text-xs text-emerald-600/70">potential value</span>
              </div>
            )}
          </div>
          <div className="w-full sm:w-56">
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-400">Change stage</label>
            <Select value={lead.status} onValueChange={(v) => stage.mutate(v)}>
              <SelectTrigger data-testid="stage-select" className="rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>{STAGES.map((s) => <SelectItem key={s} value={s}>{STATUS_META[s].label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>

        {converted && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="relative mt-5 flex items-center gap-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 p-4 text-white">
            <PartyPopper className="h-6 w-6" />
            <div><div className="font-display font-bold">Lead Converted 🎉</div>
              <div className="text-sm text-white/80">Conversion value {fullINR(lead.value)}</div></div>
            <button onClick={() => navigate("/customers")} className="ml-auto rounded-lg bg-white/20 px-3 py-1.5 text-sm font-semibold backdrop-blur transition hover:bg-white/30">View Customer</button>
          </motion.div>
        )}

        {/* Quick actions */}
        <div className="relative mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <ActionBtn testid="profile-call" icon={Phone} label="Call" color="indigo" onClick={() => startCall(lead)} />
          <ActionBtn testid="profile-whatsapp" icon={MessageCircle} label="WhatsApp" color="emerald"
            onClick={() => document.getElementById("wa-tab-trigger")?.click()} />
          <ActionBtn testid="profile-followup" icon={CalendarClock} label="Follow-up" color="amber" onClick={() => setFuOpen(true)} />
          {!converted && <ActionBtn testid="profile-convert" icon={Trophy} label="Convert" color="green" onClick={() => stage.mutate("converted")} />}
          <ActionBtn testid="profile-edit" icon={Pencil} label="Edit" color="slate" onClick={() => setEditOpen(true)} />
          <ActionBtn testid="profile-delete" icon={Trash} label="Delete" color="red" onClick={handleDeleteLead} />
        </div>
      </motion.div>

      {/* Tabs */}
      <Tabs defaultValue={params.get("tab") || "overview"}>
        <TabsList className="rounded-xl bg-slate-100 p-1">
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="timeline" data-testid="tab-timeline">Timeline</TabsTrigger>
          <TabsTrigger value="calls" data-testid="tab-calls">Calls</TabsTrigger>
          <TabsTrigger value="whatsapp" id="wa-tab-trigger" data-testid="tab-whatsapp">WhatsApp</TabsTrigger>
          <TabsTrigger value="followups" data-testid="tab-followups">Follow-ups</TabsTrigger>
        </TabsList>
        <TabsContent value="overview"><Overview lead={lead} /></TabsContent>
        <TabsContent value="timeline"><Timeline id={id} /></TabsContent>
        <TabsContent value="calls"><Calls id={id} /></TabsContent>
        <TabsContent value="whatsapp"><WhatsApp id={id} lead={lead} /></TabsContent>
        <TabsContent value="followups"><FollowupsTab id={id} onAdd={() => setFuOpen(true)} /></TabsContent>
      </Tabs>

      <FollowUpDialog open={fuOpen} onOpenChange={setFuOpen} leadId={id} />
      <EditLeadDialog open={editOpen} onOpenChange={setEditOpen} lead={lead} />
    </div>
  );
}

function ActionBtn({ icon: Icon, label, color, onClick, testid }) {
  const map = {
    indigo: "bg-indigo-50 text-indigo-600 hover:bg-indigo-100",
    emerald: "bg-emerald-50 text-emerald-600 hover:bg-emerald-100",
    amber: "bg-amber-50 text-amber-600 hover:bg-amber-100",
    green: "bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:opacity-90",
    slate: "bg-slate-100 text-slate-600 hover:bg-slate-200",
  };
  return (
    <button data-testid={testid} onClick={onClick}
      className={cn("flex flex-col items-center gap-1.5 rounded-2xl py-4 text-sm font-semibold transition active:scale-95", map[color])}>
      <Icon className="h-5 w-5" /> {label}
    </button>
  );
}

function Panel({ children, className = "" }) {
  return <div className={cn("mt-4 rounded-2xl border border-slate-200/60 bg-white p-6", className)}>{children}</div>;
}

function Overview({ lead }) {
  const rows = [
    ["Phone", lead.phone], ["WhatsApp", lead.whatsapp], ["Company", lead.company || "—"],
    ["Assigned to", lead.assigned_name || "Unassigned"], ["Created", formatDay(lead.created_at)],
  ];
  return (
    <Panel>
      <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between border-b border-slate-100 pb-3">
            <span className="text-sm text-slate-400">{k}</span>
            <span className="font-medium text-slate-900">{v}</span>
          </div>
        ))}
      </div>
      {lead.notes && <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">{lead.notes}</p>}
    </Panel>
  );
}

const ACT_ICON = { lead_created: UserPlus, converted: PartyPopper, call: Phone, whatsapp: MessageCircle, followup_created: CalendarClock, followup_completed: CheckCircle2, status_change: Repeat };

function Timeline({ id }) {
  const { data = [] } = useQuery({ queryKey: ["timeline", id], queryFn: async () => (await api.get(`/leads/${id}/timeline`)).data });
  if (!data.length) return <Panel><p className="text-center text-sm text-slate-400">No activity yet.</p></Panel>;
  return (
    <Panel>
      <div className="relative space-y-6 pl-8">
        <span className="absolute left-[11px] top-1 h-[calc(100%-1rem)] w-0.5 bg-slate-100" />
        {data.map((a, i) => {
          const Icon = ACT_ICON[a.type] || Repeat;
          return (
            <motion.div key={a.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} className="relative">
              <span className="absolute -left-8 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-primary ring-4 ring-white"><Icon className="h-3.5 w-3.5" /></span>
              <div className="text-xs text-slate-400">{formatDay(a.created_at)} · {formatClock(a.created_at)}</div>
              <div className="mt-0.5 text-sm text-slate-800"><b>{a.user_name}</b> {a.text}
                {a.meta?.duration && <span className="text-slate-500"> · {a.meta.duration}</span>}
                {a.meta?.text && <span className="text-slate-500"> · "{a.meta.text}"</span>}</div>
            </motion.div>
          );
        })}
      </div>
    </Panel>
  );
}

function Calls({ id }) {
  const { data = [] } = useQuery({ queryKey: ["calls", id], queryFn: async () => (await api.get(`/leads/${id}/calls`)).data });
  if (!data.length) return <Panel><p className="text-center text-sm text-slate-400">No calls logged yet.</p></Panel>;
  return (
    <Panel className="space-y-2 p-4">
      {data.map((c) => (
        <div key={c.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-slate-50">
          <div className={cn("flex h-9 w-9 items-center justify-center rounded-full", c.status === "connected" ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500")}><PhoneCall className="h-4 w-4" /></div>
          <div className="flex-1"><div className="text-sm font-medium text-slate-900 capitalize">{c.direction} call · {c.status}</div>
            <div className="text-xs text-slate-400">{formatDay(c.created_at)} {formatClock(c.created_at)}</div></div>
          {c.recording_url && <a data-testid={`call-recording-${c.id}`} href={c.recording_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-600"><Play className="h-3 w-3" /> Recording</a>}
          {c.duration_seconds > 0 && <span className="font-display font-bold text-slate-700">{Math.floor(c.duration_seconds / 60)}m {c.duration_seconds % 60}s</span>}
        </div>
      ))}
    </Panel>
  );
}

function WhatsApp({ id, lead }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const endRef = useRef();
  const { data = [] } = useQuery({ queryKey: ["messages", id], queryFn: async () => (await api.get(`/leads/${id}/messages`)).data });
  const send = useMutation({
    mutationFn: async (t) => (await api.post(`/leads/${id}/whatsapp`, { text: t })).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["messages", id] }); toast.success("WhatsApp sent ✓"); setText(""); },
    onError: () => toast.error("Message could not be sent. Please try again."),
  });
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [data.length]);

  return (
    <Panel className="p-0">
      <div className="flex items-center gap-3 border-b border-slate-100 bg-emerald-50/50 px-5 py-3">
        <Avatar name={lead.name} size={38} />
        <div><div className="font-semibold text-slate-900">{lead.name}</div><div className="text-xs text-emerald-600">via WhatsApp · {lead.whatsapp}</div></div>
      </div>
      <div className="h-80 space-y-2 overflow-y-auto bg-[#f7f9f8] p-4 thin-scroll">
        {data.length === 0 && <p className="pt-16 text-center text-sm text-slate-400">No messages yet. Say hello 👋</p>}
        {data.map((m) => (
          <motion.div key={m.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            className={cn("flex", m.direction === "outgoing" ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[75%] rounded-2xl px-3.5 py-2 text-sm shadow-sm",
              m.direction === "outgoing" ? "rounded-br-sm bg-emerald-500 text-white" : "rounded-bl-sm bg-white text-slate-800")}>
              {m.text}
              <div className={cn("mt-0.5 flex items-center justify-end gap-1 text-[10px]", m.direction === "outgoing" ? "text-white/70" : "text-slate-400")}>
                {formatClock(m.created_at)}
                {m.direction === "outgoing" && (m.status === "read" ? <CheckCheck className="h-3 w-3 text-sky-200" /> : m.status === "delivered" ? <CheckCheck className="h-3 w-3" /> : <Check className="h-3 w-3" />)}
              </div>
            </div>
          </motion.div>
        ))}
        <div ref={endRef} />
      </div>
      <form className="flex items-center gap-2 border-t border-slate-100 p-3"
        onSubmit={(e) => { e.preventDefault(); if (text.trim()) send.mutate(text.trim()); }}>
        <input data-testid="whatsapp-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message…"
          className="flex-1 rounded-full border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-emerald-400" />
        <button data-testid="whatsapp-send" type="submit" className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500 text-white transition hover:bg-emerald-600 active:scale-90"><Send className="h-4 w-4" /></button>
      </form>
    </Panel>
  );
}

function FollowupsTab({ id, onAdd }) {
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ["lead-followups", id], queryFn: async () => (await api.get(`/leads/${id}/followups`)).data });
  const complete = useMutation({
    mutationFn: async (fid) => (await api.patch(`/followups/${fid}/complete`)).data,
    onSuccess: () => { qc.invalidateQueries(); toast.success("Follow-up completed ✓"); },
  });
  return (
    <Panel className="space-y-3">
      <button data-testid="add-followup-tab-btn" onClick={onAdd} className="w-full rounded-xl border-2 border-dashed border-slate-200 py-3 text-sm font-semibold text-primary transition hover:border-primary/40 hover:bg-accent">+ Schedule follow-up</button>
      {data.map((f) => {
        const overdue = f.status === "pending" && new Date(f.due_at) < new Date();
        return (
          <div key={f.id} className={cn("flex items-center gap-4 rounded-xl border p-4", f.status === "completed" ? "border-emerald-100 bg-emerald-50/40 opacity-70" : overdue ? "border-red-200 bg-red-50" : "border-slate-200")}>
            <CalendarClock className={cn("h-5 w-5", overdue ? "text-red-500" : "text-amber-500")} />
            <div className="flex-1"><div className="font-semibold text-slate-900">{f.reason}</div>
              <div className="text-xs text-slate-500">{formatDay(f.due_at)} · {formatClock(f.due_at)} {overdue && <span className="font-bold text-red-600">· Overdue</span>}</div></div>
            {f.status === "pending" && <button onClick={() => complete.mutate(f.id)} className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-600">Complete</button>}
            {f.status === "completed" && <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
          </div>
        );
      })}
    </Panel>
  );
}

function fire() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  confetti({ particleCount: 120, spread: 75, origin: { y: 0.3 }, colors: ["#4F46E5", "#10B981", "#F59E0B", "#8B5CF6"] });
}
