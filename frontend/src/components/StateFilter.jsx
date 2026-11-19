import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Map } from "lucide-react";
import { STATE_KEY } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Global state filter (Tamil Nadu / Karnataka) in the top bar. */
export function StateFilter({ className }) {
  const qc = useQueryClient();
  const [st, setSt] = useState(() => { try { return localStorage.getItem(STATE_KEY) || ""; } catch (_) { return ""; } });
  const change = (v) => {
    setSt(v);
    try { if (v) localStorage.setItem(STATE_KEY, v); else localStorage.removeItem(STATE_KEY); } catch (_) {}
    qc.invalidateQueries();
  };
  return (
    <label data-testid="state-filter"
      className={cn("flex cursor-pointer items-center gap-1.5 rounded-xl border px-2.5 py-2 text-sm font-medium transition",
        st ? "border-primary bg-indigo-50 text-primary" : "border-slate-200 bg-white/70 text-slate-600 hover:border-slate-300", className)}>
      <Map className="h-4 w-4 shrink-0" />
      <select value={st} onChange={(e) => change(e.target.value)} className="cursor-pointer appearance-none bg-transparent pr-1 outline-none">
        <option value="">All States</option>
        <option value="Tamil Nadu">Tamil Nadu</option>
        <option value="Karnataka">Karnataka</option>
        <option value="none">No State</option>
      </select>
    </label>
  );
}
