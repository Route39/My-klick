import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Inbox, Plus, UserPlus } from "lucide-react";
import { toast } from "sonner";
import api, { formatApiErrorDetail } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { EmptyState } from "@/components/EmptyState";
import { ListSkeleton } from "@/components/Skeletons";
import { formatDay } from "@/lib/constants";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

const EMPTY = { language: "", name: "", phone: "", location: "", remarks: "", region: "" };
const REGIONS = ["Tamil Nadu", "Karnataka"];

function AddCommonLeadDialog({ open, onOpenChange, segment }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(EMPTY);
  const create = useMutation({
    mutationFn: async () => (await api.post("/leads", { language: form.language,
      ...form, whatsapp: form.phone, segment, is_common: true, source: "manual", status: "new",
    })).data,
    onSuccess: () => {
      toast.success("Common lead posted — all staff notified");
      setForm(EMPTY);
      onOpenChange(false);
      qc.invalidateQueries({ queryKey: ["common-leads"] });
    },
    onError: (e) => toast.error(formatApiErrorDetail(e.response?.data?.detail)),
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="rounded-3xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New common {segment === "driver" ? "driver" : "investor"} lead</DialogTitle>
        </DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
          <div><Label>Name *</Label><Input required className="rounded-xl" value={form.name} onChange={set("name")} /></div>
          <div><Label>Phone *</Label><Input required type="tel" className="rounded-xl" value={form.phone} onChange={set("phone")} /></div>
          <div><Label>State *</Label>
            <select required value={form.region} onChange={set("region")}
              className="h-10 w-full rounded-xl border border-input bg-transparent px-3 text-sm">
              <option value="">Select state</option>
              {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <p className="mt-1 text-xs text-slate-400">Only staff of this state get notified</p>
          </div>
          <div><Label>City / Location</Label><Input className="rounded-xl" value={form.location} onChange={set("location")} /></div>
          <div><Label>Language</Label><div className="mt-1.5 flex flex-wrap gap-2">{["Tamil", "English", "Kannada", "Hindi", "Telugu", "Malayalam"].map((lg) => { const on = (form.language || "").split(", ").includes(lg); return <button type="button" key={lg} onClick={() => setForm((f) => { const cur = (f.language || "").split(", ").filter(Boolean); return { ...f, language: (on ? cur.filter((x) => x !== lg) : [...cur, lg]).join(", ") }; })} className={`rounded-full border px-3 py-1 text-xs font-medium transition ${on ? "border-violet-600 bg-violet-600 text-white" : "border-slate-200 text-slate-600 hover:border-violet-300"}`}>{lg}</button>; })}</div></div>
          <div><Label>Remarks</Label><Input className="rounded-xl" value={form.remarks} onChange={set("remarks")} /></div>
          <Button type="submit" className="w-full rounded-xl" disabled={create.isPending || !form.region || !form.name.trim() || form.phone.replace(/\D/g, "").length < 10}>
            {create.isPending ? "Posting..." : form.region ? `Post to ${form.region} staff` : "Post to staff"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function StatCard({ label, value, tone = "" }) {
  return (
    <div className={`rounded-2xl border border-slate-200/70 bg-white p-4 ${tone}`}>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-3xl font-extrabold text-slate-900">{value}</div>
    </div>
  );
}

const LANGS = ["Tamil", "English", "Kannada", "Hindi", "Telugu", "Malayalam"];

function CommonLeadsReport({ segment, endpoint = "/common-leads/report", onClaim, claiming, canOpen }) {
  const navigate = useNavigate();
  const [taken, setTaken] = useState("all");
  const [region, setRegion] = useState("all");
  const [city, setCity] = useState("");
  const [lang, setLang] = useState("all");
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["common-leads", "report", segment, endpoint],
    queryFn: async () => (await api.get(endpoint, { params: { segment } })).data,
    refetchInterval: 15000,
  });
  const c = city.trim().toLowerCase();
  const scoped = rows
    .filter((r) => region === "all" || (r.region || "") === region)
    .filter((r) => !c || (r.location || "").toLowerCase().includes(c))
    .filter((r) => lang === "all" || (r.language || "").split(/,\s*/).includes(lang));
  const takenCount = scoped.filter((r) => r.assigned_to).length;
  const list = scoped.filter((r) => taken === "all" || (taken === "taken" ? r.assigned_to : !r.assigned_to));
  const leadPath = segment === "driver" ? "/drivers/leads" : "/leads";
  const chip = (k, l) => (
    <button key={k} onClick={() => setTaken(k)}
      className={`rounded-xl border px-3 py-1.5 text-sm ${taken === k ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-200 bg-white text-slate-600"}`}>{l}</button>
  );
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Total Common Leads" value={scoped.length} />
        <StatCard label="Taken" value={takenCount} tone="!border-emerald-200" />
        <StatCard label="Not Taken" value={scoped.length - takenCount} tone="!border-amber-200" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {chip("all", "All")}{chip("taken", "Taken")}{chip("open", "Not Taken")}
        <select value={region} onChange={(e) => setRegion(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm">
          <option value="all">All States</option>
          {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Filter by city..."
          className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm" />
        <select value={lang} onChange={(e) => setLang(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm">
          <option value="all">All Languages</option>
          {LANGS.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>
      {isLoading ? <ListSkeleton /> : list.length === 0 ? (
        <EmptyState icon={Inbox} title="No common leads" subtitle="Nothing matches these filters." />
      ) : (
        <div className="overflow-x-auto rounded-3xl border border-slate-200/70 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Lead</th><th className="px-4 py-3">State / City</th>
                <th className="px-4 py-3">Posted</th><th className="px-4 py-3">Taken by</th>
                <th className="px-4 py-3">Lead Status</th>
                {onClaim && <th className="px-4 py-3"></th>}
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id} onClick={() => (!canOpen || canOpen(r)) && navigate(`${leadPath}/${r.id}`)}
                  className="cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3"><div className="font-semibold text-slate-900">{r.name}</div><div className="text-xs text-slate-500">{r.phone}{r.language && <span className="ml-2 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-700">🗣 {r.language}</span>}</div></td>
                  <td className="px-4 py-3"><div>{r.region || <span className="text-red-500">No state</span>}</div><div className="text-xs text-slate-500">{r.location || "—"}</div></td>
                  <td className="px-4 py-3"><div>{r.created_by_name || "Admin"}</div><div className="text-xs text-slate-500">{formatDay(r.created_at)}</div></td>
                  <td className="px-4 py-3">
                    {r.assigned_to ? (
                      <><div className="font-medium text-slate-900">{r.assigned_name}</div>
                        <div className="text-xs text-slate-500">{r.claimed_at ? formatDay(r.claimed_at) : ""}</div></>
                    ) : <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">Not taken</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold capitalize text-slate-700">{(r.status || "new").replace(/_/g, " ")}</span>
                  </td>
                  {onClaim && (
                    <td className="px-4 py-3 text-right">
                      {!r.assigned_to && (
                        <Button size="sm" className="rounded-xl" disabled={claiming}
                          onClick={(e) => { e.stopPropagation(); onClaim(r.id); }}>
                          <UserPlus className="mr-1 h-4 w-4" /> Assign to me
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StaffRegions() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: users = [] } = useQuery({ queryKey: ["users"], queryFn: async () => (await api.get("/users")).data });
  const save = useMutation({
    mutationFn: async ({ id, region }) => (await api.put(`/team/${id}/region`, { region })).data,
    onSuccess: () => { toast.success("State updated"); qc.invalidateQueries({ queryKey: ["users"] }); },
    onError: (e) => toast.error(formatApiErrorDetail(e.response?.data?.detail)),
  });
  const staff = users.filter((u) => u.role === "sales");
  const missing = staff.filter((u) => !u.region).length;
  return (
    <div className="rounded-3xl border border-slate-200/70 bg-white">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-5 py-4 text-left">
        <span className="font-semibold text-slate-900">Staff States</span>
        <span className="text-xs text-slate-500">
          {missing > 0 ? <span className="text-red-500">{missing} staff without state (no notifications)</span> : "All staff assigned"} · {open ? "Hide" : "Edit"}
        </span>
      </button>
      {open && (
        <div className="border-t border-slate-100">
          {staff.map((u) => (
            <div key={u.id} className="flex items-center justify-between border-b border-slate-50 px-5 py-3 last:border-0">
              <span className="text-sm text-slate-800">{u.name}</span>
              <select value={u.region || ""} onChange={(e) => save.mutate({ id: u.id, region: e.target.value })}
                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm">
                <option value="">— Not set —</option>
                {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CommonLeads({ segment = "investor" }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const isManager = ["admin", "team_leader", "admin_staff"].includes(user?.role);
  const canPost = isManager || user?.role === "admin_staff";
  const myLeadsPath = segment === "driver" ? "/drivers/leads" : "/leads";

  const { data: leads = [] } = useQuery({
    queryKey: ["common-leads", segment],
    queryFn: async () => (await api.get("/common-leads", { params: { segment } })).data,
    refetchInterval: 15000,
  });

  const claim = useMutation({
    mutationFn: async (id) => (await api.post(`/common-leads/${id}/claim`)).data,
    onSuccess: (lead) => {
      toast.success(`${lead.name} added to your leads`, {
        action: { label: "Open", onClick: () => navigate(`${myLeadsPath}/${lead.id}`) },
      });
      qc.invalidateQueries({ queryKey: ["common-leads"] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
    onError: (e) => {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
      qc.invalidateQueries({ queryKey: ["common-leads"] });
    },
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-slate-900">Common Leads</h1>
          <p className="mt-1 text-sm text-slate-500">
            {leads.length} open {segment === "driver" ? "driver" : "investor"} leads · first to assign gets it
          </p>
        </div>
        {canPost && (
          <Button className="rounded-xl" onClick={() => setAddOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Common Lead
          </Button>
        )}
      </div>

      <div className="space-y-4">
        <CommonLeadsReport segment={segment}
          endpoint={isManager ? "/common-leads/report" : "/common-leads/report-mine"}
          onClaim={(id) => claim.mutate(id)} claiming={claim.isPending}
          canOpen={(r) => isManager || r.assigned_to === user?.id} />
        {isManager && <StaffRegions />}
      </div>

      <AddCommonLeadDialog open={addOpen} onOpenChange={setAddOpen} segment={segment} />
    </div>
  );
}
