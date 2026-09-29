import React, { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import { LayoutGrid, List as ListIcon, KanbanSquare, Rocket, Filter, Phone, MessageCircle, Clock, Trash, Pencil } from "lucide-react";
import { motion } from "framer-motion";
import api from "@/lib/api";
import { LeadCard } from "@/components/LeadCard";
import { Avatar } from "@/components/InitialsAvatar";
import { StatusBadge, PriorityBadge, SourceBadge } from "@/components/Badges";
import { EmptyState } from "@/components/EmptyState";
import { ListSkeleton } from "@/components/Skeletons";
import { STAGES, STATUS_META, formatINR, formatClock, formatDay } from "@/lib/constants";
import { useCall } from "@/context/CallContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const VIEWS = [
  { id: "list", icon: ListIcon, label: "List" },
  { id: "cards", icon: LayoutGrid, label: "Cards" },
  { id: "pipeline", icon: KanbanSquare, label: "Pipeline" },
];

export default function DriverLeads({ segment = "driver" }) {
  const [params, setParams] = useSearchParams();
  const { openAdd } = useOutletContext();
  const [view, setView] = useState("list");
  const status = params.get("status") || "";

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["leads", status, "driver"],
    queryFn: async () => {
      const params = status ? { status, segment: "driver" } : { exclude_status: "follow_up", segment: "driver" };
      return (await api.get("/leads", { params })).data;
    },
    refetchInterval: 15000,
    placeholderData: (prev) => prev,
  });

  const setStatus = (s) => {
    if (s === "all") params.delete("status"); else params.set("status", s);
    setParams(params);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-slate-900">Leads</h1>
          <p className="mt-1 text-slate-500">{leads.length} leads {status && `· ${STATUS_META[status]?.label}`}</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={status || "all"} onValueChange={setStatus}>
            <SelectTrigger data-testid="leads-status-filter" className="w-40 rounded-xl">
              <Filter className="mr-1 h-3.5 w-3.5 text-slate-400" /><SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STAGES.map((s) => <SelectItem key={s} value={s}>{STATUS_META[s].label}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex rounded-xl border border-slate-200 bg-white p-1">
            {VIEWS.map((v) => (
              <button key={v.id} data-testid={`view-toggle-${v.id}`} onClick={() => setView(v.id)}
                className={cn("flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition",
                  view === v.id ? "bg-accent text-primary" : "text-slate-400 hover:text-slate-700")}>
                <v.icon className="h-4 w-4" /> <span className="hidden sm:inline">{v.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLoading ? <ListSkeleton count={6} /> : leads.length === 0 ? (
        <EmptyState icon={Rocket} title="Your pipeline is waiting 🚀"
          subtitle="Add your first lead to get started with MyKlick."
          testid="leads-empty"
          action={<button onClick={openAdd} className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary/25 transition hover:bg-indigo-700">+ Add Lead</button>} />
      ) : view === "list" ? (
        <LeadList leads={leads} />
      ) : view === "cards" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {leads.map((l, i) => <LeadCard key={l.id} lead={l} index={i} />)}
        </div>
      ) : (
        <MiniPipeline leads={leads} />
      )}
    </div>
  );
}

function LeadList({ leads }) {
  const navigate = useNavigate();
  const { startCall } = useCall();
  const qc = useQueryClient();
  
  const deleteLead = useMutation({
    mutationFn: async (id) => await api.delete(`/leads/${id}`),
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success("Lead permanently deleted");
    },
    onError: (e) => toast.error(e.response?.data?.detail || "Could not delete lead."),
  });

  return (
    <div className="space-y-2.5">
      {leads.map((l, i) => (
        <motion.div key={l.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.02, 0.3) }}
          data-testid={`lead-row-${l.id}`} onClick={() => navigate(`/drivers/leads/${l.id}`)}
          className="flex cursor-pointer items-center gap-4 rounded-2xl border border-slate-200/70 bg-white p-3.5 transition hover:border-primary/30 hover:shadow-md sm:p-4">
          <Avatar name={l.name} size={46} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-display font-semibold text-slate-900">{l.name}</span>
              <PriorityBadge priority={l.priority} />
            </div>
            <div className="mt-0.5 flex items-center gap-3 text-xs text-slate-400">
              <span>{l.phone}</span><span className="hidden sm:block"><SourceBadge source={l.source} /></span>
            </div>
          </div>
          <div className="hidden w-32 md:block"><StatusBadge status={l.status} /></div>
          <div className="hidden items-center gap-1.5 text-xs text-slate-500 lg:flex w-32">
            <Avatar name={l.assigned_name || "?"} size={22} ring={false} /> <span className="truncate">{l.assigned_name || "—"}</span>
          </div>
          <div className="hidden w-28 text-right font-display font-bold text-slate-900 sm:block">{l.value ? formatINR(l.value) : "—"}</div>
          {l.next_followup && (
            <div className="hidden w-28 items-center gap-1 text-xs font-medium text-amber-600 xl:flex">
              <Clock className="h-3 w-3" /> {formatDay(l.next_followup)}
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <button data-testid={`row-call-${l.id}`} onClick={(e) => { e.stopPropagation(); startCall(l); }}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 transition hover:bg-indigo-100 active:scale-90"><Phone className="h-4 w-4" /></button>
            <button data-testid={`row-whatsapp-${l.id}`} onClick={async (e) => { e.stopPropagation(); await api.post(`/leads/${l.id}/whatsapp`, { text: "Hi, following up on your enquiry." }); toast.success("WhatsApp sent ✓"); }}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 transition hover:bg-emerald-100 active:scale-90"><MessageCircle className="h-4 w-4" /></button>
            <button data-testid={`row-edit-${l.id}`} onClick={(e) => { e.stopPropagation(); navigate(`/drivers/leads/${l.id}?edit=true`); }}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition hover:bg-slate-200 active:scale-90"><Pencil className="h-4 w-4" /></button>
            <button data-testid={`row-delete-${l.id}`} onClick={(e) => { e.stopPropagation(); if(window.confirm("Are you sure you want to permanently delete this lead?")) deleteLead.mutate(l.id); }}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-50 text-red-600 transition hover:bg-red-100 active:scale-90"><Trash className="h-4 w-4" /></button>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

function MiniPipeline({ leads }) {
  const navigate = useNavigate();
  return (
    <div className="flex gap-4 overflow-x-auto pb-4 thin-scroll">
      {STAGES.map((s) => {
        const items = leads.filter((l) => l.status === s);
        return (
          <div key={s} className="w-72 shrink-0">
            <div className="mb-3 flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_META[s].dot }} />
              <span className="font-display font-bold text-slate-900">{STATUS_META[s].label}</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-500">{items.length}</span>
            </div>
            <div className="space-y-3">
              {items.map((l, i) => <LeadCard key={l.id} lead={l} index={i} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
