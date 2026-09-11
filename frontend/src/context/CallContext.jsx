import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PhoneOff, MicOff, Mic } from "lucide-react";
import api, { formatApiErrorDetail } from "@/lib/api";
import { Avatar } from "@/components/InitialsAvatar";
import { toast } from "sonner";

const CallContext = createContext(null);
export const useCall = () => useContext(CallContext);

export function CallProvider({ children }) {
  const [lead, setLead] = useState(null);
  const [callId, setCallId] = useState(null);
  const [seconds, setSeconds] = useState(0);
  const [muted, setMuted] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [callStatus, setCallStatus] = useState("initiated"); // initiated, ringing, in-progress, completed
  
  const timer = useRef(null);
  const poller = useRef(null);

  const startCall = async (l) => {
    if (connecting || lead) return;
    setConnecting(true);
    try {
      const { data } = await api.post(`/leads/${l.id}/call`);
      setCallId(data.id);
      setLead(l);
      setSeconds(0);
      setMuted(false);
      setCallStatus("ringing");
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Unable to connect the call right now. Please try again.");
    } finally {
      setConnecting(false);
    }
  };

  const startManualCall = async (from_number, to_number, segment = 'investor') => {
    if (connecting || lead) return;
    setConnecting(true);
    try {
      const { data } = await api.post('/exotel/manual_call', { from_number, to_number, segment });
      setCallId(data.call_id);
      setLead({ id: "manual", name: "Manual Call", phone: to_number });
      setSeconds(0);
      setMuted(false);
      setCallStatus("ringing");
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Could not initiate manual call");
    } finally {
      setConnecting(false);
    }
  };

  useEffect(() => {
    if (lead && callId) {
      // Local Timer (only ticks when in-progress)
      timer.current = setInterval(() => {
        setCallStatus((prevStatus) => {
          if (prevStatus === "in-progress" || prevStatus === "connected") {
            setSeconds((s) => s + 1);
          }
          return prevStatus;
        });
      }, 1000);
      
      // Real-time Poller for Exotel Status
      poller.current = setInterval(async () => {
        try {
          const { data } = await api.get(`/calls/${callId}/sync`);
          const status = data.status || "ringing";
          
          if (status === "in-progress" || status === "connected") {
            setCallStatus("connected");
            // Sync duration if exotel already recorded it
            if (data.duration_seconds && data.duration_seconds > seconds) {
               setSeconds(data.duration_seconds);
            }
          } else if (status === "completed" || status === "failed" || status === "busy" || status === "no-answer" || status === "canceled") {
            // Call physically ended! Auto-close!
            toast.success("Call ended", { description: `Duration: ${fmt(data.duration_seconds || seconds)}` });
            setLead(null);
            setCallId(null);
            setCallStatus("initiated");
          } else {
             setCallStatus("ringing");
          }
        } catch (e) {
          // Ignore polling errors
        }
      }, 800);
      
      return () => {
        clearInterval(timer.current);
        clearInterval(poller.current);
      };
    }
  }, [lead, callId]);

  const endCall = async () => {
    clearInterval(timer.current);
    clearInterval(poller.current);
    const dur = seconds;
    const name = lead?.name;
    const cid = callId;
    
    setLead(null);
    setCallId(null);
    setSeconds(0);
    setCallStatus("initiated");
    
    if (cid) {
      try {
        await api.patch(`/calls/${cid}/complete`, { duration_seconds: dur, status: "completed" });
        toast.success("Call logged ✓", { description: `${name} · ${fmt(dur)}` });
      } catch (e) {
        toast.error("Could not save call log");
      }
    }
  };

  return (
    <CallContext.Provider value={{ startCall, startManualCall, endCall, activeLead: lead, connecting }}>
      {children}
      <AnimatePresence>
        {lead && (
          <motion.div
            data-testid="call-panel"
            initial={{ opacity: 0, y: 40, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 300, damping: 26 }}
            className="fixed bottom-24 right-4 z-[60] w-[290px] rounded-3xl border border-white/60 p-6 text-center shadow-2xl glass lg:bottom-6 lg:right-6"
          >
            <div className="mx-auto w-fit">
              <motion.span
                className="absolute inset-0 -z-10 m-auto h-24 w-24 rounded-full bg-emerald-400/20"
                animate={{ scale: [1, 1.4, 1], opacity: [0.6, 0, 0.6] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
              <Avatar name={lead.name} size={72} />
            </div>
            <h3 className="mt-4 font-display text-lg font-bold text-slate-900">{lead.name}</h3>
            <p className="mt-0.5 text-sm font-medium text-slate-500">{lead.phone}</p>
            
            {callStatus === "ringing" ? (
              <p className="mt-1 font-display text-xl font-bold text-slate-500 animate-pulse py-1.5">Ringing...</p>
            ) : (
              <p className="mt-1 font-display text-3xl font-bold tabular-nums text-slate-900">{fmt(seconds)}</p>
            )}
            
            <div className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> 
              {callStatus === "ringing" ? "Calling" : "Connected"}
            </div>
            
            <div className="mt-4 flex items-end justify-center gap-1 h-8">
              {Array.from({ length: 9 }).map((_, i) => (
                <motion.span key={i} className="w-1 rounded-full bg-emerald-500/70"
                  animate={{ height: muted ? 4 : [6, 22, 10, 26, 8][i % 5] }}
                  transition={{ duration: 0.6, repeat: Infinity, repeatType: "reverse", delay: i * 0.08 }}
                />
              ))}
            </div>
            <div className="mt-5 flex items-center justify-center gap-4">
              <button data-testid="call-end-btn" onClick={endCall}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500 text-white shadow-lg shadow-red-500/30 transition hover:bg-red-600 active:scale-90">
                <PhoneOff className="h-6 w-6" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </CallContext.Provider>
  );
}

function fmt(s) {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const sec = (s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}
