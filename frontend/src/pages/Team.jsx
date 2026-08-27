import React from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Trophy, Medal, Award } from "lucide-react";
import api from "@/lib/api";
import { Avatar } from "@/components/InitialsAvatar";
import { ListSkeleton } from "@/components/Skeletons";
import { formatINR } from "@/lib/constants";
import { cn } from "@/lib/utils";

const RANK = [
  { icon: Trophy, color: "text-amber-500 bg-amber-50" },
  { icon: Medal, color: "text-slate-400 bg-slate-100" },
  { icon: Award, color: "text-orange-500 bg-orange-50" },
];

export default function Team() {
  const { data = [], isLoading } = useQuery({ queryKey: ["team"], queryFn: async () => (await api.get("/team")).data });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-slate-900">Team Performance</h1>
        <p className="mt-1 text-slate-500">How your sales team is performing</p>
      </div>

      {isLoading ? <ListSkeleton count={4} /> : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((m, i) => {
            const rank = RANK[i];
            return (
              <motion.div key={m.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.05, 0.3) }}
                data-testid={`team-card-${m.id}`}
                className="rounded-2xl border border-slate-200/60 bg-white p-5 card-lift">
                <div className="flex items-center gap-3">
                  <Avatar name={m.name} size={48} />
                  <div className="flex-1">
                    <div className="font-display font-bold text-slate-900">{m.name}</div>
                    <div className="text-xs capitalize text-slate-400">{m.role}</div>
                  </div>
                  {rank && <div className={cn("flex h-8 w-8 items-center justify-center rounded-full", rank.color)}><rank.icon className="h-4 w-4" /></div>}
                </div>

                <div className="mt-5 grid grid-cols-3 gap-2 text-center">
                  <Stat value={m.leads} label="Leads" />
                  <Stat value={m.contacted} label="Contacted" />
                  <Stat value={m.converted} label="Won" accent />
                </div>

                <div className="mt-5">
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-500">Conversion</span>
                    <span className="font-display font-bold text-slate-900">{m.conversion_rate}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <motion.div className="h-full rounded-full bg-gradient-to-r from-primary to-violet-500"
                      initial={{ width: 0 }} animate={{ width: `${m.conversion_rate}%` }} transition={{ duration: 0.8, delay: 0.2 }} />
                  </div>
                </div>

                {m.value > 0 && (
                  <div className="mt-4 rounded-xl bg-emerald-50 px-3 py-2 text-center">
                    <span className="font-display text-lg font-bold text-emerald-700">{formatINR(m.value)}</span>
                    <span className="ml-1 text-xs text-emerald-600/70">revenue</span>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ value, label, accent }) {
  return (
    <div className={cn("rounded-xl py-2.5", accent ? "bg-emerald-50" : "bg-slate-50")}>
      <div className={cn("font-display text-xl font-extrabold", accent ? "text-emerald-600" : "text-slate-900")}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  );
}
