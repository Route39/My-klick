import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Clock, MapPin, Phone, PhoneIncoming, PhoneOutgoing, Timer, User, UserCheck, UserPlus, XCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";

const fmt = (s) => (s ? new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const ms = (s) => (s ? new Date(s).getTime() : 0);
const LATE_MS = 60 * 60 * 1000; // open > 1 hour -> red
function dur(m) {
  if (!m || m < 0) return "—";
  const min = Math.floor(m / 60000);
  if (min < 1) return "<1m";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ${min % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}
const segOf = (e) => (e.segment === "driver" ? "driver" : "investor");
const leadPath = (e) => (e.lead_id ? (e.segment === "driver" ? `/drivers/leads/${e.lead_id}` : `/leads/${e.lead_id}`) : null);

function TypeBadge({ e }) {
  const d = segOf(e) === "driver";
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", d ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-700")}>
      {d ? "Driver" : "Investor"}
    </span>
  );
}

function AssignBox({ esc }) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: async () => (await api.post(`/escalations/${esc.id}/assign`)).data,
    onSuccess: () => { toast.success(`Assigned to you ✓ · added to your ${segOf(esc) === "driver" ? "Driver" : "Investor"} leads`); qc.invalidateQueries(); },
    onError: (e) => { toast.error(e?.response?.data?.detail || "Could not assign"); qc.invalidateQueries({ queryKey: ["escalations"] }); },
  });
  return (
    <button type="button" disabled={m.isPending} onClick={() => m.mutate()}
      className="inline-flex w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white disabled:opacity-50 md:w-auto">
      <UserPlus className="h-3.5 w-3.5" />{m.isPending ? "Assigning…" : "Assign to me"}
    </button>
  );
}

