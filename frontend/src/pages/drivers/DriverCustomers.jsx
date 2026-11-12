import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { UserCheck, Phone, MessageCircle, Trophy, Trash2 } from "lucide-react";
import api from "@/lib/api";
import { Avatar } from "@/components/InitialsAvatar";
import { SourceBadge } from "@/components/Badges";
import { EmptyState } from "@/components/EmptyState";
import { ListSkeleton } from "@/components/Skeletons";
import { fullINR, formatINR, formatDay } from "@/lib/constants";

export default function DriverCustomers({ segment = "driver" }) {
  const qc = useQueryClient();
  const delCust = async (e, c) => {
    e.stopPropagation();
    if (!window.confirm(`Delete ${c.name}? This also deletes the linked lead.`)) return;
    try { if (c.lead_id) await api.delete(`/leads/${c.lead_id}`); else throw 0; }
    catch { await api.delete(`/customers/${c.id}`).catch(() => {}); }
    qc.invalidateQueries();
  };
  const navigate = useNavigate();
  // const { data = [], isLoading } = useQuery({
  //   queryKey: ["leads", "interested-drivers"],
  //   queryFn: async () => (await api.get("/leads", { params: { segment: "driver", status: "interested" } })).data,
  //   refetchInterval: 15000,
  // });
  const { data = [], isLoading } = useQuery({ queryKey: ["customers", segment], queryFn: async () => (await api.get("/customers", { params: { segment } })).data });
  const totalValue = data.reduce((a, c) => a + (c.value || 0), 0);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-slate-900">Converted Drivers</h1>
          <p className="mt-1 text-slate-500">{data.length} converted drivers</p>
        </div>
        {data.length > 0 && (
          <div className="rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-3 text-white">
            <div className="text-xs font-medium uppercase tracking-wide text-white/80">Total revenue</div>
            <div className="font-display text-2xl font-extrabold">{fullINR(totalValue)}</div>
          </div>
        )}
      </div>

      {isLoading ? <ListSkeleton count={4} /> : data.length === 0 ? (
        <EmptyState icon={Trophy} title="No converted drivers yet." subtitle="Drivers whose status is Converted will appear here." testid="customers-empty" />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 d1440:grid-cols-4">
          {data.map((c, i) => (
            <motion.div key={c.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.04, 0.3) }}
              data-testid={`customer-card-${c.id}`}
              onClick={() => navigate(`/drivers/customers/${c.id}`)}
              className="cursor-pointer rounded-2xl border border-slate-200/60 bg-white p-5 card-lift">
              <div className="flex items-center gap-3">
                <Avatar name={c.name} size={48} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-display font-bold text-slate-900">{c.name}</div>
                  <div className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold text-emerald-600"><UserCheck className="h-3 w-3" /> Customer</div>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between gap-2 rounded-xl bg-emerald-50 px-3 py-2.5">
                <div className="font-display text-xl font-extrabold text-emerald-700">{fullINR(c.value)}</div>
                <div className="text-[11px] text-emerald-600/70">converted {formatDay(c.converted_at)}</div>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                <SourceBadge source={c.source} /><span>{c.assigned_name}</span>
              </div>
              <div className="mt-3 flex gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {c.phone}</span>
                  <button onClick={(e) => delCust(e, c)} title="Delete" className="ml-auto rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
