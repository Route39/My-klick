import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { User, Mail, Phone } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export function ProfileDialog({ open, onOpenChange }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState({ name: "", email: "", phone: "", role: "sales" });

  useEffect(() => {
    if (open && user) {
      setData({
        name: user.name || "",
        email: user.email || "",
        phone: user.phone || "",
        role: user.role || "sales"
      });
    }
  }, [open, user]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    


    setLoading(true);
    try {
      await api.put(`/team/${user.id}`, data);
      
      // Update local storage so useAuth detects it immediately (optimistic UI)
      const ustr = localStorage.getItem("myklick_user");
      if (ustr) {
          const u = JSON.parse(ustr);
          u.name = data.name;
          u.phone = data.phone;
          u.email = data.email;
          localStorage.setItem("myklick_user", JSON.stringify(u));
          
          // Dispatch custom event so AuthContext updates
          window.dispatchEvent(new Event("storage"));
      }
      
      toast.success("Profile updated perfectly!");
      qc.invalidateQueries();
      onOpenChange(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not update profile.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit Profile Settings</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase text-slate-500">Full Name</label>
            <div className="relative">
              <User className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input type="text" value={data.name} onChange={(e) => setData({ ...data, name: e.target.value })}
                className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-4 text-sm font-medium outline-none transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase text-slate-500">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input type="email" value={data.email} onChange={(e) => setData({ ...data, email: e.target.value })}
                className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-4 text-sm font-medium outline-none transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase text-slate-500">Phone Number (Required for Dialing)</label>
            <div className="relative">
              <Phone className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input type="tel" value={data.phone} onChange={(e) => setData({ ...data, phone: e.target.value })}
                className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-4 text-sm font-medium outline-none transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
            </div>
          </div>

          <div className="pt-2">
            <button type="submit" disabled={loading}
              className="w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-700 active:scale-95 disabled:opacity-70">
              {loading ? "Saving..." : "Save Profile"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
