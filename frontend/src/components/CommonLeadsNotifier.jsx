import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "@/lib/api";

const RING_DURATION_MS = 60000; // ring for 1 minute
const RING_GAP_MS = 1500;       // one chime every 1.5 seconds

let sharedCtx = null;
function getAudioCtx() {
  if (!sharedCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    sharedCtx = new Ctx();
  }
  return sharedCtx;
}
// Unlock audio on the first click / key press anywhere on the page
["pointerdown", "keydown"].forEach((ev) =>
  window.addEventListener(ev, () => { try { getAudioCtx().resume(); } catch (_) {} })
);

// Two-tone chime via Web Audio — no sound file needed.
function playChime(ctx) {
  try {
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

/** Polls for newly posted common leads and alerts every logged-in staff. */
export function CommonLeadsNotifier({ intervalMs = 15000 }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const navRef = useRef(navigate);
  navRef.current = navigate;
  const sinceRef = useRef((() => {
    try {
      const saved = localStorage.getItem("myklick_common_seen");
      const floor = new Date(Date.now() - 12 * 3600 * 1000).toISOString(); // max 12h back
      return saved && saved > floor ? saved : new Date().toISOString();
    } catch (_) { return new Date().toISOString(); }
  })());
  const ringRef = useRef(null);
  const activeRef = useRef(new Map());

  const stopRing = () => {
    const r = ringRef.current;
    if (!r) return;
    clearInterval(r.timer);
    ringRef.current = null;
  };

  const startRing = async () => {
    if (ringRef.current) { ringRef.current.stopAt = Date.now() + RING_DURATION_MS; return; }
    try {
      const ctx = getAudioCtx();
      if (ctx.state !== "running") await ctx.resume();
      const ring = { ctx, stopAt: Date.now() + RING_DURATION_MS, timer: null };
      playChime(ctx);
      ring.timer = setInterval(() => {
        if (Date.now() >= ring.stopAt) return stopRing();
        playChime(ctx);
      }, RING_GAP_MS);
      ringRef.current = ring;
    } catch (_) {}
  };

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const { data } = await api.get("/common-leads/latest", { params: { since: sinceRef.current } });
        if (!alive || !data?.length) return;
        sinceRef.current = data[data.length - 1].created_at;
        try { localStorage.setItem("myklick_common_seen", sinceRef.current); } catch (_) {}
        await startRing();
        qc.invalidateQueries({ queryKey: ["common-leads"] });
        data.forEach((l) => {
          activeRef.current.set(l.id, true);
          const path = l.segment === "driver" ? "/drivers/common-leads" : "/common-leads";
          toast(`New common ${l.segment === "driver" ? "driver" : "investor"} lead`, {
            description: `${l.name} · posted by ${l.created_by_name || "Admin"}`,
            duration: RING_DURATION_MS,
            closeButton: true,
            id: `cl-${l.id}`,
            action: { label: "View", onClick: () => { stopRing(); navRef.current(path); } },
            onDismiss: () => { activeRef.current.delete(l.id); if (!activeRef.current.size) stopRing(); },
          });
        });
      } catch (_) { /* ignore network blips */ }
    };
    const id = setInterval(tick, intervalMs);
    return () => { alive = false; clearInterval(id); stopRing(); };
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
