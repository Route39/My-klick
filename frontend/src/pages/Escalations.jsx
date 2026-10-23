import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, MapPin, Phone, PhoneIncoming, PhoneOutgoing, User, XCircle } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";

const fmt = (s) => (s ? new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

function ResolveBox({ esc }) {
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const [talked, setTalked] = useState(true);
  const m = useMutation({
    mutationFn: async () => (await api.post(`/escalations/${esc.id}/resolve`, { note, talked })).data,
    onSuccess: () => { toast.success("Escalation closed ✓"); qc.invalidateQueries({ queryKey: ["escalations"] }); },
    onError: (e) => { toast.error(e?.response?.data?.detail || "Could not save"); qc.invalidateQueries({ queryKey: ["escalations"] }); },
  });
  return (
    <div className="mt-3 space-y-2 rounded-xl border border-slate-100 bg-slate-50 p-3">
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Notes — what did the customer say?"
        className="w-full resize-none rounded-lg border border-slate-200 bg-white p-2 text-sm outline-none focus:border-primary" />
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-slate-500">Spoke to customer?</span>
        {[[true, "Yes"], [false, "No"]].map(([v, l]) => (
          <button key={l} type="button" onClick={() => setTalked(v)}
            className={cn("rounded-lg px-3 py-1 text-xs font-semibold", talked === v ? (v ? "bg-emerald-600 text-white" : "bg-red-500 text-white") : "border border-slate-200 bg-white text-slate-600")}>
            {l}
          </button>
        ))}
        <button type="button" disabled={!note.trim() || m.isPending} onClick={() => m.mutate()}
          className="ml-auto rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
          Confirm
        </button>
      </div>
    </div>
  );
}

export default function Escalations() {
  const { user } = useAuth();
  const [tab, setTab] = useState("open");
  const [region, setRegion] = useState("all");
  const { data = [], isLoading } = useQuery({
    queryKey: ["escalations", tab],
    queryFn: async () => (await api.get("/escalations", { params: { status: tab === "all" ? "" : tab } })).data,
    refetchInterval: 3000,
  });
  const isManager = ["admin", "team_leader", "admin_staff"].includes(user?.role);
  const rows = region === "all" ? data : data.filter((e) => e.region === region);
  const cnt = (r) => (r === "all" ? data.length : data.filter((e) => e.region === r).length);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Escalations</h1>
        <p className="text-sm text-slate-500">
          {isManager ? "All escalated calls · see whether staff spoke to the customer" : "Escalated calls for your state · add notes and confirm"}
        </p>
      </div>
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
      </div>
      {isLoading && <p className="py-10 text-center text-slate-400">Loading…</p>}
      {!isLoading && rows.length === 0 && <p className="py-10 text-center text-slate-400">No escalations</p>}
      <div className="grid gap-3 lg:grid-cols-2">
        {rows.map((e) => {
          const open = e.status === "open";
          const path = e.lead_id ? (e.segment === "driver" ? `/drivers/leads/${e.lead_id}` : `/leads/${e.lead_id}`) : null;
          return (
            <div key={e.id} className={cn("rounded-2xl border bg-white p-4 shadow-sm", open ? "border-red-200" : "border-slate-100")}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {open ? <AlertTriangle className="h-4 w-4 text-red-500" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                    {path ? <Link to={path} className="font-semibold text-primary hover:underline">{e.lead_name || e.customer_number}</Link>
                      : <span className="font-semibold text-slate-900">{e.lead_name || e.customer_number}</span>}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{e.customer_number}</span>
                    <span className="inline-flex items-center gap-1">{e.direction === "incoming" ? <PhoneIncoming className="h-3 w-3" /> : <PhoneOutgoing className="h-3 w-3" />}{e.direction === "incoming" ? "Incoming" : "Outgoing"}</span>
                    <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{e.region}</span>
                  </div>
                </div>
                <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", open ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-700")}>
                  {open ? "Open" : "Completed"}
                </span>
              </div>
              <div className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
                <span className="font-semibold">Reason: </span>{e.reason}
                <div className="mt-1 text-xs text-amber-700">by {e.created_by_name || "Staff"} · {fmt(e.created_at)}</div>
              </div>
              {open ? <ResolveBox esc={e} /> : (
                <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", e.talked ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600")}>
                      {e.talked ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                      {e.talked ? "Spoke to customer" : "Did not speak"}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs text-slate-500"><User className="h-3 w-3" />{e.resolved_name} · {fmt(e.resolved_at)}</span>
                  </div>
                  <p className="mt-2 text-slate-700">{e.note}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
