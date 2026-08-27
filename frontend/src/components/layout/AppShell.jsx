import React, { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Users, KanbanSquare, CalendarClock, UserCheck, BarChart3,
  Search, Plus, LogOut, Menu, MoreHorizontal, Zap,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { CallProvider } from "@/context/CallContext";
import { GlobalSearch } from "@/components/GlobalSearch";
import { AddLeadDialog } from "@/components/AddLeadDialog";
import { Avatar } from "@/components/InitialsAvatar";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/leads", label: "Leads", icon: Users },
  { to: "/pipeline", label: "Pipeline", icon: KanbanSquare },
  { to: "/followups", label: "Follow-ups", icon: CalendarClock },
  { to: "/customers", label: "Customers", icon: UserCheck },
  { to: "/team", label: "Team", icon: BarChart3 },
];

const MOBILE_NAV = [
  { to: "/", label: "Home", icon: LayoutDashboard, end: true },
  { to: "/leads", label: "Leads", icon: Users },
  { to: "/pipeline", label: "Pipeline", icon: KanbanSquare },
  { to: "/followups", label: "Follow-ups", icon: CalendarClock },
];

export default function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const isManager = ["admin", "team_leader"].includes(user?.role);
  const navItems = NAV.filter((n) => n.label !== "Team" || isManager);

  useEffect(() => {
    const h = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setSearchOpen((o) => !o); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  return (
    <CallProvider>
      <div className="min-h-screen bg-background">
        {/* Sidebar (desktop) */}
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-slate-200/70 bg-white lg:flex">
          <div className="flex items-center gap-2.5 px-6 py-6">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white shadow-lg shadow-primary/30">
              <Zap className="h-5 w-5" fill="currentColor" />
            </div>
            <span className="font-display text-xl font-extrabold tracking-tight text-slate-900">MyKlick</span>
          </div>
          <nav className="flex-1 space-y-1 px-3">
            {navItems.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} data-testid={`nav-${n.label.toLowerCase()}`}
                className={({ isActive }) => cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
                  isActive ? "bg-accent text-primary" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                )}>
                <n.icon className="h-[18px] w-[18px]" /> {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="border-t border-slate-100 p-3">
            <div className="flex items-center gap-3 rounded-xl px-2 py-2">
              <Avatar name={user?.name || "U"} size={36} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-slate-900">{user?.name}</div>
                <div className="truncate text-xs capitalize text-slate-400">{user?.role?.replace("_", " ")}</div>
              </div>
              <button data-testid="logout-btn" onClick={() => { logout(); navigate("/login"); }}
                className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-500">
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </aside>

        {/* Main */}
        <div className="lg:pl-64">
          {/* Top bar */}
          <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200/60 px-4 py-3 glass lg:px-8">
            <div className="flex items-center gap-2 lg:hidden">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white">
                <Zap className="h-4 w-4" fill="currentColor" />
              </div>
              <span className="font-display text-lg font-extrabold text-slate-900">MyKlick</span>
            </div>
            <button data-testid="open-search-btn" onClick={() => setSearchOpen(true)}
              className="ml-auto flex items-center gap-2 rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-sm text-slate-400 transition hover:border-slate-300 sm:w-72 lg:ml-0">
              <Search className="h-4 w-4" />
              <span className="hidden sm:inline">Search MyKlick…</span>
              <kbd className="ml-auto hidden rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 sm:inline">⌘K</kbd>
            </button>
            <button data-testid="quick-add-lead-btn" onClick={() => setAddOpen(true)}
              className="ml-auto flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-sm font-semibold text-white shadow-lg shadow-primary/25 transition hover:bg-indigo-700 active:scale-95 lg:ml-3">
              <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Lead</span>
            </button>
          </header>

          <main className="px-4 pb-28 pt-4 lg:px-8 lg:pb-10 lg:pt-6">
            <Outlet context={{ openAdd: () => setAddOpen(true) }} />
          </main>
        </div>

        {/* Mobile bottom nav */}
        <nav className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-slate-200/60 px-2 py-2 glass lg:hidden">
          {MOBILE_NAV.slice(0, 2).map((n) => <MobileTab key={n.to} {...n} />)}
          <button data-testid="mobile-quick-add" onClick={() => setAddOpen(true)}
            className="-mt-8 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-xl shadow-primary/40 active:scale-90">
            <Plus className="h-6 w-6" />
          </button>
          {MOBILE_NAV.slice(2).map((n) => <MobileTab key={n.to} {...n} />)}
        </nav>

        <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
        <AddLeadDialog open={addOpen} onOpenChange={setAddOpen} />
      </div>
    </CallProvider>
  );
}

function MobileTab({ to, label, icon: Icon, end }) {
  return (
    <NavLink to={to} end={end} data-testid={`mobile-nav-${label.toLowerCase()}`}
      className={({ isActive }) => cn(
        "flex flex-1 flex-col items-center gap-0.5 py-1 text-[10px] font-medium transition",
        isActive ? "text-primary" : "text-slate-400"
      )}>
      <Icon className="h-5 w-5" /> {label}
    </NavLink>
  );
}
