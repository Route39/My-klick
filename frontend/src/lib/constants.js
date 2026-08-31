import {
  Sparkles, Phone, MessageCircle, Users, Globe, Instagram, Facebook,
  Share2, Video, PenLine, Megaphone,
} from "lucide-react";

export const STATUS_META = {
  new:        { label: "New",               dot: "#0EA5E9", text: "text-sky-700",     bg: "bg-sky-50",     ring: "ring-sky-200",     bar: "bg-sky-500" },
  contacted:  { label: "Contacted",         dot: "#6366F1", text: "text-indigo-700",  bg: "bg-indigo-50",  ring: "ring-indigo-200",  bar: "bg-indigo-500" },
  rnr:        { label: "Ring Not Response", dot: "#94A3B8", text: "text-slate-700",   bg: "bg-slate-100",  ring: "ring-slate-200",   bar: "bg-slate-500" },
  interested: { label: "Interested",        dot: "#8B5CF6", text: "text-violet-700",  bg: "bg-violet-50",  ring: "ring-violet-200",  bar: "bg-violet-500" },
  follow_up:  { label: "Follow-up",         dot: "#F59E0B", text: "text-amber-700",   bg: "bg-amber-50",   ring: "ring-amber-200",   bar: "bg-amber-500" },
  converted:  { label: "Converted",         dot: "#10B981", text: "text-emerald-700", bg: "bg-emerald-50", ring: "ring-emerald-200", bar: "bg-emerald-500" },
  lost:       { label: "Lost",              dot: "#EF4444", text: "text-red-700",     bg: "bg-red-50",     ring: "ring-red-200",     bar: "bg-red-500" },
};

export const STAGES = ["new", "contacted", "rnr", "interested", "follow_up", "converted", "lost"];

export const PRIORITY_META = {
  high:   { label: "High",   text: "text-red-700",    bg: "bg-red-50" },
  medium: { label: "Medium", text: "text-amber-700",  bg: "bg-amber-50" },
  low:    { label: "Low",    text: "text-slate-600",  bg: "bg-slate-100" },
};

export const SOURCE_META = {
  website:   { label: "Website",   icon: Globe,        color: "text-sky-600" },
  whatsapp:  { label: "WhatsApp",  icon: MessageCircle,color: "text-emerald-600" },
  call:      { label: "Call",      icon: Phone,        color: "text-indigo-600" },
  instagram: { label: "Instagram", icon: Instagram,    color: "text-pink-600" },
  facebook:  { label: "Facebook",  icon: Facebook,     color: "text-blue-600" },
  referral:  { label: "Referral",  icon: Share2,       color: "text-violet-600" },
  webinar:   { label: "Webinar",   icon: Video,        color: "text-orange-600" },
  manual:    { label: "Manual",    icon: PenLine,      color: "text-slate-500" },
  campaign:  { label: "Campaign",  icon: Megaphone,    color: "text-amber-600" },
};
export const SOURCES = Object.keys(SOURCE_META);
export const NewIcon = Sparkles;

const AV_COLORS = [
  ["#6366F1", "#8B5CF6"], ["#0EA5E9", "#22D3EE"], ["#10B981", "#34D399"],
  ["#F59E0B", "#FBBF24"], ["#EC4899", "#F472B6"], ["#EF4444", "#FB7185"],
];

export function avatarGradient(name = "") {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  const [a, b] = AV_COLORS[Math.abs(h) % AV_COLORS.length];
  return `linear-gradient(135deg, ${a}, ${b})`;
}

export function initials(name = "") {
  return name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
}

export function formatINR(n = 0) {
  if (n >= 100000) return `₹${(n / 100000).toFixed(n % 100000 === 0 ? 0 : 2)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(0)}K`;
  return `₹${n}`;
}

export function fullINR(n = 0) {
  return "₹" + Number(n).toLocaleString("en-IN");
}

export function timeAgo(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function formatClock(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

export function formatDay(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
