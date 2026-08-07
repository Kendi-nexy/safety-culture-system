import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ShieldCheck, Users as UsersIcon, Search, UserPlus, Mail,
  CheckCircle2, ArrowLeft, Trash2, Loader2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
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

type Profile = Tables<"profiles">;

// Inverse of DB_ROLE_TO_LABEL, for writing a selected display Role back to
// the lowercase value the `profiles.role` check constraint expects.
const LABEL_TO_DB_ROLE: Record<Role, string> = {
  Employee: "employee",
  Supervisor: "supervisor",
  "HSE Officer": "hse",
  Admin: "admin",
};

function UsersPage() {
  const { role, profile: currentProfile, ready, isAuthed } = useAuth();
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"All" | Role>("All");
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (ready && !isAuthed && typeof window !== "undefined") window.location.href = "/auth";
  }, [ready, isAuthed]);

  async function loadProfiles() {
    // Only readable by the signed-in user themself (their own row) or an
    // admin (all rows), per the "admins read all profiles" RLS policy.
    const { data, error } = await supabase.from("profiles").select("*").order("full_name");
    setProfiles(error ? [] : (data ?? []));
  }

  useEffect(() => {
    loadProfiles();
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

  async function deleteUser(user: Profile) {
    if (user.id === currentProfile?.id) return; // guarded in UI too, belt & braces
    const confirmed = window.confirm(
      `Remove ${user.full_name} from SafeGuard?\n\nThis deletes their profile row, so they immediately lose access to every role-gated page. It does NOT delete their underlying Supabase Auth account — full account deletion needs a service-role call, which isn't wired up yet.`
    );
    if (!confirmed) return;
    setBusyId(user.id);
    // Requires the "admins delete any profile" RLS policy — same migration
    // as changeRole above.
    const { error } = await supabase.from("profiles").delete().eq("id", user.id);
    setBusyId(null);
    if (error) {
      toast.error(`Couldn't remove ${user.full_name}`, { description: error.message });
      return;
    }
    toast.success(`${user.full_name} removed`);
    loadProfiles();
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
              <Link to="/dashboard" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-3">
                <ArrowLeft className="w-3 h-3" /> Back to dashboard
              </Link>
              <Badge variant="outline" className="border-fuchsia-500/40 text-fuchsia-700 bg-fuchsia-500/10 mb-3">
                <ShieldCheck className="w-3 h-3 mr-1" /> {canManage ? "Admin access" : "Read-only"}
              </Badge>
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Users & roles</h1>
              <p className="text-muted-foreground mt-2 max-w-xl text-sm sm:text-base">
                {canManage
                  ? "Change a role or remove access below. Inviting new users is on hold until the email-notification flow lands, so invites can reuse the same sending setup."
                  : "Directory of everyone with access to SafeGuard. Sign in as an Admin to manage users."}
              </p>
            </div>
            {canManage && (
              <Button size="lg" disabled className="bg-primary text-primary-foreground font-semibold w-full md:w-auto opacity-60" title="On hold until the partner's email-notification flow is ready, so invites can send through the same setup">
                <UserPlus className="w-4 h-4 mr-2" /> Invite user
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[
            { label: "Total users", value: counts.total, icon: UsersIcon, tint: "primary" },
            { label: "Admins", value: counts.admins, icon: ShieldCheck, tint: "destructive" },
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
              No profiles visible yet. This table is empty until real staff accounts sign up via Supabase Auth and get a row here — see README for the next step.
            </div>
          )}

          {/* Mobile card list */}
          <div className="md:hidden divide-y divide-border">
            {filtered.map(u => {
              const label = DB_ROLE_TO_LABEL[u.role] ?? "Employee";
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
                    <Badge variant="outline" className={roleStyles[label]}>{label}</Badge>
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
                        size="icon" variant="outline" className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                        disabled={busyId === u.id || u.id === currentProfile?.id}
                        title={u.id === currentProfile?.id ? "You can't remove your own account here" : "Remove user"}
                        onClick={() => deleteUser(u)}
                      >
                        {busyId === u.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
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
                  <th className="text-left px-3 py-3 font-medium">Department</th>
                  <th className="text-left px-3 py-3 font-medium">Contact</th>
                  {canManage && <th className="text-right px-5 py-3 font-medium">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map(u => {
                  const label = DB_ROLE_TO_LABEL[u.role] ?? "Employee";
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
                      <td className="px-3 py-3.5 text-muted-foreground text-xs">{u.department ?? "—"}</td>
                      <td className="px-3 py-3.5">
                        <div className="text-xs text-muted-foreground inline-flex items-center gap-1">
                          <Mail className="w-3 h-3" /> {u.email}
                        </div>
                      </td>
                      {canManage && (
                        <td className="px-5 py-3.5 text-right">
                          <Button
                            size="icon" variant="outline" className="h-8 w-8 text-destructive hover:text-destructive"
                            disabled={busyId === u.id || u.id === currentProfile?.id}
                            title={u.id === currentProfile?.id ? "You can't remove your own account here" : "Remove user"}
                            onClick={() => deleteUser(u)}
                          >
                            {busyId === u.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          </Button>
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
    </div>
  );
}

function initials(name: string): string {
  return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}