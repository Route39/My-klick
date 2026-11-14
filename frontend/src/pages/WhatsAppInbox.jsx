import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, Search, ArrowLeft, RefreshCw } from "lucide-react";
import api, { formatApiErrorDetail } from "@/lib/api";

const fmt = (t) => (t ? new Date(t).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
const body = (m) => m.content?.body || m.content?.text || m.content?.caption || `[${m.type}]`;

export default function WhatsAppInbox() {
  const [convs, setConvs] = useState([]);
  const [sel, setSel] = useState(null);
  const [chat, setChat] = useState(null);
  const [q, setQ] = useState("");
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [sendErr, setSendErr] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);

  const loadList = async () => {
    try { const r = await api.get("/wa-inbox/conversations", { params: { limit: 100 } }); setConvs(r.data?.data || []); setErr(""); }
    catch (e) { setErr(formatApiErrorDetail(e?.response?.data?.detail)); }
  };
  const loadChat = async (id) => {
    try { const r = await api.get(`/wa-inbox/conversations/${id}`); setChat(r.data?.data || null); } catch (_) {}
  };

  useEffect(() => { loadList(); const t = setInterval(loadList, 15000); return () => clearInterval(t); }, []);
  useEffect(() => { if (!sel) return; loadChat(sel); const t = setInterval(() => loadChat(sel), 8000); return () => clearInterval(t); }, [sel]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chat?.messages?.length]);

  const send = async (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t || !sel) return;
    setSending(true); setSendErr("");
    try { await api.post(`/wa-inbox/conversations/${sel}/reply`, { text: t }); setText(""); await loadChat(sel); loadList(); }
    catch (e2) { setSendErr(formatApiErrorDetail(e2?.response?.data?.detail)); }
    finally { setSending(false); }
  };

  const list = convs.filter((c) => !q || `${c.contact_name || ""} ${c.contact_phone || ""}`.toLowerCase().includes(q.toLowerCase()));
  const msgs = [...(chat?.messages || [])].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  return (
    <div className="flex h-[calc(100vh-6rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <aside className={`${sel ? "hidden md:flex" : "flex"} w-full flex-col border-r border-slate-200 md:w-80 lg:w-96`}>
        <div className="flex items-center gap-2 border-b border-slate-200 p-3">
          <MessageCircle className="h-5 w-5 text-emerald-600" />
          <h1 className="font-semibold">WhatsApp Inbox</h1>
          <button onClick={loadList} title="Refresh" className="ml-auto rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><RefreshCw className="h-4 w-4" /></button>
        </div>
        <div className="p-3">
          <div className="flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2">
            <Search className="h-4 w-4 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or number" className="w-full bg-transparent text-sm outline-none" />
          </div>
        </div>
        {err && <p className="px-3 pb-2 text-xs text-red-600">{err}</p>}
        <div className="flex-1 overflow-y-auto thin-scroll">
          {list.map((c) => (
            <button key={c.id} onClick={() => { setChat(null); setSendErr(""); setSel(c.id); }}
              className={`flex w-full items-start gap-3 border-b border-slate-100 px-3 py-3 text-left hover:bg-slate-50 ${sel === c.id ? "bg-emerald-50" : ""}`}>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 font-semibold text-emerald-700">{(c.contact_name || "?").charAt(0).toUpperCase()}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold">{c.contact_name || c.contact_phone}</span>
                  <span className="ml-auto shrink-0 text-[11px] text-slate-400">{fmt(c.last_message_at)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="truncate text-xs text-slate-500">{c.last_message}</span>
                  {c.unread_count > 0 && <span className="ml-auto rounded-full bg-emerald-500 px-1.5 text-[11px] font-bold text-white">{c.unread_count}</span>}
                </div>
              </div>
            </button>
          ))}
          {!list.length && !err && <p className="p-6 text-center text-sm text-slate-400">No conversations</p>}
        </div>
      </aside>

      <section className={`${sel ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col`}>
        {!chat ? (
          <div className="m-auto text-sm text-slate-400">{sel ? "Loading…" : "Select a conversation"}</div>
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-slate-200 p-3">
              <button onClick={() => { setSel(null); setChat(null); }} className="rounded-lg p-1 hover:bg-slate-100 md:hidden"><ArrowLeft className="h-5 w-5" /></button>
              <div className="min-w-0">
                <p className="truncate font-semibold">{chat.contact_name || chat.contact_phone}</p>
                <p className="text-xs text-slate-500">+{chat.contact_phone} · {chat.status}</p>
              </div>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto bg-[#efeae2] p-4 thin-scroll">
              {msgs.map((m) => (
                <div key={m.id} className={`flex ${m.direction === "outbound" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[75%] rounded-xl px-3 py-2 text-sm shadow-sm ${m.direction === "outbound" ? "bg-[#d9fdd3]" : "bg-white"}`}>
                    <p className="whitespace-pre-wrap break-words">{body(m)}</p>
                    <p className="mt-1 text-right text-[10px] text-slate-500">{fmt(m.created_at)}{m.direction === "outbound" && m.status ? ` · ${m.status}` : ""}</p>
                  </div>
                </div>
              ))}
              <div ref={endRef} />
            </div>
            {sendErr && <p className="px-3 pt-2 text-xs text-red-600">{sendErr}</p>}
            <form onSubmit={send} className="flex gap-2 border-t border-slate-200 p-3">
              <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a reply" className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500" />
              <button disabled={sending || !text.trim()} className="flex items-center gap-1 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white disabled:opacity-50"><Send className="h-4 w-4" /> Send</button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
