import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Trophy, Medal, Award, Plus, Loader2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { Avatar } from "@/components/InitialsAvatar";
import { ListSkeleton } from "@/components/Skeletons";
import { formatINR } from "@/lib/constants";
import { formatApiErrorDetail } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";


const RANK = [
  { icon: Trophy, color: "text-amber-500 bg-amber-50" },
  { icon: Medal, color: "text-slate-400 bg-slate-100" },
  { icon: Award, color: "text-orange-500 bg-orange-50" },
];


function AddTeamMemberModal({ onSuccess }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("sales");
  const [showPassword, setShowPassword] = useState(false);

  const queryClient = useQueryClient();

  const addMut = useMutation({
    mutationFn: async (data) => (await api.post("/team", data)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team"] });
      setOpen(false);
      setName("");
      setPhone("");
      setEmail("");
      setPassword("");
      setRole("sales");
      if (onSuccess) onSuccess();
    },
    onError: (e) => toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Failed to add member"),
  });

  const onSubmit = (e) => {
    e.preventDefault();
    addMut.mutate({ name, phone, email, password, role });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="rounded-xl font-medium shadow-sm">
          <Plus className="mr-2 h-4 w-4" /> Add Team Member
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px] rounded-2xl border-0 p-0 shadow-2xl">
        <div className="bg-slate-900 px-6 py-4 rounded-t-2xl">
          <DialogTitle className="text-xl font-display font-bold text-white tracking-tight">Add Team Member</DialogTitle>
          <p className="text-sm text-slate-300 mt-1">Configure access for a new staff member.</p>
        </div>
        
        <form onSubmit={onSubmit} className="p-6 space-y-5">
          <div className="space-y-4">
            <div>
              <Label className="text-slate-700 font-semibold mb-1.5 block">Full Name</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="John Doe" className="rounded-xl border-slate-200" required />
            </div>
            <div>
              <Label className="text-slate-700 font-semibold mb-1.5 block">Phone / Username</Label>
              <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91 99999 99999" className="rounded-xl border-slate-200" required />
              <p className="text-xs text-slate-500 mt-1">They will use this to log in.</p>
            </div>
            <div>
              <Label className="text-slate-700 font-semibold mb-1.5 block">Email <span className="text-slate-400 font-normal">(Optional)</span></Label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="john@company.com" className="rounded-xl border-slate-200" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-slate-700 font-semibold mb-1.5 block">Role</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger className="rounded-xl border-slate-200 bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-slate-200">
                    <SelectItem value="sales" className="rounded-lg">Sales Exec</SelectItem>
                    <SelectItem value="team_leader" className="rounded-lg">Team Leader</SelectItem>
                    <SelectItem value="admin" className="rounded-lg">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-slate-700 font-semibold mb-1.5 block">Password</Label>
                <div className="relative">
                  <Input type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter password" className="rounded-xl border-slate-200 pr-10" required />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
          </div>
          
          <div className="pt-2 flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} className="rounded-xl">Cancel</Button>
            <Button type="submit" disabled={addMut.isPending} className="rounded-xl bg-violet-600 hover:bg-violet-700 text-white shadow-md">
              {addMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Member
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}


function ViewStaffModal({ staff, open, setOpen, onDelete, onUpdate }) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("sales");

  React.useEffect(() => {
    if (staff && open && !isEditing) {
      setName(staff.name);
      setPhone(staff.phone || "");
      setEmail(staff.email || "");
      setRole(staff.role);
    }
  }, [staff, open, isEditing]);

  if (!staff) return null;

  const handleSave = (e) => {
    e.preventDefault();
    onUpdate(staff.id, { name, phone, email, role }, () => {
      setIsEditing(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={(val) => { setOpen(val); if(!val) setIsEditing(false); }}>
      <DialogContent className="sm:max-w-[425px] rounded-2xl border-0 p-0 shadow-2xl">
        <div className="bg-slate-900 px-6 py-6 rounded-t-2xl flex items-center gap-4">
          <Avatar name={staff.name} size={64} />
          <div>
            <DialogTitle className="text-xl font-display font-bold text-white tracking-tight">{staff.name}</DialogTitle>
            <p className="text-sm text-slate-300 mt-0.5 capitalize">{staff.role.replace("_", " ")}</p>
          </div>
        </div>
        
        {isEditing ? (
          <form onSubmit={handleSave} className="p-6 space-y-4">
            <div>
              <Label className="text-slate-700 font-semibold mb-1.5 block">Full Name</Label>
              <Input value={name} onChange={e => setName(e.target.value)} className="rounded-xl border-slate-200" />
            </div>
            <div>
              <Label className="text-slate-700 font-semibold mb-1.5 block">Phone / Username</Label>
              <Input value={phone} onChange={e => setPhone(e.target.value)} className="rounded-xl border-slate-200" />
            </div>
            <div>
              <Label className="text-slate-700 font-semibold mb-1.5 block">Email</Label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} className="rounded-xl border-slate-200" />
            </div>
            <div>
              <Label className="text-slate-700 font-semibold mb-1.5 block">Role</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger className="rounded-xl border-slate-200 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-slate-200">
                  <SelectItem value="sales" className="rounded-lg">Sales Exec</SelectItem>
                  <SelectItem value="team_leader" className="rounded-lg">Team Leader</SelectItem>
                  <SelectItem value="admin" className="rounded-lg">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="pt-2 flex justify-end gap-3">
              <Button type="button" variant="ghost" onClick={() => setIsEditing(false)} className="rounded-xl">Cancel</Button>
              <Button type="submit" className="rounded-xl bg-violet-600 hover:bg-violet-700 text-white shadow-md">
                Save Changes
              </Button>
            </div>
          </form>
        ) : (
          <div className="p-6 space-y-6">
            <div className="space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500 font-medium">Phone / Username</span>
                <span className="text-slate-900 font-bold">{staff.phone || "N/A"}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500 font-medium">Email</span>
                <span className="text-slate-900 font-bold">{staff.email || "N/A"}</span>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <Stat value={staff.leads} label="Total Leads" />
              <Stat value={staff.converted} label="Converted" accent />
            </div>
            
            <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setIsEditing(true)} className="rounded-xl">Edit</Button>
              <Button type="button" variant="destructive" onClick={() => onDelete(staff.id)} className="rounded-xl bg-red-600 hover:bg-red-700 shadow-sm">
                Delete Member
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function Team() {
  const { data = [], isLoading } = useQuery({ queryKey: ["team"], queryFn: async () => (await api.get("/team")).data });
  const queryClient = useQueryClient();
  const [selectedStaff, setSelectedStaff] = useState(null);

  const deleteMut = useMutation({
    mutationFn: async (id) => await api.delete(`/team/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team"] });
      setSelectedStaff(null);
    }
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, data }) => await api.put(`/team/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team"] });
      setSelectedStaff(null);
    }
  });

  const handleDelete = (id) => {
    if (window.confirm("Are you sure you want to permanently delete this team member?")) {
      deleteMut.mutate(id);
    }
  };
  
  const handleUpdate = (id, data, onSuccess) => {
    updateMut.mutate({ id, data }, { onSuccess });
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-slate-900">Team Performance</h1>
          <p className="mt-1 text-slate-500">How your sales team is performing</p>
        </div>
        <AddTeamMemberModal />
      </div>

      {isLoading ? <ListSkeleton count={4} /> : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((m, i) => {
            const rank = RANK[i];
            return (
              <motion.div key={m.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.05, 0.3) }}
                data-testid={`team-card-${m.id}`}
                className="rounded-2xl border border-slate-200/60 bg-white p-5 card-lift cursor-pointer hover:border-violet-300 transition-colors" onClick={() => setSelectedStaff(m)}>
                <div className="flex items-center gap-3">
                  <Avatar name={m.name} size={48} />
                  <div className="flex-1">
                    <div className="font-display font-bold text-slate-900">{m.name}</div>
                    <div className="text-xs capitalize text-slate-400">{m.role}</div>
                  </div>
                  {rank && <div className={cn("flex h-8 w-8 items-center justify-center rounded-full", rank.color)}><rank.icon className="h-4 w-4" /></div>}
                </div>

                <div className="mt-5 grid grid-cols-3 gap-2 text-center">
                  <Stat value={m.leads} label="Leads" />
                  <Stat value={m.contacted} label="Contacted" />
                  <Stat value={m.converted} label="Won" accent />
                </div>

                <div className="mt-5">
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-500">Conversion</span>
                    <span className="font-display font-bold text-slate-900">{m.conversion_rate}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <motion.div className="h-full rounded-full bg-gradient-to-r from-primary to-violet-500"
                      initial={{ width: 0 }} animate={{ width: `${m.conversion_rate}%` }} transition={{ duration: 0.8, delay: 0.2 }} />
                  </div>
                </div>

                {m.value > 0 && (
                  <div className="mt-4 rounded-xl bg-emerald-50 px-3 py-2 text-center">
                    <span className="font-display text-lg font-bold text-emerald-700">{formatINR(m.value)}</span>
                    <span className="ml-1 text-xs text-emerald-600/70">revenue</span>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
      
      <ViewStaffModal staff={selectedStaff} open={!!selectedStaff} setOpen={(v) => {if (!v) setSelectedStaff(null)}} onDelete={handleDelete} onUpdate={handleUpdate} />
    </div>
  );
}

function Stat({ value, label, accent }) {
  return (
    <div className={cn("rounded-xl py-2.5", accent ? "bg-emerald-50" : "bg-slate-50")}>
      <div className={cn("font-display text-xl font-extrabold", accent ? "text-emerald-600" : "text-slate-900")}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  );
}
