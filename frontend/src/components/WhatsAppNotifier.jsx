import { useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "@/lib/api";

const RING_DURATION_MS = 60000; // ring for 1 minute
const RING_GAP_MS = 1500;       // one chime every 1.5 seconds

let sharedCtx = null;
function getCtx() {
  if (!sharedCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    sharedCtx = new Ctx();
  }
  return sharedCtx;
}
function chime(ctx) {
  try {
    [660, 990, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.14;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.32);
    });
  } catch (_) {}
}

/** Polls for new incoming WhatsApp messages: rings for 1 min until the chat is viewed, shows a popup. */
export function WhatsAppNotifier({ intervalMs = 5000 }) {
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const navRef = useRef(navigate);
  navRef.current = navigate;
  const sinceRef = useRef(new Date().toISOString());
  const ringRef = useRef(null);
  const pendingRef = useRef(new Map()); // lead_id -> toast id

  const stopRing = () => {
    const r = ringRef.current;
    if (!r) return;
    clearInterval(r.timer);
    ringRef.current = null;
  };

  const startRing = async () => {
    if (ringRef.current) { ringRef.current.stopAt = Date.now() + RING_DURATION_MS; return; }
    try {
      const ctx = getCtx();
      if (ctx.state !== "running") await ctx.resume();
      const ring = { stopAt: Date.now() + RING_DURATION_MS, timer: null };
      chime(ctx);
      ring.timer = setInterval(() => {
        if (Date.now() >= ring.stopAt) return stopRing();
        chime(ctx);
      }, RING_GAP_MS);
      ringRef.current = ring;
    } catch (_) {}
  };

  const markViewed = (leadId) => {
    const tid = pendingRef.current.get(leadId);
    if (tid !== undefined) toast.dismiss(tid);
    pendingRef.current.delete(leadId);
    api.post(`/leads/${leadId}/messages/read`).catch(() => {});
    qc.invalidateQueries({ queryKey: ["wa-unread"] });
    if (pendingRef.current.size === 0) stopRing();
  };

  useEffect(() => {
    const m = location.pathname.match(/^\/(?:drivers\/)?leads\/([^/]+)/);
    if (m && pendingRef.current.has(m[1])) markViewed(m[1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const { data } = await api.get("/whatsapp/latest", { params: { since: sinceRef.current } });
        if (!alive || !data) return;
        if (data.last) sinceRef.current = data.last;
        const items = data.items || [];
        if (!items.length) return;
        const ids = new Set(items.map((m) => m.lead_id));
        qc.invalidateQueries({ predicate: (q) => (q.queryKey || []).some((k) => ids.has(String(k))) });
        qc.invalidateQueries({ queryKey: ["wa-unread"] });
        window.dispatchEvent(new CustomEvent("wa:new-messages", { detail: items }));

        const current = window.location.pathname;
        const fresh = items.filter((m) => current !== `/leads/${m.lead_id}` && current !== `/drivers/leads/${m.lead_id}`);
        if (!fresh.length) return;
        await startRing();
        fresh.forEach((m) => {
          const old = pendingRef.current.get(m.lead_id);
          if (old !== undefined) toast.dismiss(old);
          const tid = toast(`💬 ${m.lead_name || "WhatsApp"}`, {
            description: m.text,
            duration: RING_DURATION_MS,
            closeButton: true,
            action: { label: "View", onClick: () => {
              markViewed(m.lead_id);
              const drv = m.segment === "driver";
              if (m.is_common) { navRef.current(drv ? "/drivers/common-leads" : "/common-leads"); return; }
              navRef.current(drv ? `/drivers/leads/${m.lead_id}?tab=whatsapp` : `/leads/${m.lead_id}?tab=whatsapp`);
              [300, 800, 1500].forEach((ms) => setTimeout(() => document.getElementById("wa-tab-trigger")?.click(), ms));
            } },
            onDismiss: () => markViewed(m.lead_id),
          });
          pendingRef.current.set(m.lead_id, tid);
        });
      } catch (_) {}
    };
    const id = setInterval(tick, intervalMs);
    return () => { alive = false; clearInterval(id); stopRing(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
