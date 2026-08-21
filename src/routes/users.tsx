import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ShieldCheck, Users as UsersIcon, Search, UserPlus, Mail,
  CheckCircle2, ArrowUpRight, Loader2, Pencil, UserCheck, UserX, RefreshCw, Copy,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { TopNav, SiteFooter, useAuth, can, ROLES, type Role } from "@/lib/app-shell";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/users")({
  component: UsersPage,
  head: () => ({
    meta: [
      { title: "Users · SafeGuard" },
      { name: "description", content: "Manage users and roles across Siginon SafeGuard." },
    ],
  }),
});

// DB role -> display Role. profiles.role is stored lowercase (employee /
// supervisor / hse / admin) per the schema check constraint; the UI uses
// the friendlier labels used everywhere else in the app.
const DB_ROLE_TO_LABEL: Record<string, Role> = {
  employee: "Employee",
  supervisor: "Supervisor",
  hse: "HSE Officer",
  admin: "Admin",
};

const roleStyles: Record<Role, string> = {
  Employee: "bg-sky-500/10 text-sky-700 border-sky-500/30",
  Supervisor: "bg-amber-500/10 text-amber-700 border-amber-500/30",
  "HSE Officer": "bg-primary/10 text-primary border-primary/30",
  Admin: "bg-fuchsia-500/10 text-fuchsia-700 border-fuchsia-500/30",
};

const statusStyles: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
  suspended: "bg-muted text-muted-foreground border-border",
};

type Profile = Tables<"profiles">;
type Site = { id: string; name: string };

// Inverse of DB_ROLE_TO_LABEL, for writing a selected display Role back to
// the lowercase value the `profiles.role` check constraint expects.
const LABEL_TO_DB_ROLE: Record<Role, string> = {
  Employee: "employee",
  Supervisor: "supervisor",
  "HSE Officer": "hse",
  Admin: "admin",
};

// `status`, `site_id` and `phone` were added in
// 20260817000000_profiles_status_site_phone.sql. Until types.ts is
// regenerated against the live schema, these read/write through `as any`
// on the Profile type — safe to remove once the generated types catch up.
function statusOf(u: Profile): string {
  return (u as any).status ?? "active";
}

// Employees don't get accounts created here — per the auth page copy,
// Employee access doesn't require a login, so it's left out of the
// create-user role choices (existing employee rows can still be changed
// to another role from the table dropdown, which still offers all of ROLES).
const CREATE_ROLES = ROLES.filter(r => r !== "Employee");

const emptyCreateForm = {
  full_name: "", email: "", password: "",
  role: "Supervisor" as Role, site_id: "", department: "", phone: "",
};

