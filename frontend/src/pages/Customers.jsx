import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { UserCheck, Phone, MessageCircle, Trophy } from "lucide-react";
import api from "@/lib/api";
import { Avatar } from "@/components/InitialsAvatar";
import { SourceBadge } from "@/components/Badges";
import { EmptyState } from "@/components/EmptyState";
import { ListSkeleton } from "@/components/Skeletons";
import { fullINR, formatINR, formatDay } from "@/lib/constants";

export default function Customers() {
  const navigate = useNavigate();
  const { data = [], isLoading } = useQuery({ queryKey: ["customers"], queryFn: async () => (await api.get("/customers")).data });
  const totalValue = data.reduce((a, c) => a + (c.value || 0), 0);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-slate-900">Customers</h1>
          <p className="mt-1 text-slate-500">{data.length} converted customers</p>
        </div>
        {data.length > 0 && (
          <div className="rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-3 text-white">
            <div className="text-xs font-medium uppercase tracking-wide text-white/80">Total revenue</div>
            <div className="font-display text-2xl font-extrabold">{fullINR(totalValue)}</div>
          </div>
        )}
      </div>

      {isLoading ? <ListSkeleton count={4} /> : data.length === 0 ? (
        <EmptyState icon={Trophy} title="Your first conversion is waiting." subtitle="Convert a lead to see your customers appear here." testid="customers-empty" />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((c, i) => (
            <motion.div key={c.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.04, 0.3) }}
              data-testid={`customer-card-${c.id}`}
              onClick={() => navigate(`/customers/${c.id}`)}
              className="cursor-pointer rounded-2xl border border-slate-200/60 bg-white p-5 card-lift">
              <div className="flex items-center gap-3">
                <Avatar name={c.name} size={48} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-display font-bold text-slate-900">{c.name}</div>
                  <div className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600"><UserCheck className="h-3 w-3" /> Customer</div>
                </div>
              </div>
              <div className="mt-4 rounded-xl bg-emerald-50 px-3 py-2.5 text-center">
                <div className="font-display text-xl font-extrabold text-emerald-700">{fullINR(c.value)}</div>
                <div className="text-[11px] text-emerald-600/70">converted {formatDay(c.converted_at)}</div>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                <SourceBadge source={c.source} /><span>{c.assigned_name}</span>
              </div>
              <div className="mt-3 flex gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {c.phone}</span>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
