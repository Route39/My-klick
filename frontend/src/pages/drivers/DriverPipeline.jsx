import React, { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import confetti from "canvas-confetti";
import { toast } from "sonner";
import api from "@/lib/api";
import { LeadCard } from "@/components/LeadCard";
import { AddDriverDialog } from "@/components/AddDriverDialog";
import { ListSkeleton } from "@/components/Skeletons";
import { STAGES, STATUS_META, formatINR } from "@/lib/constants";
import { cn } from "@/lib/utils";

export default function DriverPipeline() {
  const segment = "driver";
  const qc = useQueryClient();
  const [dragId, setDragId] = useState(null);
  const [overCol, setOverCol] = useState(null);
  const [addOpen, setAddOpen] = useState(false);

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["leads", "", "driver"], queryFn: async () => (await api.get("/leads", { params: { segment: "driver" } })).data,
    refetchInterval: 15000,
    placeholderData: (prev) => prev,
  });

  const move = useMutation({
    mutationFn: async ({ id, status }) => (await api.patch(`/leads/${id}/stage`, { status })).data,
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: ["leads", "", "driver"] });
      const prev = qc.getQueryData(["leads", "", "driver"]);
      // Optimistic update: move card immediately, no flicker
      qc.setQueryData(["leads", "", "driver"], (old = []) => old.map((l) => l.id === id ? { ...l, status } : l));
      return { prev };
    },
    onError: (e, v, ctx) => { qc.setQueryData(["leads", "", "driver"], ctx.prev); toast.error("Could not move lead"); },
    onSuccess: (_d, { id, status, name }) => {
      // Only invalidate leads + the specific card's followups — not everything
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["lead-followups", id] });
      if (status === "converted") {
        celebrate();
        toast.success("Lead converted 🎉", { description: name });
      } else {
        toast.success(`Moved to ${STATUS_META[status].label} ✓`);
      }
    },
  });

  const columns = useMemo(() => {
    const map = {}; STAGES.forEach((s) => (map[s] = []));
    leads.forEach((l) => { if (map[l.status]) map[l.status].push(l); });
    return map;
  }, [leads]);

  const onDrop = (status) => {
    setOverCol(null);
    if (!dragId) return;
    const lead = leads.find((l) => l.id === dragId);
    if (lead && lead.status !== status) move.mutate({ id: dragId, status, name: lead.name });
    setDragId(null);
  };

  if (isLoading) return <div className="mx-auto max-w-7xl"><ListSkeleton count={4} /></div>;

  return (
    <div className="mx-auto max-w-[1600px]">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-slate-900">Pipeline</h1>
        <p className="mt-1 text-slate-500">Drag leads across stages. Drop into Converted for the win ✨</p>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-6 thin-scroll" data-testid="pipeline-board">
        {STAGES.map((s) => {
          const items = columns[s]; const total = items.reduce((a, l) => a + (l.value || 0), 0);
          return (
            <div key={s} data-testid={`pipeline-col-${s}`}
              onDragOver={(e) => { e.preventDefault(); setOverCol(s); }}
              onDragLeave={() => setOverCol((c) => (c === s ? null : c))}
              onDrop={() => onDrop(s)}
              className={cn("flex w-[300px] shrink-0 flex-col rounded-2xl border bg-slate-50/60 p-3 transition-colors",
                overCol === s ? "border-primary bg-accent" : "border-slate-200/70")}>
              <div className="mb-3 flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_META[s].dot }} />
                  <span className="font-display font-bold text-slate-900">{STATUS_META[s].label}</span>
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-slate-500 shadow-sm">{items.length}</span>
                </div>
                {total > 0 && <span className="font-display text-xs font-bold text-slate-400">{formatINR(total)}</span>}
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto no-scrollbar" style={{ minHeight: 120 }}>
                {items.map((l, i) => (
                  <LeadCard key={l.id} lead={l} index={i} draggable
                    onDragStart={() => setDragId(l.id)} />
                ))}
                {items.length === 0 && (
                  <div className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-xs text-slate-400">Drop here</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function celebrate() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const end = Date.now() + 700;
  const colors = ["#4F46E5", "#10B981", "#F59E0B", "#8B5CF6"];
  (function frame() {
    confetti({ particleCount: 4, angle: 60, spread: 55, origin: { x: 0 }, colors });
    confetti({ particleCount: 4, angle: 120, spread: 55, origin: { x: 1 }, colors });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
}
