import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "@/lib/api";

const RING_DURATION_MS = 60000;
const RING_GAP_MS = 1500;
const SEEN_KEY = "myklick_esc_seen_ids";
const FRESH_MS = 3 * 60 * 1000; // on page load, only ring for escalations from the last 3 min

let ctxRef = null;
function audioCtx() {
  if (!ctxRef) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    ctxRef = new Ctx();
  }
  return ctxRef;
}
// Browsers block audio until the user clicks/types once -> unlock on first interaction.
["pointerdown", "keydown", "touchstart"].forEach((ev) =>
  window.addEventListener(ev, () => {
    try { const c = audioCtx(); if (c && c.state !== "running") c.resume().catch(() => {}); } catch (_) {}
    askNotifyPermission();
  }, { passive: true })
);

function chime() {
  try {
    const ctx = audioCtx();
    if (!ctx) return;
    // Never await resume(): without a user gesture it can stay pending forever.
    if (ctx.state !== "running") { ctx.resume().catch(() => {}); return; }
    [660, 990, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.16;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.35);
    });
  } catch (_) {}
}

function loadSeen() {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || "[]")); } catch (_) { return new Set(); }
}
function saveSeen(set) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...set].slice(-300))); } catch (_) {}
}

// Desktop (OS) notification -> visible even when user is on another tab / app.
function askNotifyPermission() {
  try {
    if ("Notification" in window && Notification.permission === "default") {
      const r = Notification.requestPermission();
      if (r && r.catch) r.catch(() => {});
    }
  } catch (_) {}
}
function desktopNotify(e, onOpen) {
  try {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const type = e.segment === "driver" ? "Driver" : "Investor";
    const n = new Notification(`🚨 ${type} Escalation · ${e.region}`, {
      body: `${e.lead_name || e.customer_number} — ${e.reason} · by ${e.created_by_name || "Staff"}`,
      tag: `esc-${e.id}`,
      requireInteraction: true,
    });
    n.onclick = () => { window.focus(); onOpen(); n.close(); };
  } catch (_) {}
}

/** Polls for new escalations (admin: all states, others: own state) -> popup + ringing sound. */
export function EscalationNotifier({ intervalMs = 3000 }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const navRef = useRef(navigate);
  navRef.current = navigate;
  const ringRef = useRef(null);
  const activeRef = useRef(new Map());
  const shownRef = useRef(loadSeen());
  const firstRef = useRef(true);

  const stopRing = () => {
    if (!ringRef.current) return;
    clearInterval(ringRef.current.timer);
    ringRef.current = null;
  };
  const startRing = () => {
    if (ringRef.current) { ringRef.current.stopAt = Date.now() + RING_DURATION_MS; return; }
    const ring = { stopAt: Date.now() + RING_DURATION_MS, timer: null };
    chime();
    ring.timer = setInterval(() => {
      if (Date.now() >= ring.stopAt) return stopRing();
      chime();
    }, RING_GAP_MS);
    ringRef.current = ring;
  };

  useEffect(() => {
    let alive = true;
    let busy = false;
    const tick = async () => {
      if (busy || !alive) return;
      busy = true;
      try {
        // Dedupe by id (not by timestamp) -> immune to date-format / clock differences.
        const since = new Date(Date.now() - 12 * 3600 * 1000).toISOString();
        const { data } = await api.get("/escalations/latest", { params: { since } });
        const first = firstRef.current;
        firstRef.current = false;
        if (!alive || !Array.isArray(data) || !data.length) return;
        let fresh = 0;
        data.forEach((e) => {
          if (shownRef.current.has(e.id)) return;
          shownRef.current.add(e.id);
          const age = Date.now() - new Date(e.created_at).getTime();
          if (first && age > FRESH_MS) return; // old one on page load -> mark seen silently
          activeRef.current.set(e.id, true);
          fresh += 1;
          toast.error(`🚨 ${e.segment === "driver" ? "Driver" : "Investor"} Escalation · ${e.region}`, {
            description: `${e.lead_name || e.customer_number} — ${e.reason} · by ${e.created_by_name || "Staff"}`,
            duration: RING_DURATION_MS,
            closeButton: true,
            id: `esc-${e.id}`,
            action: { label: "Open", onClick: () => { stopRing(); navRef.current("/escalations"); } },
            onDismiss: () => { activeRef.current.delete(e.id); if (!activeRef.current.size) stopRing(); },
          });
          desktopNotify(e, () => { stopRing(); navRef.current("/escalations"); });
        });
        saveSeen(shownRef.current);
        if (fresh) { startRing(); qc.invalidateQueries({ queryKey: ["escalations"] }); }
      } catch (err) {
        console.warn("[escalations] poll failed:", err?.response?.status || err?.message);
      } finally { busy = false; }
    };
    tick();
    const id = setInterval(tick, intervalMs);
    const onVisible = () => { if (document.visibilityState === "visible") tick(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { alive = false; clearInterval(id); document.removeEventListener("visibilitychange", onVisible); stopRing(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Someone handled it -> stop ring + close popup
  useEffect(() => {
    const id = setInterval(async () => {
      if (!activeRef.current.size) return;
      try {
        const { data } = await api.get("/escalations", { params: { status: "open" } });
        const open = new Set((data || []).map((e) => e.id));
        activeRef.current.forEach((_, eid) => {
          if (!open.has(eid)) { activeRef.current.delete(eid); toast.dismiss(`esc-${eid}`); }
        });
        if (!activeRef.current.size) stopRing();
      } catch (_) {}
    }, 5000);
    return () => clearInterval(id);
  }, []);

  return null;
}
