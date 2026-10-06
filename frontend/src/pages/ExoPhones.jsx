import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PhoneIncoming, PhoneOutgoing, RefreshCw, Play, Loader2, Search, Phone, ArrowRight, X, MapPin, UserPlus, UserCheck } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { cn } from "@/lib/utils";

const toDate = (s) => (s ? new Date(String(s).replace(" ", "T") + (String(s).includes("+") || String(s).endsWith("Z") ? "" : "+05:30")) : null);
function ago(s) {
  const d = toDate(s);
  if (!d || isNaN(d)) return "—";
  const m = Math.floor((Date.now() - d.getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min${m > 1 ? "s" : ""} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h > 1 ? "s" : ""} ago`;
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
const dur = (s) => {
  const n = Number(s) || 0;
  if (!n) return "—";
  const h = String(Math.floor(n / 3600)).padStart(2, "0");
  const m = String(Math.floor((n % 3600) / 60)).padStart(2, "0");
  const x = String(n % 60).padStart(2, "0");
  return `${h}:${m}:${x}`;
};

function Recording({ sid }) {
  const [url, setUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => () => url && URL.revokeObjectURL(url), [url]);
  if (url) return <audio src={url} controls autoPlay className="h-8 w-48" />;
  return (
    <button
      onClick={async () => {
        setLoading(true);
        try {
          const r = await api.get(`/exophones/recording/${sid}`, { responseType: "blob" });
          setUrl(URL.createObjectURL(r.data));
        } catch {
          toast.error("Recording not available");
        } finally {
          setLoading(false);
        }
      }}
      className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50"
      title="Play recording"
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
    </button>
  );
}

export default function ExoPhones({ segment = "investor" }) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [direction, setDirection] = useState("");
  const [page, setPage] = useState(0);
  const PAGE = 25;
  const { data, isLoading } = useQuery({
    queryKey: ["exophones", search, direction, page],
    queryFn: async () => (await api.get("/exophones/calls", { params: { q: search, direction, limit: PAGE, skip: page * PAGE } })).data,
    placeholderData: (prev) => prev,
    refetchInterval: 30000,
  });
  const sync = useMutation({
    mutationFn: async () => (await api.post("/exophones/sync")).data,
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["exophones"] });
      r?.ok ? toast.success(`Synced ✓ ${r.new ? `(${r.new} new)` : ""}`) : toast.error(r?.error || "Sync failed");
    },
    onError: () => toast.error("Sync failed"),
  });
  const claim = useMutation({
    mutationFn: async (sid) => (await api.post(`/exophones/calls/${sid}/claim`, null, { params: { segment } })).data,
    onSuccess: () => { toast.success("Lead assigned to you ✓"); qc.invalidateQueries({ queryKey: ["exophones"] }); },
    onError: (e) => { toast.error(e?.response?.data?.detail || "Could not assign"); qc.invalidateQueries({ queryKey: ["exophones"] }); },
  });
  const isAdmin = !!data?.is_admin;
  const cols = isAdmin ? 9 : 7;
  const rows = data?.items || [];
  const leadPath = (id) => `/leads/${id}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">ExoPhones</h1>
          <p className="text-sm text-slate-500">
            All Exotel calls · auto-updates every minute{data?.last_sync ? ` · last sync ${ago(data.last_sync)}` : ""}
          </p>
        </div>
        <button
          onClick={() => sync.mutate()}
          disabled={sync.isPending}
          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={cn("h-4 w-4", sync.isPending && "animate-spin")} /> Refresh
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <form onSubmit={(e) => { e.preventDefault(); setSearch(q.trim()); setPage(0); }} className="flex min-w-[260px] flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3">
          <Search className="h-4 w-4 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search number, name or call sid"
            className="h-10 flex-1 bg-transparent text-sm outline-none" />
        </form>
        {[["", "All"], ["incoming", "Incoming"], ["outgoing", "Outgoing"]].map(([v, l]) => (
          <button key={l} onClick={() => { setDirection(v); setPage(0); }}
            className={cn("rounded-xl px-3 py-2 text-sm font-medium", direction === v ? "bg-primary text-white" : "border border-slate-200 bg-white text-slate-600")}>
            {l}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">From</th>
              <th className="px-4 py-3">To / Agent</th>
              <th className="px-4 py-3">Direction</th>
              <th className="px-4 py-3">ExoPhone</th>
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">Outcome</th>
              <th className="px-4 py-3">Assigned</th>
              {isAdmin && <th className="px-4 py-3">Duration</th>}
              {isAdmin && <th className="px-4 py-3">Recording</th>}
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={cols} className="py-10 text-center text-slate-400">Loading…</td></tr>}
            {!isLoading && rows.length === 0 && <tr><td colSpan={cols} className="py-10 text-center text-slate-400">No calls found</td></tr>}
            {rows.map((c) => {
              const ok = c.status === "completed";
              const customer = c.direction === "incoming" ? c.from_number : c.to_number;
              return (
                <tr key={c.sid} className={cn("border-t border-slate-100", c.claimed_by ? "bg-slate-100 text-slate-400 [&_*]:!text-slate-400" : "hover:bg-slate-50/60")}>
                  <td className="px-4 py-3">
                    {c.lead_id
                      ? <Link to={leadPath(c.lead_id)} className="font-medium text-primary hover:underline">{c.lead_name || customer}</Link>
                      : <span className="font-medium text-slate-800">{c.direction === "incoming" ? c.from_number : (c.agent_initials ? <span title={c.agent_number}>{c.agent_name}</span> : c.from_number)}</span>}
                    {c.lead_id && <div className="text-xs text-slate-400">{customer}</div>}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {c.direction === "incoming"
                      ? (c.agent_initials
                          ? <span title={`${c.agent_name} · ${c.agent_number}`} className="inline-flex items-center gap-1.5 font-medium"><span className="grid h-6 w-6 place-items-center rounded-full bg-slate-100 text-[10px] text-slate-600">{c.agent_initials}</span>{c.agent_name}</span>
                          : (c.agent_number || ""))
                      : c.to_number}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("inline-flex items-center gap-1 font-medium", c.direction === "incoming" ? "text-amber-600" : "text-sky-600")}>
                      {c.direction === "incoming" ? <PhoneIncoming className="h-3.5 w-3.5" /> : <PhoneOutgoing className="h-3.5 w-3.5" />}
                      {c.direction === "incoming" ? "Incoming" : "Outgoing"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{c.exophone_number || c.exophone || "—"}</td>
                  <td className="px-4 py-3 text-slate-600" title={c.start_time}>{ago(c.start_time)}</td>
                  <td className="px-4 py-3">
                    {(() => {
                      const k = c.outcome_kind || (ok ? "success" : "failed");
                      const col = k === "success" ? "text-emerald-600" : k === "hangup_before" ? "text-orange-500" : "text-red-500";
                      return (
                        <span className="inline-flex items-center gap-1.5 text-slate-700">
                          <Phone className={cn("h-4 w-4", col)} />
                          {k === "hangup_during" && <><ArrowRight className="h-3.5 w-3.5 text-red-500" /><X className="h-3.5 w-3.5 text-red-500" /></>}
                          {c.outcome || c.status}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3">
                    {c.claimed_by ? (
                      <div className="leading-tight">
                        <div className="inline-flex items-center gap-1 font-medium"><UserCheck className="h-3.5 w-3.5" />{c.claimed_name || "Assigned"}</div>
                        {c.claimed_location && <div className="mt-0.5 inline-flex items-center gap-1 text-xs"><MapPin className="h-3 w-3" />{c.claimed_location}</div>}
                      </div>
                    ) : isAdmin ? (
                      <span className="text-xs text-slate-400">Not assigned</span>
                    ) : (
                      <button onClick={() => claim.mutate(c.sid)} disabled={claim.isPending}
                        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50">
                        <UserPlus className="h-3.5 w-3.5" /> Assign to me
                      </button>
                    )}
                  </td>
                  {isAdmin && <td className="px-4 py-3 tabular-nums text-slate-600">{dur(c.duration)}</td>}
                  {isAdmin && <td className="px-4 py-3">{c.recording_url ? <Recording sid={c.sid} /> : null}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {(() => {
        const total = data?.total || 0;
        const pages = Math.max(1, Math.ceil(total / PAGE));
        const from = total ? page * PAGE + 1 : 0;
        const to = Math.min(total, (page + 1) * PAGE);
        const nums = [...new Set([0, page - 1, page, page + 1, pages - 1])].filter((n) => n >= 0 && n < pages).sort((a, b) => a - b);
        const btn = "h-9 min-w-9 rounded-lg border px-3 text-sm font-medium disabled:opacity-40";
        return (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-500">Showing {from}–{to} of {total}</p>
            <div className="flex items-center gap-1.5">
              <button className={cn(btn, "border-slate-200 bg-white text-slate-700")} disabled={page === 0} onClick={() => setPage(page - 1)}>Prev</button>
              {nums.map((n, i) => (
                <React.Fragment key={n}>
                  {i > 0 && n - nums[i - 1] > 1 && <span className="px-1 text-slate-400">…</span>}
                  <button onClick={() => setPage(n)}
                    className={cn(btn, n === page ? "border-primary bg-primary text-white" : "border-slate-200 bg-white text-slate-700")}>{n + 1}</button>
                </React.Fragment>
              ))}
              <button className={cn(btn, "border-slate-200 bg-white text-slate-700")} disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Next</button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
