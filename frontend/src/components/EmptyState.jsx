import React from "react";

export function EmptyState({ icon: Icon, title, subtitle, action, testid }) {
  return (
    <div data-testid={testid} className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-white/60 px-6 py-16 text-center animate-fade-up">
      {Icon && (
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent text-primary">
          <Icon className="h-8 w-8" />
        </div>
      )}
      <h3 className="font-display text-xl font-bold text-slate-900">{title}</h3>
      {subtitle && <p className="mt-1.5 max-w-sm text-sm text-slate-500">{subtitle}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
