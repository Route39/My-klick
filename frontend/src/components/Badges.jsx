import React from "react";
import { STATUS_META, PRIORITY_META, SOURCE_META } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function StatusBadge({ status, className = "" }) {
  const m = STATUS_META[status] || STATUS_META.new;
  return (
    <span
      data-testid={`status-badge-${status}`}
      className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1", m.bg, m.text, m.ring, className)}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: m.dot }} />
      {m.label}
    </span>
  );
}

export function PriorityBadge({ priority }) {
  const m = PRIORITY_META[priority] || PRIORITY_META.medium;
  return (
    <span className={cn("rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", m.bg, m.text)}>
      {m.label}
    </span>
  );
}

export function SourceBadge({ source }) {
  const m = SOURCE_META[source] || SOURCE_META.manual;
  const Icon = m.icon;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500">
      <Icon className={cn("h-3.5 w-3.5", m.color)} />
      {m.label}
    </span>
  );
}