/* ---------- Staff / team-leader view: one escalation per row ---------- */
function StaffCard({ e }) {
  const open = e.status === "open";
  const path = leadPath(e);
  const name = e.lead_name || e.customer_number;
  return (
    <div className={cn("rounded-2xl border border-l-4 border-slate-200 bg-white px-4 py-3 shadow-sm", open ? "border-l-red-500" : "border-l-emerald-500")}>
      <div className="grid gap-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-center md:gap-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {path ? <Link to={path} className="truncate font-semibold text-primary hover:underline">{name}</Link>
              : <span className="truncate font-semibold text-slate-900">{name}</span>}
            <TypeBadge e={e} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{e.customer_number}</span>
            <span className="inline-flex items-center gap-1">{e.direction === "incoming" ? <PhoneIncoming className="h-3 w-3" /> : <PhoneOutgoing className="h-3 w-3" />}{e.direction === "incoming" ? "Incoming" : "Outgoing"}</span>
            <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{e.region}</span>
          </div>
        </div>
        <div className="min-w-0 text-sm">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-600">Reason</div>
          <p className="truncate text-slate-800" title={e.reason}>{e.reason}</p>
          <div className="truncate text-xs text-slate-400">by {e.created_by_name || "Staff"} · {fmt(e.created_at)}</div>
        </div>
        <div className="min-w-0 text-sm">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Remarks</div>
          <p className="line-clamp-2 text-slate-700" title={e.remarks || ""}>{e.remarks || "—"}</p>
        </div>
        <div className="md:text-right">
          {open ? <AssignBox esc={e} /> : (
            <div className="text-xs text-slate-500">
              <div className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700"><UserCheck className="h-3.5 w-3.5" />{e.resolved_name}</div>
              <div className="mt-1">{fmt(e.resolved_at)}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- Admin view: summary + compact table ---------- */
function Summary({ items }) {
  const today = new Date().toDateString();
  const open = items.filter((e) => e.status === "open");
  const done = items.filter((e) => e.status === "resolved");
  const doneToday = done.filter((e) => e.resolved_at && new Date(e.resolved_at).toDateString() === today);
  const times = done.map((e) => ms(e.resolved_at) - ms(e.created_at)).filter((t) => t > 0);
  const avg = times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0;
  const notSpoke = done.filter((e) => e.talked === false).length;
  const late = open.filter((e) => Date.now() - ms(e.created_at) > LATE_MS).length;
  const cards = [
    { label: "Open", value: open.length, sub: late ? `${late} over 1 hour` : "all on time", icon: AlertTriangle, tone: "text-red-600 bg-red-50" },
    { label: "Completed Today", value: doneToday.length, sub: `${done.length} completed total`, icon: CheckCircle2, tone: "text-emerald-700 bg-emerald-50" },
    { label: "Avg Response", value: dur(avg), sub: "raised → closed", icon: Timer, tone: "text-violet-700 bg-violet-50" },
    { label: "Did Not Speak", value: notSpoke, sub: "closed without talking", icon: XCircle, tone: "text-amber-700 bg-amber-50" },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map(({ label, value, sub, icon: Icon, tone }) => (
        <div key={label} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
            <span className={cn("rounded-lg p-1.5", tone)}><Icon className="h-4 w-4" /></span>
          </div>
          <div className="mt-2 text-2xl font-bold tabular-nums text-slate-900">{value}</div>
          <div className="text-xs text-slate-400">{sub}</div>
        </div>
      ))}
    </div>
  );
}

function AdminTable({ rows }) {
  const [openId, setOpenId] = useState(null);
  const [confirmRow, setConfirmRow] = useState(null);
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: async (id) => (await api.delete(`/escalations/${id}`)).data,
    onSuccess: (r) => { setConfirmRow(null); qc.invalidateQueries(); toast.success(r.lead_deleted ? "Lead & escalation deleted" : "Escalation deleted"); },
    onError: (err) => toast.error(err?.response?.data?.detail || "Could not delete"),
  });
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full min-w-[980px] text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            {["Customer", "Type", "State", "Reason", "Raised by", "Pending", "Status", "Assigned to", ""].map((h) => (
              <th key={h} className="px-4 py-3">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((e) => {
            const open = e.status === "open";
            const age = open ? Date.now() - ms(e.created_at) : ms(e.resolved_at) - ms(e.created_at);
            const late = open && age > LATE_MS;
            const expanded = openId === e.id;
            const path = leadPath(e);
            return (
              <React.Fragment key={e.id}>
                <tr onClick={() => setOpenId(expanded ? null : e.id)}
                  className={cn("cursor-pointer transition-colors hover:bg-slate-50", late && "bg-red-50/50", expanded && "bg-slate-50")}>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-900">{e.lead_name || e.customer_number}</div>
                    {e.lead_name && <div className="text-xs text-slate-500">{e.customer_number}</div>}
                  </td>
                  <td className="px-4 py-3"><TypeBadge e={e} /></td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{e.region}</td>
                  <td className="max-w-[220px] px-4 py-3"><p className="truncate text-slate-700" title={e.reason}>{e.reason}</p></td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="text-slate-700">{e.created_by_name || "Staff"}</div>
                    <div className="text-xs text-slate-400">{fmt(e.created_at)}</div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className={cn("inline-flex items-center gap-1 font-semibold tabular-nums", open ? (late ? "text-red-600" : "text-amber-600") : "text-slate-500")}>
                      <Clock className="h-3.5 w-3.5" />{dur(age)}
                    </span>
                    {!open && <div className="text-[11px] text-slate-400">response time</div>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", open ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-700")}>
                      {open ? "Open" : "Completed"}
                    </span>
                  </td>
                  <td className="max-w-[240px] px-4 py-3">
                    {open ? <span className="text-xs text-slate-400">—</span> : (
                      <div>
                        <div className="flex items-center gap-1.5 text-slate-700">
                          <UserCheck className="h-3.5 w-3.5 text-emerald-600" />
                          {e.resolved_name}
                        </div>
                        <p className="text-xs text-slate-400">{fmt(e.resolved_at)}</p>
                      </div>
                    )}
                  </td>
                <td className="px-4 py-3 text-right"><button type="button" title="Delete lead" disabled={del.isPending} onClick={(ev) => { ev.stopPropagation(); setConfirmRow(e); }} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"><Trash2 className="h-4 w-4" /></button></td>
                </tr>
                {expanded && (
                  <tr className="bg-slate-50/70">
                    <td colSpan={9} className="px-4 py-4">
                      <div className="grid gap-3 text-sm md:grid-cols-3">
                        <div className="rounded-xl border border-slate-100 bg-white p-3">
                          <div className="mb-1 text-xs font-semibold uppercase text-slate-400">Call</div>
                          <div className="flex items-center gap-1.5 text-slate-700">
                            {e.direction === "incoming" ? <PhoneIncoming className="h-3.5 w-3.5" /> : <PhoneOutgoing className="h-3.5 w-3.5" />}
                            {e.direction === "incoming" ? "Incoming" : "Outgoing"} · {fmt(e.call_time)}
                          </div>
                          {e.agent_name && <div className="mt-1 text-xs text-slate-500">Agent: {e.agent_name}</div>}
                          {e.outcome && <div className="text-xs text-slate-500">Outcome: {e.outcome}</div>}
                          {path && <Link to={path} onClick={(ev) => ev.stopPropagation()} className="mt-2 inline-block text-xs font-semibold text-primary hover:underline">Open lead →</Link>}
                        </div>
                        <div className="rounded-xl bg-amber-50 p-3 text-amber-900">
                          <div className="mb-1 text-xs font-semibold uppercase text-amber-700">Reason</div>
                          {e.reason}
                          <div className="mt-1 text-xs text-amber-700">by {e.created_by_name || "Staff"} · {fmt(e.created_at)}</div>
                        </div>
                        <div className="rounded-xl border border-slate-100 bg-white p-3">
                          <div className="mb-1 text-xs font-semibold uppercase text-slate-400">Remarks</div>
                          <p className="whitespace-pre-line text-slate-700">{e.remarks || "—"}</p>
                          <div className="mt-2 text-xs text-slate-500">
                            {open ? `Waiting for ${e.region} team…` : `Assigned to ${e.resolved_name} · ${fmt(e.resolved_at)}`}
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
        {confirmRow && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !del.isPending && setConfirmRow(null)}>
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={(ev) => ev.stopPropagation()}>
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600"><Trash2 className="h-5 w-5" /></div>
              <h3 className="text-center text-lg font-bold text-slate-900">{confirmRow.lead_id ? "Delete lead?" : "Delete escalation?"}</h3>
              <p className="mt-1 text-center text-sm text-slate-500"><b>{confirmRow.lead_name || confirmRow.customer_number}</b>{confirmRow.lead_id ? " — lead and its escalation will be deleted. This cannot be undone." : " — this escalation will be deleted."}</p>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <button type="button" disabled={del.isPending} onClick={() => setConfirmRow(null)} className="rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
                <button type="button" disabled={del.isPending} onClick={() => del.mutate(confirmRow.id)} className="rounded-xl bg-red-500 py-2.5 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-50">{del.isPending ? "Deleting…" : "Delete"}</button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}

export default function Escalations() {
  const { user } = useAuth();
  const isAdmin = ["admin", "admin_staff"].includes(user?.role);
  const isManager = ["admin", "team_leader", "admin_staff"].includes(user?.role);
  const [tab, setTab] = useState("open");
  const [region, setRegion] = useState("all");
  const [seg, setSeg] = useState("all");
  const { data = [], isLoading } = useQuery({
    queryKey: ["escalations", isAdmin ? "admin-all" : tab],
    queryFn: async () => (await api.get("/escalations", { params: { status: isAdmin || tab === "all" ? "" : tab } })).data,
    refetchInterval: 3000,
  });

  // Admin loads everything once (for summary) and filters the tab on the client.
  const base = isAdmin && tab !== "all" ? data.filter((e) => e.status === tab) : data;
  const bySeg = seg === "all" ? base : base.filter((e) => segOf(e) === seg);
  const rows = region === "all" ? bySeg : bySeg.filter((e) => e.region === region);
  const cnt = (r) => (r === "all" ? bySeg.length : bySeg.filter((e) => e.region === r).length);
  const segCnt = (v) => { const b = region === "all" ? base : base.filter((e) => e.region === region); return v === "all" ? b.length : b.filter((e) => segOf(e) === v).length; };
  const summaryItems = data.filter((e) => (region === "all" || e.region === region) && (seg === "all" || segOf(e) === seg));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Escalations</h1>
        <p className="text-sm text-slate-500">
          {isManager ? "All escalated calls · see whether staff spoke to the customer" : "Escalated calls for your state · assign to yourself"}
        </p>
      </div>
      {isAdmin && <Summary items={summaryItems} />}
      <div className="flex flex-wrap gap-2">
        {[["open", "Open"], ["resolved", "Completed"], ["all", "All"]].map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)}
            className={cn("rounded-xl px-4 py-2 text-sm font-medium", tab === v ? "bg-primary text-white" : "border border-slate-200 bg-white text-slate-600")}>
            {l}
          </button>
        ))}
        {isManager && <span className="mx-1 hidden w-px bg-slate-200 sm:block" />}
        {isManager && [["all", "All States"], ["Tamil Nadu", "Tamil Nadu"], ["Karnataka", "Karnataka"]].map(([v, l]) => (
          <button key={v} onClick={() => setRegion(v)}
            className={cn("rounded-xl px-4 py-2 text-sm font-medium", region === v ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600")}>
            {l} <span className="ml-1 opacity-70">{cnt(v)}</span>
          </button>
        ))}
        <span className="mx-1 hidden w-px bg-slate-200 sm:block" />
        {[["all", "All Types", "bg-slate-900 text-white"], ["investor", "Investor", "bg-emerald-600 text-white"], ["driver", "Driver", "bg-red-500 text-white"]].map(([v, l, on]) => (
          <button key={v} onClick={() => setSeg(v)}
            className={cn("rounded-xl px-4 py-2 text-sm font-medium", seg === v ? on : "border border-slate-200 bg-white text-slate-600")}>
            {l} <span className="ml-1 opacity-70">{segCnt(v)}</span>
          </button>
        ))}
      </div>
      {isLoading && <p className="py-10 text-center text-slate-400">Loading…</p>}
      {!isLoading && rows.length === 0 && <p className="py-10 text-center text-slate-400">No escalations</p>}
      {!isLoading && rows.length > 0 && (isAdmin ? <AdminTable rows={rows} /> : (
        <div className="space-y-2.5">
          {rows.map((e) => <StaffCard key={e.id} e={e} />)}
        </div>
      ))}
    </div>
  );
}
