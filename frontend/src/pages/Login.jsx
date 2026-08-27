import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Zap, Mail, Lock, ArrowRight } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { formatApiErrorDetail } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("admin@route39.in");
  const [password, setPassword] = useState("Route@39");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try { await login(email, password); navigate("/"); }
    catch (err) { setError(formatApiErrorDetail(err.response?.data?.detail) || err.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="flex min-h-screen">
      {/* Left brand panel */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-slate-900 p-12 text-white lg:flex">
        <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-indigo-600/30 blur-3xl" />
        <div className="absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-violet-600/20 blur-3xl" />
        <div className="relative flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary shadow-lg shadow-primary/40">
            <Zap className="h-5 w-5" fill="currentColor" />
          </div>
          <span className="font-display text-2xl font-extrabold">MyKlick</span>
        </div>
        <div className="relative">
          <h1 className="font-display text-5xl font-extrabold leading-tight tracking-tight">
            Your sales<br />command center.
          </h1>
          <p className="mt-5 max-w-md text-lg text-slate-300">
            Leads, calls, WhatsApp, follow-ups and pipeline — beautifully in one place. A CRM your team actually wants to open every morning.
          </p>
          <div className="mt-8 flex gap-3">
            {["Leads", "Calls", "WhatsApp", "Pipeline"].map((t) => (
              <span key={t} className="rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-sm backdrop-blur">{t}</span>
            ))}
          </div>
        </div>
        <div className="relative text-sm text-slate-400">© 2026 MyKlick. Built for velocity.</div>
      </div>

      {/* Right form */}
      <div className="flex w-full items-center justify-center px-6 lg:w-1/2">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white">
              <Zap className="h-5 w-5" fill="currentColor" />
            </div>
            <span className="font-display text-2xl font-extrabold text-slate-900">MyKlick</span>
          </div>
          <h2 className="font-display text-3xl font-bold text-slate-900">Welcome back 👋</h2>
          <p className="mt-1.5 text-slate-500">Sign in to your sales cockpit.</p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input data-testid="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com" required className="rounded-xl py-6 pl-10" />
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input data-testid="login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="Password" required className="rounded-xl py-6 pl-10" />
            </div>
            {error && <p data-testid="login-error" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
            <Button data-testid="login-submit" type="submit" disabled={loading}
              className="group w-full rounded-xl py-6 text-base font-semibold">
              {loading ? "Signing in…" : <>Sign in <ArrowRight className="ml-1 h-4 w-4 transition group-hover:translate-x-1" /></>}
            </Button>
          </form>
          <p className="mt-6 rounded-xl bg-slate-50 px-4 py-3 text-center text-xs text-slate-500">
            Demo admin: <b>admin@route39.in</b> · <b>Route@39</b>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
