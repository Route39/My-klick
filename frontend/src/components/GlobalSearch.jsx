import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { Avatar } from "@/components/InitialsAvatar";
import { StatusBadge } from "@/components/Badges";
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from "@/components/ui/command";
import { Lock, User, UserCheck } from "lucide-react";

export function GlobalSearch({ open, onOpenChange, segment }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState({ leads: [], customers: [], locked: [] });
  const navigate = useNavigate();

  useEffect(() => {
    if (!q) { setRes({ leads: [], customers: [], locked: [] }); return; }
    const t = setTimeout(async () => {
      try { const d = (await api.get(`/search?q=${encodeURIComponent(q)}&segment=${segment || ""}`)).data; setRes({ leads: d.leads || [], customers: d.customers || [], locked: d.locked || [] }); } catch (e) {}
    }, 180);
    return () => clearTimeout(t);
  }, [q, segment]);

  const go = (path) => { onOpenChange(false); setQ(""); navigate(path); };

  return (
    <CommandDialog shouldFilter={false} open={open} onOpenChange={onOpenChange}>
      <CommandInput data-testid="global-search-input" placeholder="Search MyKlick — leads, customers, phone…"
        value={q} onValueChange={setQ} />
      <CommandList>
        <CommandEmpty>{q ? "No matches found." : "Start typing to search…"}</CommandEmpty>
        {res.leads.length > 0 && (
          <CommandGroup heading="Leads">
            {res.leads.map((l) => (
              <CommandItem key={l.id} value={`lead-${l.id}-${l.name}`} onSelect={() => go(segment === "driver" ? `/drivers/leads/${l.id}` : `/leads/${l.id}`)}
                className="gap-3 py-2.5">
                <Avatar name={l.name} size={32} />
                <div className="flex-1">
                  <div className="font-medium text-slate-900">{l.name}</div>
                  <div className="text-xs text-slate-400">{l.phone}</div>
                </div>
                <StatusBadge status={l.status} />
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {res.locked.length > 0 && (
          <CommandGroup heading="Already with another staff">
            {res.locked.map((l) => (
              <CommandItem key={`locked-${l.id}`} value={`locked-${l.id}-${l.name}`} onSelect={() => {}}
                className="gap-3 py-2.5 opacity-90 cursor-not-allowed" data-testid={`search-locked-${l.id}`}>
                <div className="h-8 w-8 rounded-full bg-amber-100 flex items-center justify-center"><Lock className="h-4 w-4 text-amber-700" /></div>
                <div className="flex-1">
                  <div className="font-medium text-slate-900">{l.name}</div>
                  <div className="text-xs text-slate-500">{l.phone} · Owner: <span className="font-semibold text-amber-700">{l.owner}</span></div>
                </div>
                <StatusBadge status={l.status} />
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {res.customers.length > 0 && (
          <CommandGroup heading="Customers">
            {res.customers.map((c) => (
              <CommandItem key={c.id} value={`cust-${c.id}-${c.name}`} onSelect={() => go(`/customers`)}
                className="gap-3 py-2.5">
                <UserCheck className="h-4 w-4 text-emerald-600" />
                <div className="flex-1"><div className="font-medium text-slate-900">{c.name}</div>
                  <div className="text-xs text-slate-400">{c.phone}</div></div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
