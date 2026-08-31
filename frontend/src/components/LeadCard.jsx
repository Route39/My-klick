import React from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Phone, MessageCircle, Clock, Trash, Pencil } from "lucide-react";
import { Avatar } from "@/components/InitialsAvatar";
import { StatusBadge, PriorityBadge, SourceBadge } from "@/components/Badges";
import { formatINR, formatClock, formatDay } from "@/lib/constants";
import { useCall } from "@/context/CallContext";
import { toast } from "sonner";
import api from "@/lib/api";
import { cn } from "@/lib/utils";

export function LeadCard({ lead, index = 0, draggable = false, onDragStart }) {
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

  const whatsapp = async (e) => {
    e.stopPropagation();
    await api.post(`/leads/${lead.id}/whatsapp`, { text: "Hi, following up on your enquiry." });
    toast.success("WhatsApp sent ✓", { description: lead.name });
    navigate(`/leads/${lead.id}?tab=whatsapp`);
  };
  const call = (e) => { e.stopPropagation(); startCall(lead); };

  return (
    <motion.div
      layout
      draggable={draggable}
      onDragStart={onDragStart}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.3) }}
      data-testid={`lead-card-${lead.id}`}
      onClick={() => navigate(`/leads/${lead.id}`)}
      className={cn(
        "group cursor-pointer rounded-2xl border border-slate-200/70 bg-white p-4 card-lift",
        lead.status === "lost" && "opacity-70", draggable && "active:cursor-grabbing"
      )}
    >
      <div className="flex items-center justify-between">
        <StatusBadge status={lead.status} />
        <PriorityBadge priority={lead.priority} />
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Avatar name={lead.name} size={42} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-display font-semibold text-slate-900">{lead.name}</div>
          <div className="truncate text-xs text-slate-400">{lead.phone}</div>
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-2 text-xs">
        <div className="flex items-center justify-between">
          <SourceBadge source={lead.source} />
          {lead.value > 0 && <span className="font-display font-bold text-slate-900">{formatINR(lead.value)}</span>}
        </div>
        {(lead.no_of_vehicles || lead.remarks) && (
          <div className="flex flex-col gap-1 rounded-lg bg-slate-50 p-2 text-slate-500">
            {lead.no_of_vehicles && <div><span className="font-medium text-slate-700">Vehicles:</span> {lead.no_of_vehicles}</div>}
            {lead.remarks && <div className="line-clamp-2"><span className="font-medium text-slate-700">Remarks:</span> {lead.remarks}</div>}
          </div>
        )}
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
        <Avatar name={lead.assigned_name || "?"} size={18} ring={false} />
        <span className="truncate">{lead.assigned_name || "Unassigned"}</span>
        {lead.next_followup && (
          <span className="ml-auto inline-flex items-center gap-1 font-medium text-amber-600">
            <Clock className="h-3 w-3" /> {formatDay(lead.next_followup)} {formatClock(lead.next_followup)}
          </span>
        )}
      </div>
      <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3">
        <button data-testid={`quick-call-${lead.id}`} onClick={call}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-indigo-50 py-2 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-100 active:scale-95">
          <Phone className="h-3.5 w-3.5" /> Call
        </button>
        <button data-testid={`quick-whatsapp-${lead.id}`} onClick={whatsapp}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-50 py-2 text-xs font-semibold text-emerald-600 transition hover:bg-emerald-100 active:scale-95">
          <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
        </button>
        <button data-testid={`quick-edit-${lead.id}`} onClick={(e) => { e.stopPropagation(); navigate(`/leads/${lead.id}?edit=true`); }}
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
