import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, StickyNote, PhoneOff, PhoneOutgoing, Headset, Users, Truck, History, BadgeCheck, ThumbsUp, IndianRupee, MapPin } from "lucide-react";
import api from "@/lib/api";
import { Avatar } from "@/components/InitialsAvatar";
import { ListSkeleton } from "@/components/Skeletons";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import Others from "@/pages/Others";

const PERIODS = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "custom", label: "Custom" },
];

const LOCATIONS = ["All", "Bangalore", "Coimbatore", "Chennai", "Tirupur"];

const inr = (n) => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

const METRICS = [
  { key: "total_calls", label: "Total Calls", icon: PhoneOutgoing },
  { key: "followups_total", label: "Follow-ups", icon: CalendarClock },
  { key: "tele_call", label: "Tele Call", icon: Headset },
  { key: "spoke_investor", label: "Spoked Investor", icon: Users },
  { key: "spoke_driver", label: "Spoked Driver", icon: Truck },
  { key: "prev_followup", label: "Previous Follow-up", icon: History },
  { key: "rnr", label: "RNR", icon: PhoneOff },
  { key: "conv_investor", label: "Conversion Investor", icon: BadgeCheck, accent: true },
  { key: "interested_driver", label: "Interested Driver", icon: ThumbsUp },
  { key: "payment", label: "Payment", icon: IndianRupee, accent: true, fmt: inr },
];

function fmtDate(d) {
  if (!d) return "";
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function TeamActivity() {
  const today = new Date().toISOString().slice(0, 10);
  const [period, setPeriod] = useState("today");
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [location, setLocation] = useState("All");
  const [othersOpen, setOthersOpen] = useState(false);
  const [fuRow, setFuRow] = useState(null);

  const params = period === "custom" ? { period, start, end } : { period };
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["team-activity", params],
    queryFn: async () => (await api.get("/team/activity", { params })).data,
    refetchInterval: 60000,
  });

  const rows = (data?.rows || []).filter(r => location === "All" || r.location === location);
  const totals = METRICS.reduce((t, m) => ({ ...t, [m.key]: rows.reduce((a, r) => a + (r[m.key] || 0), 0) }), {});

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-slate-900">Team Activity</h1>
          <p className="mt-1 text-slate-600">
            Daily performance of each team member
            {data?.from && <> · {fmtDate(data.from)}{data.to !== data.from && <> – {fmtDate(data.to)}</>}</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
        <button type="button" data-testid="team-others-btn" onClick={() => setOthersOpen(true)}
          className="flex h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-white shadow-lg shadow-primary/25 transition hover:bg-indigo-700 active:scale-95">
          <StickyNote className="h-4 w-4" /> Other Work
        </button>
        <select value={location} onChange={e => setLocation(e.target.value)}
          className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800">
          {LOCATIONS.map(l => <option key={l} value={l}>{l === "All" ? "All locations" : l}</option>)}
        </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {PERIODS.map(p => (
          <button key={p.key} type="button" onClick={() => setPeriod(p.key)}
            className={cn("rounded-xl px-4 py-2 text-sm font-semibold transition-all",
              period === p.key ? "bg-primary text-white shadow-sm" : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50")}>
            {p.label}
          </button>
        ))}
        {period === "custom" && (
          <div className="flex items-center gap-2">
            <Input type="date" value={start} max={end} onChange={e => setStart(e.target.value)} className="h-10 w-auto rounded-xl border-slate-200" />
            <span className="text-slate-600">to</span>
            <Input type="date" value={end} min={start} onChange={e => setEnd(e.target.value)} className="h-10 w-auto rounded-xl border-slate-200" />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {METRICS.map(m => (
          <div key={m.key} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-600">
              <m.icon className="h-4 w-4" /> {m.label}
            </div>
            <div className={cn("mt-2 font-display text-2xl font-extrabold", m.accent ? "text-emerald-600" : "text-slate-900")}>
              {m.fmt ? m.fmt(totals[m.key]) : totals[m.key]}
            </div>
          </div>
        ))}
      </div>

      {isLoading ? <ListSkeleton count={5} /> : isError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error?.response?.data?.detail || "Could not load activity"}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[1150px] table-fixed text-sm">
            <colgroup>
              <col style={{ width: 44 }} />
              <col style={{ width: 210 }} />
              {METRICS.map(m => <col key={m.key} />)}
            </colgroup>
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                <th className="px-3 py-3 align-middle">#</th>
                <th className="px-3 py-3 align-middle">Member</th>
                {METRICS.map(m => <th key={m.key} className="px-2 py-3 text-center align-middle leading-tight">{m.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={METRICS.length + 2} className="px-4 py-10 text-center text-slate-600">No members found</td></tr>
              )}
              {rows.map((r, i) => (
                <tr key={r.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-3 py-3 font-semibold text-slate-600 tabular-nums">{i + 1}</td>
                  <td className="px-3 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar name={r.name} size={34} />
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-slate-900" title={r.name}>{r.name}</div>
                        <div className="flex items-center gap-2 text-xs capitalize text-slate-600">
                          {(r.role || "").replace("_", " ")}
                          {r.location && <span className="flex items-center gap-0.5"><MapPin className="h-3 w-3" />{r.location}</span>}
                        </div>
                      </div>
                    </div>
                  </td>
                  {METRICS.map(m => (
                    <td key={m.key} className={cn("px-2 py-3 text-center font-semibold tabular-nums", m.accent ? "text-emerald-600" : "text-slate-900")}>
                      {m.key === "followups_total" ? (
                        <button type="button" disabled={!r.followups_total} onClick={() => setFuRow(r)}
                          className="rounded-lg px-2 py-0.5 text-primary underline-offset-2 hover:underline disabled:text-slate-400 disabled:no-underline">
                          {r.followups_done || 0} / {r.followups_total || 0}
                        </button>
                      ) : m.fmt ? m.fmt(r[m.key]) : r[m.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!fuRow} onOpenChange={(v) => { if (!v) setFuRow(null); }}>
        <DialogContent aria-describedby={undefined} className="max-h-[85vh] overflow-y-auto rounded-3xl sm:max-w-lg">
          <DialogTitle>{fuRow?.name} · Follow-ups</DialogTitle>
          <div className="space-y-2">
            {(fuRow?.followups || []).map((f, i) => (
              <div key={i} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-semibold text-slate-900">{f.lead_name || "Lead"}</div>
                  <div className="text-xs text-slate-600">
                    {f.due_at ? new Date(f.due_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : ""}
                    {f.reason ? ` · ${f.reason}` : ""}
                  </div>
                </div>
                <span className={cn("shrink-0 rounded-lg px-2 py-0.5 text-xs font-semibold",
                  f.status === "completed" ? "bg-emerald-50 text-emerald-700" : "bg-amber-100 text-amber-800")}>
                  {f.status === "completed" ? "Done" : "Pending"}
                </span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={othersOpen} onOpenChange={setOthersOpen}>
        <DialogContent aria-describedby={undefined} className="max-h-[85vh] overflow-y-auto rounded-3xl sm:max-w-3xl">
          <DialogTitle className="sr-only">Other Work</DialogTitle>
          <Others embedded />
        </DialogContent>
      </Dialog>
    </div>
  );
}
