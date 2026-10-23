import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "@/lib/api";

const RING_DURATION_MS = 60000; // ring for 1 minute
const RING_GAP_MS = 1500;       // one chime every 1.5 seconds
const SEEN_KEY = "myklick_common_seen_ids";
const FRESH_MS = 3 * 60 * 1000; // on page load, only ring for leads posted in the last 3 min

let sharedCtx = null;
function getAudioCtx() {
  if (!sharedCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    sharedCtx = new Ctx();
  }
  return sharedCtx;
}
// Unlock audio (and ask desktop-notification permission) on the first click / key press
["pointerdown", "keydown", "touchstart"].forEach((ev) =>
  window.addEventListener(ev, () => {
    try { const c = getAudioCtx(); if (c && c.state !== "running") c.resume().catch(() => {}); } catch (_) {}
    try {
      if ("Notification" in window && Notification.permission === "default") {
        const r = Notification.requestPermission();
        if (r && r.catch) r.catch(() => {});
      }
    } catch (_) {}
  }, { passive: true })
);

// Two-tone chime via Web Audio — no sound file needed.
function playChime() {
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;
    // Never await resume(): without a user gesture it can stay pending forever.
    if (ctx.state !== "running") { ctx.resume().catch(() => {}); return; }
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.4);
    });
  } catch (_) { /* browser blocked audio — popup still shows */ }
}

function desktopNotify(l, onOpen) {
  try {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const type = l.segment === "driver" ? "driver" : "investor";
    const n = new Notification(`New common ${type} lead · ${l.state || "All states"}`, {
      body: `${l.name} · posted by ${l.created_by_name || "Admin"}`,
      tag: `cl-${l.id}`,
    });
    n.onclick = () => { window.focus(); onOpen(); n.close(); };
  } catch (_) {}
}

function loadSeen() {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || "[]")); } catch (_) { return new Set(); }
}
function saveSeen(set) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...set].slice(-300))); } catch (_) {}
}

/** Polls for newly posted common leads (staff: own state only) and alerts with popup + sound. */
export function CommonLeadsNotifier({ intervalMs = 3000 }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const navRef = useRef(navigate);
  navRef.current = navigate;
  const ringRef = useRef(null);
  const activeRef = useRef(new Map());
  const shownRef = useRef(loadSeen());
  const firstRef = useRef(true);

  const stopRing = () => {
    const r = ringRef.current;
    if (!r) return;
    clearInterval(r.timer);
    ringRef.current = null;
  };

  const startRing = () => {
    if (ringRef.current) { ringRef.current.stopAt = Date.now() + RING_DURATION_MS; return; }
    const ring = { stopAt: Date.now() + RING_DURATION_MS, timer: null };
    playChime();
    ring.timer = setInterval(() => {
      if (Date.now() >= ring.stopAt) return stopRing();
      playChime();
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
        const since = new Date(Date.now() - 12 * 3600 * 1000).toISOString();
        const { data } = await api.get("/common-leads/latest", { params: { since } });
        const first = firstRef.current;
        firstRef.current = false;
        if (!alive || !Array.isArray(data) || !data.length) return;
        let fresh = 0;
        data.forEach((l) => {
          if (shownRef.current.has(l.id)) return;
          shownRef.current.add(l.id);
          const age = Date.now() - new Date(l.created_at).getTime();
          if (first && age > FRESH_MS) return; // old lead on page load -> mark seen silently
          fresh += 1;
          activeRef.current.set(l.id, true);
          const path = l.segment === "driver" ? "/drivers/common-leads" : "/common-leads";
          const open = () => { stopRing(); navRef.current(path); };
          toast(`New common ${l.segment === "driver" ? "driver" : "investor"} lead${l.state ? ` · ${l.state}` : ""}`, {
            description: `${l.name} · posted by ${l.created_by_name || "Admin"}`,
            duration: RING_DURATION_MS,
            closeButton: true,
            id: `cl-${l.id}`,
            action: { label: "View", onClick: open },
            onDismiss: () => { activeRef.current.delete(l.id); if (!activeRef.current.size) stopRing(); },
          });
          desktopNotify(l, open);
        });
        saveSeen(shownRef.current);
        if (fresh) { startRing(); qc.invalidateQueries({ queryKey: ["common-leads"] }); }
      } catch (err) {
        console.warn("[common-leads] poll failed:", err?.response?.status || err?.message);
      } finally { busy = false; }
    };
    tick();
    const id = setInterval(tick, intervalMs);
    const onVisible = () => { if (document.visibilityState === "visible") tick(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { alive = false; clearInterval(id); document.removeEventListener("visibilitychange", onVisible); stopRing(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Someone claimed it -> stop ring + close popup for everyone else
  useEffect(() => {
    const id = setInterval(async () => {
      if (!activeRef.current.size) return;
      try {
        const { data } = await api.get("/common-leads");
        const open = new Set((data || []).map((l) => l.id));
        let taken = false;
        activeRef.current.forEach((_, lid) => {
          if (!open.has(lid)) { activeRef.current.delete(lid); toast.dismiss(`cl-${lid}`); taken = true; }
        });
        if (!activeRef.current.size) stopRing();
        if (taken) { toast("Lead already taken", { duration: 3000 }); qc.invalidateQueries({ queryKey: ["common-leads"] }); }
      } catch (_) {}
    }, 4000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