function UsersPage() {
  const { role, profile: currentProfile, ready, isAuthed } = useAuth();
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"All" | Role>("All");
  const [busyId, setBusyId] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [lastCreated, setLastCreated] = useState<{
    full_name: string; email: string; password: string;
    role: Role; site_name: string; department: string; phone: string;
  } | null>(null);

  const [editUser, setEditUser] = useState<Profile | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editForm, setEditForm] = useState({ full_name: "", department: "", phone: "", site_id: "" });

  useEffect(() => {
    if (ready && !isAuthed && typeof window !== "undefined") window.location.href = "/auth";
  }, [ready, isAuthed]);

  async function loadProfiles() {
    // Only readable by the signed-in user themself (their own row) or an
    // admin (all rows), per the "admins read all profiles" RLS policy.
    const { data, error } = await supabase.from("profiles").select("*").order("full_name");
    setProfiles(error ? [] : (data ?? []));
  }

  async function loadSites() {
    const { data, error } = await supabase.from("sites").select("id,name").order("name");
    setSites(error ? [] : (data ?? []));
  }

  useEffect(() => {
    loadProfiles();
    loadSites();
  }, []);

  const canManage = can(role, "manageUsers");

  async function changeRole(user: Profile, nextLabel: Role) {
    const nextDbRole = LABEL_TO_DB_ROLE[nextLabel];
    if (nextDbRole === user.role) return;
    setBusyId(user.id);
    // Requires the "admins update any profile" RLS policy — see
    // supabase/migrations/20260804010000_admin_manage_profiles.sql
    const { error } = await supabase.from("profiles").update({ role: nextDbRole }).eq("id", user.id);
    setBusyId(null);
    if (error) {
      toast.error(`Couldn't change ${user.full_name}'s role`, { description: error.message });
      return;
    }
    toast.success(`${user.full_name} is now ${nextLabel}`);
    loadProfiles();
  }

  async function toggleStatus(user: Profile) {
    if (user.id === currentProfile?.id) return; // guarded in UI too, belt & braces
    const next = statusOf(user) === "suspended" ? "active" : "suspended";
    const confirmed = window.confirm(
      next === "suspended"
        ? `Suspend ${user.full_name}?\n\nThey immediately lose access to every role-gated page. Their profile, history and reports are kept intact, and they can be reactivated any time.`
        : `Reactivate ${user.full_name}?\n\nThey'll regain access with their existing login.`
    );
    if (!confirmed) return;
    setBusyId(user.id);
    const { error } = await supabase.from("profiles").update({ status: next } as any).eq("id", user.id);
    setBusyId(null);
    if (error) {
      toast.error(`Couldn't update ${user.full_name}`, { description: error.message });
      return;
    }
    toast.success(`${user.full_name} ${next === "suspended" ? "suspended" : "reactivated"}`);
    loadProfiles();
  }

  function openEdit(user: Profile) {
    setEditUser(user);
    setEditForm({
      full_name: user.full_name ?? "",
      department: user.department ?? "",
      phone: (user as any).phone ?? "",
      site_id: (user as any).site_id ?? "",
    });
  }

  async function saveEdit() {
    if (!editUser) return;
    if (!editForm.full_name.trim()) {
      toast.error("Full name can't be empty");
      return;
    }
    setSavingEdit(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: editForm.full_name.trim(),
        department: editForm.department.trim() || null,
        phone: editForm.phone.trim() || null,
        site_id: editForm.site_id || null,
      } as any)
      .eq("id", editUser.id);
    setSavingEdit(false);
    if (error) {
      toast.error(`Couldn't update ${editUser.full_name}`, { description: error.message });
      return;
    }
    toast.success(`${editUser.full_name} updated`);
    setEditUser(null);
    loadProfiles();
  }

  function generatePassword() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
    let pw = "";
    for (let i = 0; i < 12; i++) pw += chars[Math.floor(Math.random() * chars.length)];
    setCreateForm(f => ({ ...f, password: pw }));
  }

  async function createUser() {
    const { full_name, email, password, role: formRole, site_id, department, phone } = createForm;
    if (!full_name.trim() || !email.trim() || !password || !site_id) {
      toast.error("Full name, email, password and site are required");
      return;
    }
    setCreating(true);
    const { data, error } = await supabase.functions.invoke("admin-create-user", {
      body: {
        full_name: full_name.trim(),
        email: email.trim(),
        password,
        role: LABEL_TO_DB_ROLE[formRole],
        site_id,
        department: department.trim() || null,
        phone: phone.trim() || null,
      },
    });
    setCreating(false);
    const serverError = (data as any)?.error;
    if (error || serverError) {
      toast.error("Couldn't create the account", { description: serverError ?? error?.message });
      return;
    }
    toast.success(`Account created for ${full_name}`);
    setLastCreated({
      full_name: full_name.trim(),
      email: email.trim(),
      password,
      role: formRole,
      site_name: sites.find(s => s.id === site_id)?.name ?? "—",
      department: department.trim() || "—",
      phone: phone.trim() || "—",
    });
    setCreateForm(emptyCreateForm);
    loadProfiles();
  }

  async function copyToClipboard(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error(`Couldn't copy ${label.toLowerCase()}`);
    }
  }

  const filtered = useMemo(() => (profiles ?? []).filter(u => {
    const label = DB_ROLE_TO_LABEL[u.role] ?? "Employee";
    const q = search.toLowerCase();
    const matchQ = !q || [u.full_name, u.email, u.department ?? ""].join(" ").toLowerCase().includes(q);
    const matchR = roleFilter === "All" || label === roleFilter;
    return matchQ && matchR;
  }), [profiles, search, roleFilter]);

  const counts = useMemo(() => {
    const list = profiles ?? [];
    return {
      total: list.length,
      admins: list.filter(u => u.role === "admin").length,
      suspended: list.filter(u => statusOf(u) === "suspended").length,
    };
  }, [profiles]);

  if (!ready || !role) {
    return (
      <div className="min-h-screen">
        <TopNav />
        <div className="max-w-md mx-auto text-center py-24 px-4">
          <p className="text-muted-foreground">Redirecting to sign in…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Toaster position="top-right" />
      <TopNav />
      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-fuchsia-500/10 via-card to-primary/10 p-5 sm:p-8">
          <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-fuchsia-500/15 blur-3xl" />
          <div className="relative flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="min-w-0">
              <Badge variant="outline" className="border-fuchsia-500/40 text-fuchsia-700 bg-fuchsia-500/10 mb-3">
                <ShieldCheck className="w-3 h-3 mr-1" /> {canManage ? "Admin access" : "Read-only"}
              </Badge>
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Users & roles</h1>
              <p className="text-muted-foreground mt-2 max-w-xl text-sm sm:text-base">
                {canManage
                  ? ""
                  : ""}
              </p>
            </div>
            <div className="flex flex-col items-stretch sm:items-end gap-2 shrink-0">
              <Link to="/dashboard">
                <Button variant="outline" size="sm" className="w-full sm:w-auto">
                  Back to dashboard <ArrowUpRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
              {canManage && (
                <Button
                  size="lg"
                  className="bg-primary text-primary-foreground font-semibold w-full sm:w-auto"
                  onClick={() => { setLastCreated(null); setCreateForm(emptyCreateForm); setCreateOpen(true); }}
                >
                  <UserPlus className="w-4 h-4 mr-2" /> Create user
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[
            { label: "Total users", value: counts.total, icon: UsersIcon, tint: "primary" },
            { label: "Admins", value: counts.admins, icon: ShieldCheck, tint: "destructive" },
            { label: "Suspended", value: counts.suspended, icon: UserX, tint: "destructive" },
          ].map(s => (
            <div key={s.label} className="glass-card rounded-2xl p-4 sm:p-5 flex items-center gap-3 sm:gap-4">
              <div className={`w-10 h-10 sm:w-11 sm:h-11 shrink-0 rounded-xl flex items-center justify-center bg-${s.tint}/15 text-${s.tint} border border-${s.tint}/20`}>
                <s.icon className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-xl sm:text-2xl font-bold">{s.value}</div>
                <div className="text-xs text-muted-foreground truncate">{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 sm:p-5 border-b border-border">
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold">Directory</h3>
              <p className="text-xs text-muted-foreground">{filtered.length} of {profiles?.length ?? 0} users</p>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search name, email, dept…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9 w-full" />
            </div>
            <Select value={roleFilter} onValueChange={v => setRoleFilter(v as any)}>
              <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All roles</SelectItem>
                {ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {profiles === null && <div className="p-6 text-sm text-muted-foreground">Loading…</div>}
          {profiles?.length === 0 && (
            <div className="p-6 text-sm text-muted-foreground">
              No profiles visible yet. Use "Create user" above to set up the first account.
            </div>
          )}

          {/* Mobile card list */}
          <div className="md:hidden divide-y divide-border">
            {filtered.map(u => {
              const label = DB_ROLE_TO_LABEL[u.role] ?? "Employee";
              const status = statusOf(u);
              return (
                <div key={u.id} className="p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 shrink-0 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-bold text-xs">
                      {initials(u.full_name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{u.full_name}</div>
                      <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <Badge variant="outline" className={roleStyles[label]}>{label}</Badge>
                      <Badge variant="outline" className={statusStyles[status]}>
                        {status === "suspended" ? "Suspended" : "Active"}
                      </Badge>
                    </div>
                  </div>
                  {u.department && (
                    <div className="text-xs text-muted-foreground">{u.department}</div>
                  )}
                  {canManage && (
                    <div className="flex items-center gap-2 pt-1">
                      <Select
                        value={label}
                        onValueChange={v => changeRole(u, v as Role)}
                        disabled={busyId === u.id}
                      >
                        <SelectTrigger className="h-8 text-xs flex-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Button
                        size="icon" variant="outline" className="h-8 w-8 shrink-0"
                        title="Edit details"
                        onClick={() => openEdit(u)}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="icon" variant="outline" className="h-8 w-8 shrink-0"
                        disabled={busyId === u.id || u.id === currentProfile?.id}
                        title={u.id === currentProfile?.id ? "You can't change your own status here" : (status === "suspended" ? "Reactivate user" : "Suspend user")}
                        onClick={() => toggleStatus(u)}
                      >
                        {busyId === u.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : status === "suspended"
                            ? <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                            : <UserX className="w-3.5 h-3.5 text-destructive" />}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-muted-foreground bg-muted/50">
                  <th className="text-left px-5 py-3 font-medium">User</th>
                  <th className="text-left px-3 py-3 font-medium">Role</th>
                  <th className="text-left px-3 py-3 font-medium">Status</th>
                  <th className="text-left px-3 py-3 font-medium">Department</th>
                  <th className="text-left px-3 py-3 font-medium">Contact</th>
                  {canManage && <th className="text-right px-5 py-3 font-medium">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map(u => {
                  const label = DB_ROLE_TO_LABEL[u.role] ?? "Employee";
                  const status = statusOf(u);
                  return (
                    <tr key={u.id} className="border-t border-border hover:bg-muted/40 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-bold text-xs">
                            {initials(u.full_name)}
                          </div>
                          <div>
                            <div className="font-medium">{u.full_name}</div>
                            <div className="text-xs text-muted-foreground">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3.5">
                        {canManage ? (
                          <Select
                            value={label}
                            onValueChange={v => changeRole(u, v as Role)}
                            disabled={busyId === u.id}
                          >
                            <SelectTrigger className="h-8 w-36 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge variant="outline" className={roleStyles[label]}>{label}</Badge>
                        )}
                      </td>
                      <td className="px-3 py-3.5">
                        <Badge variant="outline" className={statusStyles[status]}>
                          {status === "suspended" ? "Suspended" : "Active"}
                        </Badge>
                      </td>
                      <td className="px-3 py-3.5 text-muted-foreground text-xs">{u.department ?? "—"}</td>
                      <td className="px-3 py-3.5">
                        <div className="text-xs text-muted-foreground inline-flex items-center gap-1">
                          <Mail className="w-3 h-3" /> {u.email}
                        </div>
                      </td>
                      {canManage && (
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="icon" variant="outline" className="h-8 w-8"
                              title="Edit details"
                              onClick={() => openEdit(u)}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="icon" variant="outline" className="h-8 w-8"
                              disabled={busyId === u.id || u.id === currentProfile?.id}
                              title={u.id === currentProfile?.id ? "You can't change your own status here" : (status === "suspended" ? "Reactivate user" : "Suspend user")}
                              onClick={() => toggleStatus(u)}
                            >
                              {busyId === u.id
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                : status === "suspended"
                                  ? <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                                  : <UserX className="w-3.5 h-3.5 text-destructive" />}
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {!canManage && (
          <div className="glass-card rounded-2xl p-5 flex items-center gap-3 border border-primary/20">
            <ShieldCheck className="w-5 h-5 text-primary shrink-0" />
            <div className="text-sm">
              <span className="font-semibold">Read-only view.</span>{" "}
              <span className="text-muted-foreground">Sign in as <span className="text-foreground font-medium">Admin</span> to see full management tools once real auth is wired up.</span>
            </div>
          </div>
        )}
      </main>
      <SiteFooter />

      {/* Create user dialog */}
      <Dialog
        open={createOpen}
        onOpenChange={(o: boolean) => { setCreateOpen(o); if (!o) setLastCreated(null); }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{lastCreated ? "Account created successfully" : "Create user account"}</DialogTitle>
            {!lastCreated && (
              <DialogDescription>
                Sets up their login directly. Share the password with them so they can sign in.
              </DialogDescription>
            )}
          </DialogHeader>

          {lastCreated ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm">
                <div className="font-medium text-emerald-700 mb-3 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" /> {lastCreated.full_name}
                </div>
                <div className="space-y-1.5">
                  <div><span className="text-muted-foreground">Email:</span> {lastCreated.email}</div>
                  <div><span className="text-muted-foreground">Password:</span> <span className="font-mono">{lastCreated.password}</span></div>
                  <div><span className="text-muted-foreground">Role:</span> {lastCreated.role}</div>
                  <div><span className="text-muted-foreground">Site:</span> {lastCreated.site_name}</div>
                  <div><span className="text-muted-foreground">Department:</span> {lastCreated.department}</div>
                  <div><span className="text-muted-foreground">Phone:</span> {lastCreated.phone}</div>
                </div>
                <Button
                  variant="outline" size="sm" className="w-full mt-3"
                  onClick={() => copyToClipboard(`Email: ${lastCreated.email}\nPassword: ${lastCreated.password}`, "Login details")}
                >
                  <Copy className="w-3.5 h-3.5 mr-1.5" /> Copy email & password
                </Button>
              </div>
              <Button className="w-full" onClick={() => { setCreateOpen(false); setLastCreated(null); }}>Done</Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="cu-name">Full name</Label>
                <Input id="cu-name" value={createForm.full_name} onChange={e => setCreateForm(f => ({ ...f, full_name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cu-email">Email</Label>
                <Input id="cu-email" type="email" value={createForm.email} onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cu-password">Password</Label>
                <div className="flex gap-2">
                  <Input id="cu-password" value={createForm.password} onChange={e => setCreateForm(f => ({ ...f, password: e.target.value }))} />
                  <Button type="button" variant="outline" size="icon" onClick={generatePassword} title="Generate password">
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Role</Label>
                  <Select value={createForm.role} onValueChange={v => setCreateForm(f => ({ ...f, role: v as Role }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CREATE_ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Site</Label>
                  <Select value={createForm.site_id} onValueChange={v => setCreateForm(f => ({ ...f, site_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select site" /></SelectTrigger>
                    <SelectContent>
                      {sites.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cu-dept">Department (optional)</Label>
                <Input id="cu-dept" value={createForm.department} onChange={e => setCreateForm(f => ({ ...f, department: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cu-phone">Phone (optional)</Label>
                <Input id="cu-phone" value={createForm.phone} onChange={e => setCreateForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                <Button onClick={createUser} disabled={creating}>
                  {creating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UserPlus className="w-4 h-4 mr-2" />}
                  Create account
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit user dialog */}
      <Dialog open={!!editUser} onOpenChange={(o: boolean) => { if (!o) setEditUser(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit {editUser?.full_name}</DialogTitle>
            <DialogDescription>Update their details. Role changes stay in the table dropdown.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="eu-name">Full name</Label>
              <Input id="eu-name" value={editForm.full_name} onChange={e => setEditForm(f => ({ ...f, full_name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Site</Label>
              <Select value={editForm.site_id} onValueChange={v => setEditForm(f => ({ ...f, site_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select site" /></SelectTrigger>
                <SelectContent>
                  {sites.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="eu-dept">Department</Label>
              <Input id="eu-dept" value={editForm.department} onChange={e => setEditForm(f => ({ ...f, department: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="eu-phone">Phone</Label>
              <Input id="eu-phone" value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={savingEdit}>
              {savingEdit ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function initials(name: string): string {
  return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}
