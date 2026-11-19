import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, Search, ArrowLeft, RefreshCw, UserPlus, Paperclip } from "lucide-react";
import api, { formatApiErrorDetail } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const fmt = (t) => (t ? new Date(t).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
const body = (m) => (m.type === "template" ? `📋 Template: ${m.content?.name || ""}` : null) || m.content?.body || m.content?.text || m.content?.caption || `[${m.type}]`;

function MediaView({ m }) {
  const c = m.content || {};
  const [url, setUrl] = useState("");
  const [fail, setFail] = useState(false);
  useEffect(() => {
    let u = "";
    if (!c.media_id || m.type === "document") return;
    api.get(`/wa-inbox/media/${c.media_id}`, { responseType: "blob" })
      .then((r) => { u = URL.createObjectURL(r.data); setUrl(u); })
      .catch(() => setFail(true));
    return () => { if (u) URL.revokeObjectURL(u); };
  }, [c.media_id, m.type]);
  const download = async () => {
    try {
      const r = await api.get(`/wa-inbox/media/${c.media_id}`, { responseType: "blob" });
      const u = URL.createObjectURL(r.data);
      const el = document.createElement("a"); el.href = u; el.download = c.filename || "document"; el.click();
      setTimeout(() => URL.revokeObjectURL(u), 5000);
    } catch { setFail(true); }
  };
  if (fail) return <div className="text-xs italic text-slate-400">[{m.type} — couldn't load]</div>;
  if (m.type === "document") return <button onClick={download} className="flex items-center gap-2 rounded-lg bg-white/70 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-white">📄 {c.filename || "Document"}</button>;
  if (!url) return <div className="text-xs text-slate-400">Loading {m.type}...</div>;
  if (m.type === "image" || m.type === "sticker") return <img src={url} alt="" onClick={() => window.open(url, "_blank")} className="max-h-64 max-w-[260px] cursor-pointer rounded-lg object-cover" />;
  if (m.type === "video") return <video src={url} controls className="max-h-64 max-w-[260px] rounded-lg" />;
  if (m.type === "audio") return <audio src={url} controls />;
  return null;
}

const waOpts = (c) => {
  const pick = (x) => (typeof x === "string" ? x : x?.title || x?.reply?.title || x?.text || "");
  const btns = c.buttons || c.action?.buttons || [];
  const rows = (c.sections || c.action?.sections || []).flatMap((sec) => sec.rows || []);
  return [...btns, ...rows].map(pick).filter(Boolean);
};

function MsgContent({ m }) {
  const c = m.content || {};
  if (c.media_id) return <div className="space-y-1"><MediaView m={m} />{c.caption ? <div className="whitespace-pre-wrap">{c.caption}</div> : null}</div>;
  const o = waOpts(c);
  return <>{body(m)}{o.length ? <div className="mt-2 flex flex-wrap gap-1.5">{o.map((t, i) => <span key={i} className="rounded-full border border-emerald-300 bg-white px-3 py-1 text-xs font-medium text-emerald-700">{t}</span>)}</div> : null}</>;
}

const SEEN_KEY = "wa_seen";
const getSeen = () => { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || "{}"); } catch { return {}; } };
const markSeen = (c) => { try { const s = getSeen(); s[c.id] = c.last_inbound_at || c.last_message_at || new Date().toISOString(); localStorage.setItem(SEEN_KEY, JSON.stringify(s)); } catch {} };
const isUnread = (c) => { const t = getSeen()[c.id]; return c.unread_count > 0 && (!t || (c.last_inbound_at && c.last_inbound_at > t)); };

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
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [waFilter, setWaFilter] = useState("all");
  const [waMember, setWaMember] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [assignMsg, setAssignMsg] = useState("");

  const assignToMe = async (segment) => {
    if (!sel) return;
    setAssigning(true); setAssignMsg("");
    try { const r = await api.post(`/wa-inbox/conversations/${sel}/assign-to-me`, { segment }); loadList(); setAssignMsg(`${r.data?.message || "Assigned"} (${segment === "driver" ? "Driver" : "Investor"})`); }
    catch (e) { setAssignMsg(formatApiErrorDetail(e?.response?.data?.detail)); }
    finally { setAssigning(false); }
  };

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

  const fileRef = useRef(null);
  const sendFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !sel) return;
    if (f.size > 16 * 1024 * 1024) { setSendErr("Max file size is 16 MB"); return; }
    setSending(true); setSendErr("");
    try {
      const fd = new FormData(); fd.append("file", f); fd.append("caption", text.trim());
      await api.post(`/wa-inbox/conversations/${sel}/media`, fd, { headers: { "Content-Type": "multipart/form-data" } }); markSeen(convs.find((x) => x.id === sel) || { id: sel });
      setText(""); await loadChat(sel); loadList();
    } catch (ex) {
      const d = ex?.response?.data?.detail;
      setSendErr(typeof d === "string" ? d : "File upload failed");
    } finally { setSending(false); }
  };
  const send = async (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t || !sel) return;
    setSending(true); setSendErr("");
    try { await api.post(`/wa-inbox/conversations/${sel}/reply`, { text: t }); markSeen(convs.find((x) => x.id === sel) || { id: sel }); setText(""); await loadChat(sel); loadList(); }
    catch (e2) { setSendErr(formatApiErrorDetail(e2?.response?.data?.detail)); }
    finally { setSending(false); }
  };

  const fMatch = (c, k) => k === "all" ? true : k === "open" ? !c.assigned_name : k === "taken" ? !!c.assigned_name
    : k === "investor" ? !!c.assigned_name && c.assigned_segment !== "driver" : !!c.assigned_name && c.assigned_segment === "driver";
  const waTabs = [["all", "All"], ["open", "Not taken"], ["taken", "Taken"], ["investor", "Investors"], ["driver", "Drivers"]];
  const list = convs.filter((c) => (!isAdmin || (fMatch(c, waFilter) && (!waMember || c.assigned_name === waMember))) && (!q || `${c.contact_name || ""} ${c.contact_phone || ""}`.toLowerCase().includes(q.toLowerCase())));
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
        {isAdmin && (
          <div className="flex flex-wrap gap-1.5 px-3 pb-3">
            {waTabs.map(([k, label]) => (
              <button key={k} onClick={() => setWaFilter(k)}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${waFilter === k ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
                {label} <span className="opacity-80">({convs.filter((c) => fMatch(c, k)).length})</span>
              </button>
            ))}
            <select value={waMember} onChange={(e) => setWaMember(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 outline-none focus:border-emerald-500">
              <option value="">All team members</option>
              {Object.entries(convs.reduce((a, c) => { if (c.assigned_name) { const k = c.assigned_name; a[k] = a[k] || { t: 0, i: 0, d: 0 }; a[k].t++; c.assigned_segment === "driver" ? a[k].d++ : a[k].i++; } return a; }, {}))
                .sort((a, b) => b[1].t - a[1].t)
                .map(([n, v]) => <option key={n} value={n}>{n} — {v.t} taken (Investor {v.i} · Driver {v.d})</option>)}
            </select>
          </div>
        )}
        {err && <p className="px-3 pb-2 text-xs text-red-600">{err}</p>}
        <div className="flex-1 overflow-y-auto thin-scroll">
          {list.map((c) => (
            <button key={c.id} onClick={() => { setChat(null); setSendErr(""); setAssignMsg(""); setSel(c.id); }}
              className={`flex w-full items-start gap-3 border-b border-slate-100 px-3 py-3 text-left hover:bg-slate-50 ${sel === c.id ? "bg-emerald-50" : ""}`}>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 font-semibold text-emerald-700">{(c.contact_name || "?").charAt(0).toUpperCase()}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold">{c.contact_name || c.contact_phone}</span>
                  <span className="ml-auto shrink-0 text-[11px] text-slate-400">{fmt(c.last_message_at)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="truncate text-xs text-slate-500">{c.last_message}</span>
                  {isUnread(c) && <span className="ml-auto rounded-full bg-emerald-500 px-1.5 text-[11px] font-bold text-white">{c.unread_count}</span>}
                </div>
                {c.assigned_name && (
                  <span className={`mt-1 inline-block rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${c.assigned_segment === "driver" ? "bg-amber-100 text-amber-800" : "bg-indigo-100 text-indigo-800"}`}>
                    {c.assigned_name} · {c.assigned_segment === "driver" ? "Driver" : "Investor"}
                  </span>
                )}
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
              <div className="ml-auto flex shrink-0 items-center gap-1.5">
                <UserPlus className="hidden h-4 w-4 text-slate-500 sm:block" />
                <span className="hidden text-xs font-medium text-slate-600 sm:inline">Assign to me:</span>
                <button disabled={assigning} onClick={() => assignToMe("investor")} className="rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Investor</button>
                <button disabled={assigning} onClick={() => assignToMe("driver")} className="rounded-lg bg-amber-500 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Driver</button>
              </div>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto bg-[#efeae2] p-4 thin-scroll">
              {msgs.map((m) => (
                <div key={m.id} className={`flex ${m.direction === "outbound" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[75%] rounded-xl px-3 py-2 text-sm shadow-sm ${m.direction === "outbound" ? "bg-[#d9fdd3]" : "bg-white"}`}>
                    <div className="whitespace-pre-wrap break-words"><MsgContent m={m} /></div>
                    <p className="mt-1 text-right text-[10px] text-slate-500">{fmt(m.created_at)}{m.direction === "outbound" && m.status ? ` · ${m.status}` : ""}</p>
                  </div>
                </div>
              ))}
              <div ref={endRef} />
            </div>
            {assignMsg && <p className="border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700">{assignMsg}</p>}
            {sendErr && <p className="px-3 pt-2 text-xs text-red-600">{sendErr}</p>}
            <form onSubmit={send} className="flex gap-2 border-t border-slate-200 p-3">
              <input ref={fileRef} type="file" hidden accept="image/jpeg,image/png,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,audio/*,video/mp4,video/3gpp" onChange={sendFile} />
              <button type="button" onClick={() => fileRef.current?.click()} disabled={sending} title="Attach image or document" className="flex items-center rounded-xl border border-slate-200 px-3 text-slate-500 hover:bg-slate-50 disabled:opacity-50"><Paperclip className="h-4 w-4" /></button>
              <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a reply" className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500" />
              <button disabled={sending || !text.trim()} className="flex items-center gap-1 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white disabled:opacity-50"><Send className="h-4 w-4" /> Send</button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
