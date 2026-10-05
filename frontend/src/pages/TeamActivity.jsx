import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PhoneCall, PhoneOutgoing, Users, Clock, MapPin } from "lucide-react";
import api from "@/lib/api";
import { Avatar } from "@/components/InitialsAvatar";
import { ListSkeleton } from "@/components/Skeletons";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const PERIODS = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "custom", label: "Custom" },
];

const LOCATIONS = ["All", "Bangalore", "Coimbatore", "Chennai", "Tirupur"];

function fmtTalk(sec) {
  const s = Number(sec) || 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

function fmtDate(d) {
  if (!d) return "";
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function Tile({ icon: Icon, label, value, accent }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-600">
        <Icon className="h-4 w-4" /> {label}
      </div>
      <div className={cn("mt-2 font-display text-2xl font-extrabold", accent ? "text-emerald-600" : "text-slate-900")}>
        {value}
      </div>
    </div>
  );
}

export default function TeamActivity() {
  const today = new Date().toISOString().slice(0, 10);
  const [period, setPeriod] = useState("today");
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [location, setLocation] = useState("All");

  const params = period === "custom" ? { period, start, end } : { period };
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["team-activity", params],
    queryFn: async () => (await api.get("/team/activity", { params })).data,
    refetchInterval: 60000,
  });

  const rows = (data?.rows || []).filter(r => location === "All" || r.location === location);
  const totals = rows.reduce((t, r) => ({
    dialed: t.dialed + r.dialed, connected: t.connected + r.connected,
    leads_spoken: t.leads_spoken + r.leads_spoken, talk_seconds: t.talk_seconds + r.talk_seconds,
  }), { dialed: 0, connected: 0, leads_spoken: 0, talk_seconds: 0 });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-slate-900">Team Activity</h1>
          <p className="mt-1 text-slate-500">
            How many leads each member spoke to
            {data?.from && <> · {fmtDate(data.from)}{data.to !== data.from && <> – {fmtDate(data.to)}</>}</>}
          </p>
        </div>
        <select value={location} onChange={e => setLocation(e.target.value)}
          className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900">
          {LOCATIONS.map(l => <option key={l} value={l}>{l === "All" ? "All locations" : l}</option>)}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {PERIODS.map(p => (
          <button key={p.key} type="button" onClick={() => setPeriod(p.key)}
            className={cn("rounded-xl px-4 py-2 text-sm font-semibold transition-all",
              period === p.key ? "bg-primary text-white shadow-sm" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50")}>
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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile icon={PhoneOutgoing} label="Calls dialed" value={totals.dialed} />
        <Tile icon={PhoneCall} label="Connected" value={totals.connected} accent />
        <Tile icon={Users} label="Leads spoken" value={totals.leads_spoken} accent />
        <Tile icon={Clock} label="Talk time" value={fmtTalk(totals.talk_seconds)} />
      </div>

      {isLoading ? <ListSkeleton count={5} /> : isError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error?.response?.data?.detail || "Could not load activity"}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Member</th>
                <th className="px-4 py-3 text-right">Dialed</th>
                <th className="px-4 py-3 text-right">Connected</th>
                <th className="px-4 py-3 text-right">Leads called</th>
                <th className="px-4 py-3 text-right">Leads spoken</th>
                <th className="px-4 py-3 text-right">Talk time</th>
                <th className="px-4 py-3 text-right">Connect %</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-600">No members found</td></tr>
              )}
              {rows.map((r, i) => (
                <tr key={r.id} className={cn("border-b border-slate-50 last:border-0")}>
                  <td className="px-4 py-3 font-semibold text-slate-600">{i + 1}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={r.name} size={34} />
                      <div>
                        <div className="font-semibold text-slate-900">{r.name}</div>
                        <div className="flex items-center gap-2 text-xs capitalize text-slate-600">
                          {(r.role || "").replace("_", " ")}
                          {r.location && <span className="flex items-center gap-0.5"><MapPin className="h-3 w-3" />{r.location}</span>}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">{r.dialed}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">{r.connected}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">{r.leads_called}</td>
                  <td className="px-4 py-3 text-right font-bold text-emerald-600">{r.leads_spoken}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">{fmtTalk(r.talk_seconds)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">{r.connect_rate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
