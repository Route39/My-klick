import React from "react";

export function CardSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-200/60 bg-white p-5">
      <div className="flex items-center gap-3">
        <div className="skeleton h-11 w-11 rounded-full" />
        <div className="flex-1 space-y-2">
          <div className="skeleton h-3.5 w-2/3 rounded" />
          <div className="skeleton h-3 w-1/3 rounded" />
        </div>
      </div>
      <div className="skeleton mt-4 h-3 w-1/2 rounded" />
    </div>
  );
}

export function StatSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-200/60 bg-white p-6">
      <div className="skeleton h-3 w-20 rounded" />
      <div className="skeleton mt-4 h-10 w-24 rounded" />
      <div className="skeleton mt-4 h-8 w-full rounded" />
    </div>
  );
}

export function ListSkeleton({ count = 5 }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => <CardSkeleton key={i} />)}
    </div>
  );
}
