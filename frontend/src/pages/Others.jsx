import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { StickyNote, Send, CheckCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import api, { formatApiErrorDetail } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Avatar } from "@/components/InitialsAvatar";
import { ListSkeleton } from "@/components/Skeletons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const fmt = (iso) => iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "";

export default function Others({ embedded = false }) {
  const { user } = useAuth();
  const canViewAll = ["admin", "admin_staff"].includes(user?.role);
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [filter, setFilter] = useState("all");

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ["notes"],
    queryFn: async () => (await api.get("/notes")).data,
    refetchInterval: 30000,
  });

  const send = useMutation({
    mutationFn: async () => (await api.post("/notes", { text })).data,
    onSuccess: () => { setText(""); qc.invalidateQueries({ queryKey: ["notes"] }); toast.success("Note sent"); },
    onError: (e) => toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Failed to send"),
  });

  const noted = useMutation({
    mutationFn: async (id) => (await api.post(`/notes/${id}/noted`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notes"] }),
    onError: () => toast.error("Failed to update"),
  });

  const shown = notes.filter(n => filter === "all" || n.status === filter);
  const newCount = notes.filter(n => n.status === "new").length;

  return (
    <div className={embedded ? "space-y-5" : "mx-auto max-w-4xl space-y-6"}>
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-slate-900">Other Work</h1>
        <p className="mt-1 text-slate-600">
          {canViewAll ? "Notes sent by the team" : "Write a note — it goes to Admin"}
        </p>
      </div>

      <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 shadow-sm">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-800">
          <StickyNote className="h-4 w-4" /> New note
        </div>
        <textarea rows={5} value={text} onChange={e => setText(e.target.value)} maxLength={5000}
          placeholder="Type your note here..."
          className="w-full resize-y rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-300" />
        <div className="mt-3 flex justify-end">
          <Button disabled={!text.trim() || send.isPending} onClick={() => send.mutate()} className="rounded-xl">
            {send.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Send
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-slate-900">{canViewAll ? "All notes" : "My notes"}</h2>
        <div className="flex gap-2">
          {[["all", "All"], ["new", `New${newCount ? ` (${newCount})` : ""}`], ["noted", "Noted"]].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setFilter(k)}
              className={cn("rounded-xl px-3 py-1.5 text-sm font-semibold",
                filter === k ? "bg-primary text-white" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50")}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? <ListSkeleton count={4} /> : shown.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-slate-600">No notes yet</div>
      ) : (
        <div className="space-y-3">
          {shown.map(n => (
            <div key={n.id} className={cn("rounded-2xl border bg-white p-4 shadow-sm", n.status === "new" ? "border-amber-200" : "border-slate-200")}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Avatar name={n.user_name} size={34} />
                  <div>
                    <div className="font-semibold text-slate-900">{n.user_name}</div>
                    <div className="text-xs capitalize text-slate-600">{(n.user_role || "").replace("_", " ")} · {fmt(n.created_at)}</div>
                  </div>
                </div>
                {n.status === "noted" ? (
                  <span className="flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                    <CheckCheck className="h-3.5 w-3.5" /> Noted{n.noted_by ? ` by ${n.noted_by}` : ""}
                  </span>
                ) : canViewAll ? (
                  <Button size="sm" variant="outline" disabled={noted.isPending} onClick={() => noted.mutate(n.id)} className="rounded-lg">
                    <CheckCheck className="mr-1 h-4 w-4" /> Mark noted
                  </Button>
                ) : (
                  <span className="rounded-lg bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">Sent</span>
                )}
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm text-slate-800">{n.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
