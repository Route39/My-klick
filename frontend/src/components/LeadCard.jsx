import React from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Phone, MessageCircle, Clock, Trash, Pencil, Plus } from "lucide-react";
import { Avatar } from "@/components/InitialsAvatar";
import { StatusBadge, PriorityBadge, SourceBadge } from "@/components/Badges";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatINR, formatClock, formatDay } from "@/lib/constants";
import { useCall } from "@/context/CallContext";
import { toast } from "sonner";
import api from "@/lib/api";
import { cn } from "@/lib/utils";

export function LeadCard({ lead, index = 0, draggable = false, onDragStart }) {
  const navigate = useNavigate();
  const { startCall } = useCall();
  const qc = useQueryClient();
  const isFollowUp = lead.status === "follow_up";

  // Always fetch all follow-ups for this lead so they persist on refresh and across all statuses
  const { data: followUps = [] } = useQuery({
    queryKey: ["lead-followups", lead.id],
    queryFn: async () => (await api.get(`/leads/${lead.id}/followups`)).data,
    staleTime: 60000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  // Pending only, sorted oldest → newest
  const pendingFollowUps = followUps
    .filter((f) => f.status === "pending")
    .sort((a, b) => new Date(a.due_at) - new Date(b.due_at));

  const deleteLead = useMutation({
    mutationFn: async (id) => await api.delete(`/leads/${id}`),
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success("Lead permanently deleted");
    },
    onError: (e) => toast.error(e.response?.data?.detail || "Could not delete lead."),
  });

  const scheduleFollowUp = useMutation({
    mutationFn: async (date) => {
      // Use selected date but with current time of day (not fixed 10:00)
      const now = new Date();
      const d = new Date(date);
      d.setHours(now.getHours(), now.getMinutes(), 0, 0);
      return (await api.post(`/leads/${lead.id}/followups`, {
        reason: "Quick Follow-up",
        due_at: d.toISOString(),
      })).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead-followups", lead.id] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Follow-up scheduled ✓");
    },
    onError: (e) => toast.error(e.response?.data?.detail || "Could not schedule follow-up."),
  });

  const deleteFollowUp = useMutation({
    mutationFn: async (fuId) => (await api.delete(`/followups/${fuId}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead-followups", lead.id] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Follow-up removed");
    },
    onError: (e) => toast.error(e.response?.data?.detail || "Could not delete follow-up."),
  });

  const whatsapp = async (e) => {
    e.stopPropagation();
    await api.post(`/leads/${lead.id}/whatsapp`, { text: "Hi, following up on your enquiry." });
    toast.success("WhatsApp sent ✓", { description: lead.name });
    navigate(lead.segment === "driver" ? `/drivers/leads/${lead.id}?tab=whatsapp` : `/leads/${lead.id}?tab=whatsapp`);
  };
  const call = (e) => { e.stopPropagation(); startCall(lead); };

  // Reusable calendar popover for adding the next follow-up
  function AddFollowUpPopover({ triggerClassName }) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-amber-100 hover:text-amber-600 active:scale-95 transition",
              triggerClassName
            )}
          >
            <Plus className="h-3 w-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 z-[100]" onClick={(e) => e.stopPropagation()}>
          <CalendarComponent
            mode="single"
            disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
            onSelect={(date) => {
              if (date) scheduleFollowUp.mutate(date);
            }}
            initialFocus
          />
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <motion.div
      layout
      draggable={draggable}
      onDragStart={onDragStart}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.3) }}
      data-testid={`lead-card-${lead.id}`}
      onClick={() => navigate(lead.segment === "driver" ? `/drivers/leads/${lead.id}` : `/leads/${lead.id}`)}
      className={cn(
        "group cursor-pointer rounded-2xl border border-slate-200/70 bg-white p-4 card-lift",
        lead.status === "lost" && "opacity-70", draggable && "active:cursor-grabbing"
      )}
    >
      {/* Status + Priority */}
      <div className="flex items-center justify-between">
        <StatusBadge status={lead.status} />
        <PriorityBadge priority={lead.priority} />
      </div>

      {/* Avatar + Name */}
      <div className="mt-3 flex items-center gap-3">
        <Avatar name={lead.name} size={42} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-display font-semibold text-slate-900">{lead.name}</div>
          <div className="truncate text-xs text-slate-400">{lead.phone}</div>
        </div>
      </div>

      {/* Source + Value + Extra info */}
      <div className="mt-3 flex flex-col gap-2 text-xs">
        <div className="flex items-center justify-between">
          <SourceBadge source={lead.source} />
          {lead.value > 0 && <span className="font-display font-bold text-slate-900">{formatINR(lead.value)}</span>}
        </div>
        {lead.segment === "driver" ? (
          (lead.location || lead.rc) && (
            <div className="flex flex-col gap-1 rounded-lg bg-slate-50 p-2 text-slate-500">
              {lead.location && <div><span className="font-medium text-slate-700">Location:</span> {lead.location}</div>}
              {lead.rc && <div><span className="font-medium text-slate-700">RC Available:</span> {lead.rc.toUpperCase()}</div>}
            </div>
          )
        ) : (
          (lead.no_of_vehicles || lead.remarks) && (
            <div className="flex flex-col gap-1 rounded-lg bg-slate-50 p-2 text-slate-500">
              {lead.no_of_vehicles && <div><span className="font-medium text-slate-700">Vehicles:</span> {lead.no_of_vehicles}</div>}
              {lead.remarks && <div className="line-clamp-2"><span className="font-medium text-slate-700">Remarks:</span> {lead.remarks}</div>}
            </div>
          )
        )}
      </div>

      {/* Assignee row */}
      <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
        <Avatar name={lead.assigned_name || "?"} size={18} ring={false} />
        <span className="truncate">{lead.assigned_name || "Unassigned"}</span>
      </div>

      {/* ── Follow-up date timeline rows — shown on ALL statuses ── */}
      {pendingFollowUps.length > 0 && (
        <div className="mt-2 flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Follow-up Dates</span>
          {pendingFollowUps.map((fu, idx) => {
            const isLast = idx === pendingFollowUps.length - 1;
            const isFirst = idx === 0;
            return (
              <div key={fu.id} className="flex items-center gap-1.5 text-xs group/fu">
                {/* Dot */}
                <span className={cn(
                  "h-1.5 w-1.5 shrink-0 rounded-full",
                  isFirst ? "bg-amber-500" : "bg-slate-300"
                )} />
                <span className={cn(
                  "inline-flex items-center gap-1 font-medium",
                  isFirst ? "text-amber-600" : "text-slate-400"
                )}>
                  <Clock className="h-3 w-3" />
                  {formatDay(fu.due_at)} {formatClock(fu.due_at)}
                </span>
                {/* Controls only when in follow_up status */}
                {isFollowUp && (
                  <div className="ml-auto flex items-center gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteFollowUp.mutate(fu.id); }}
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-red-400 transition hover:bg-red-50 hover:text-red-600 active:scale-95"
                      title="Remove this follow-up"
                    >
                      ×
                    </button>
                    {isLast && <AddFollowUpPopover />}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* If status is follow_up but no dates yet — prompt to schedule */}
      {isFollowUp && pendingFollowUps.length === 0 && (
        <div className="mt-2 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          <AddFollowUpPopover />
          <span className="text-xs font-medium text-amber-600">Schedule follow-up</span>
        </div>
      )}

      {/* Action buttons */}
      <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3">
        <button data-testid={`quick-call-${lead.id}`} onClick={call}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-indigo-50 py-2 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-100 active:scale-95">
          <Phone className="h-3.5 w-3.5" /> Call
        </button>
        <button data-testid={`quick-whatsapp-${lead.id}`} onClick={whatsapp}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-50 py-2 text-xs font-semibold text-emerald-600 transition hover:bg-emerald-100 active:scale-95">
          <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
        </button>
        <button data-testid={`quick-edit-${lead.id}`} onClick={(e) => { e.stopPropagation(); navigate(lead.segment === "driver" ? `/drivers/leads/${lead.id}?edit=true` : `/leads/${lead.id}?edit=true`); }}
          className="flex items-center justify-center rounded-lg bg-slate-100 p-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-200 active:scale-95">
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button data-testid={`quick-delete-${lead.id}`} onClick={(e) => { e.stopPropagation(); if(window.confirm("Are you sure you want to permanently delete this lead?")) deleteLead.mutate(lead.id); }}
          className="flex items-center justify-center rounded-lg bg-red-50 p-2 text-xs font-semibold text-red-600 transition hover:bg-red-100 active:scale-95">
          <Trash className="h-3.5 w-3.5" />
        </button>
      </div>
    </motion.div>
  );
}
