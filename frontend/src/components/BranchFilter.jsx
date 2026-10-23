import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import { BRANCH_KEY } from "@/lib/api";
import { cn } from "@/lib/utils";

export const BRANCHES = ["Bangalore", "Chennai", "Coimbatore", "Tiruppur"];

/** Global branch filter in the top bar — applies to Leads, Pipeline, Follow-ups, Customers, Dashboard. */
export function BranchFilter({ className }) {
  const qc = useQueryClient();
  const [branch, setBranch] = useState(() => { try { return localStorage.getItem(BRANCH_KEY) || ""; } catch (_) { return ""; } });
  const change = (v) => {
    setBranch(v);
    try { if (v) localStorage.setItem(BRANCH_KEY, v); else localStorage.removeItem(BRANCH_KEY); } catch (_) {}
    qc.invalidateQueries(); // refetch every page with the new branch
  };
  return (
    <label data-testid="branch-filter"
      className={cn("flex cursor-pointer items-center gap-1.5 rounded-xl border px-2.5 py-2 text-sm font-medium transition",
        branch ? "border-primary bg-indigo-50 text-primary" : "border-slate-200 bg-white/70 text-slate-600 hover:border-slate-300", className)}>
      <MapPin className="h-4 w-4 shrink-0" />
      <select value={branch} onChange={(e) => change(e.target.value)} className="cursor-pointer appearance-none bg-transparent pr-1 outline-none">
        <option value="">All Branches</option>
        {BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
      </select>
    </label>
  );
}
