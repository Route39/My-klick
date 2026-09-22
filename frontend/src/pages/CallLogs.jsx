import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Phone, PhoneCall, History, Loader2, Play } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { motion } from "framer-motion";
import api, { formatApiErrorDetail } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/InitialsAvatar";
import { useCall } from "@/context/CallContext";
import { useAuth } from "@/context/AuthContext";
import { useSearchParams } from "react-router-dom";
import { Calendar as CalendarIcon, User } from "lucide-react";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEffect } from "react";

export default function CallLogs({ segment = '' }) {
  const { user } = useAuth();
  const isManager = ["admin", "team_leader"].includes(user?.role);
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { startManualCall, connecting } = useCall();
  const [fromNumber, setFromNumber] = useState("");
  
  const date_from = params.get("date_from") || "";
  const date_to = params.get("date_to") || "";
  const assigned_to = params.get("assigned_to") || "";

  useEffect(() => {
    if (user?.phone && !fromNumber) {
      setFromNumber(user.phone);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);
  const [toNumber, setToNumber] = useState("");

  const { data: team = [] } = useQuery({
    queryKey: ["team"],
    queryFn: async () => (await api.get("/team")).data,
    enabled: isManager,
  });

  const { data: calls = [], isLoading } = useQuery({
    queryKey: ["exotel_calls", segment, date_from, date_to, assigned_to],
    queryFn: async () => {
      let q = `?segment=${segment}`;
      if (date_from) q += `&date_from=${date_from}`;
      if (date_to) q += `&date_to=${date_to}`;
      if (assigned_to) q += `&staff_id=${assigned_to}`;
      return (await api.get(`/exotel/calls${q}`)).data;
    }
  });

  const setDateRange = (range) => {
    if (!range) {
        params.delete("date_from");
        params.delete("date_to");
    } else {
        if (range.from) params.set("date_from", format(range.from, "yyyy-MM-dd"));
        if (range.to) params.set("date_to", format(range.to, "yyyy-MM-dd"));
    }
    setParams(params);
  };

  const setAssignedTo = (a) => {
    if (a === "all") params.delete("assigned_to"); else params.set("assigned_to", a);
    setParams(params);
  };

  const manualMut = useMutation({
    mutationFn: async (data) => (await api.post("/exotel/manual_call", data)).data,
    onSuccess: () => {
      queryClient.invalidateQueries(["exotel_calls"]);
      toast.success("Manual call triggered successfully!");
      setToNumber("");
    },
    onError: (err) => {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Failed to trigger call");
    }
  });

  const triggerManualCall = async (e) => {
    e.preventDefault();
    if (!fromNumber || !toNumber) return toast.error("Please provide both numbers");
    await startManualCall(fromNumber, toNumber);
    toast.success("Manual call triggered successfully!");
    setToNumber("");
    queryClient.invalidateQueries(["exotel_calls"]);
  };

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <div className="mb-10 flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 shadow-sm">
          <PhoneCall className="h-6 w-6" />
        </div>
        <div>
          <h1 className="font-display text-3xl font-extrabold text-slate-900 tracking-tight">RouteCall Logs</h1>
          <p className="text-slate-500 mt-1">Exotel masked calls & recordings</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Manual Call Widget */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200/60 sticky top-10">
            <div className="flex items-center gap-2.5 mb-6">
              <Phone className="h-5 w-5 text-indigo-600" />
              <h2 className="font-bold text-lg text-slate-800">Manual Call</h2>
            </div>
            <form onSubmit={triggerManualCall} className="space-y-4">
              <div>
                <Label className="text-slate-600 mb-1.5 block">Your Number (Agent)</Label>
                <Input type="tel" placeholder="+91 9876543210" value={fromNumber} onChange={e => setFromNumber(e.target.value)} className="rounded-xl" />
              </div>
              <div>
                <Label className="text-slate-600 mb-1.5 block">Customer Number</Label>
                <Input type="tel" placeholder="+91 9999999999" value={toNumber} onChange={e => setToNumber(e.target.value)} className="rounded-xl" />
              </div>
              <Button type="submit" disabled={connecting} className="w-full rounded-xl py-6 bg-indigo-600 hover:bg-indigo-700 text-white shadow-md">
                {connecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Trigger Call"}
              </Button>
            </form>
          </div>
        </div>

        {/* Call Logs Table */}
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200/60">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-2.5">
                <History className="h-5 w-5 text-slate-400" />
                <h2 className="font-bold text-lg text-slate-800">Recent Calls</h2>
              </div>
              
              {isManager && (
                <div className="flex flex-wrap items-center gap-3">
                  <Select value={assigned_to || "all"} onValueChange={setAssignedTo}>
                    <SelectTrigger className="w-36 rounded-xl">
                      <User className="mr-1 h-3.5 w-3.5 text-slate-400" /><SelectValue placeholder="All Staff" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Staff</SelectItem>
                      {team.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  
                  <Popover>
                    <PopoverTrigger className="flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-50">
                      <CalendarIcon className="h-4 w-4 text-slate-400" />
                      {date_from ? (
                        date_to ? `${format(new Date(date_from), "LLL dd, y")} - ${format(new Date(date_to), "LLL dd, y")}` : format(new Date(date_from), "LLL dd, y")
                      ) : (
                        "All Time"
                      )}
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="end">
                      <CalendarComponent
                        initialFocus
                        mode="range"
                        defaultMonth={date_from ? new Date(date_from) : new Date()}
                        selected={{
                          from: date_from ? new Date(date_from) : undefined,
                          to: date_to ? new Date(date_to) : undefined,
                        }}
                        onSelect={setDateRange}
                        numberOfMonths={2}
                      />
                      <div className="border-t p-3 text-right">
                        <button onClick={() => setDateRange(undefined)} className="text-xs font-medium text-slate-500 hover:text-slate-900">Clear dates</button>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              )}
            </div>
            
            {isLoading ? (
              <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-slate-300" /></div>
            ) : calls.length === 0 ? (
              <div className="text-center py-20 text-slate-500">No calls found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-400">
                      <th className="pb-3 font-medium">Date & Time</th>
                      <th className="pb-3 font-medium">Agent</th>
                      <th className="pb-3 font-medium">Customer</th>
                      <th className="pb-3 font-medium">Status</th>
                      <th className="pb-3 font-medium">Duration</th>
                      <th className="pb-3 font-medium text-right">Recording</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {calls.map((call) => (
                      <tr key={call.id} className="group transition-colors hover:bg-slate-50/50">
                        <td className="py-4">
                          <div className="font-medium text-slate-900">{format(new Date(call.created_at), "MMM d, yyyy")}</div>
                          <div className="text-xs text-slate-500">{format(new Date(call.created_at), "h:mm a")}</div>
                        </td>
                        <td className="py-4">
                          <div className="flex items-center gap-2.5">
                            <Avatar name={call.user_name || "Agent"} size={28} />
                            <div>
                              <div className="font-medium text-slate-900">{call.user_name || "Unknown Agent"}</div>
                              <div className="text-xs text-slate-500">{call.from_number}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 font-mono text-slate-700">{call.to_number}</td>
                        <td className="py-4">
                          <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold capitalize",
                            call.status === "completed" || call.status === "answered" ? "bg-emerald-50 text-emerald-600" :
                            call.status === "initiated" ? "bg-amber-50 text-amber-600" :
                            "bg-slate-100 text-slate-600")}>
                            {call.status}
                          </span>
                        </td>
                        <td className="py-4 font-medium tabular-nums text-slate-700">{call.duration_seconds}s</td>
                        <td className="py-4 text-right">
                          {call.recording_url ? (
                            <a href={call.recording_url} target="_blank" rel="noreferrer" 
                               className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 transition">
                              <Play className="h-4 w-4 ml-0.5" />
                            </a>
                          ) : (
                            <span className="text-slate-400 text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
