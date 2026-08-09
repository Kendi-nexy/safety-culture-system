import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  Activity, Bell, ClipboardList, FileWarning, LayoutDashboard,
  LogIn, LogOut, MapPin, Menu, Users, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import siginonLogo from "@/assets/siginon-logo.png.asset.json";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Role = "Employee" | "Supervisor" | "HSE Officer" | "Admin";
export const STAFF_ROLES: Role[] = ["Supervisor", "HSE Officer", "Admin"];
export const ROLES: Role[] = ["Employee", ...STAFF_ROLES];

// profiles.role is stored lowercase per the DB check constraint; map to the
// friendlier labels used throughout the UI.
const DB_ROLE_TO_LABEL: Record<string, Role> = {
  employee: "Employee",
  supervisor: "Supervisor",
  hse: "HSE Officer",
  admin: "Admin",
};

type Profile = Tables<"profiles">;

// Real Supabase Auth session + the matching `profiles` row, which is what
// actually drives RLS-scoped queries (assignee/hse/admin visibility, etc).
// If a user signs in but has no `profiles` row yet (e.g. wasn't seeded),
// `role`/`profile` stay null — see supabase/seed/seed_staff_profiles.sql for
// how to link an auth user to a role.
export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile(uid: string) {
      const { data } = await supabase.from("profiles").select("*").eq("id", uid).maybeSingle();
      if (!cancelled) setProfile(data ?? null);
    }

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      if (data.session) loadProfile(data.session.user.id);
      setReady(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (cancelled) return;
      setSession(newSession);
      if (newSession) {
        loadProfile(newSession.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const role = profile ? (DB_ROLE_TO_LABEL[profile.role] ?? null) : null;

  return {
    session,
    profile,
    role,
    ready,
    signIn,
    signOut,
    isAuthed: session !== null,
    // true once we know there's a session but it has no matching profiles
    // row — a distinct state from "not signed in" worth surfacing in the UI.
    missingProfile: session !== null && ready && profile === null,
  };
}

export const roleColors: Record<Role, string> = {
  Employee: "from-sky-500 to-blue-600",
  Supervisor: "from-amber-400 to-orange-500",
  "HSE Officer": "from-primary to-accent",
  Admin: "from-red-500 to-rose-600",
};

export function can(role: Role | null, action: "assign" | "close" | "manageUsers" | "viewAll" | "report" | "comment"): boolean {
  if (action === "report") return true;
  if (!role) return false;
  if (action === "viewAll") return role !== "Employee";
  if (action === "assign" || action === "close" || action === "comment") return STAFF_ROLES.includes(role);
  if (action === "manageUsers") return role === "Admin";
  return false;
}

type NavItem = { icon: any; label: string; to: string; roles?: Role[]; publicItem?: boolean };

const NAV: NavItem[] = [
  { icon: FileWarning, label: "Report an issue", to: "/", publicItem: true },
  { icon: LayoutDashboard, label: "Dashboard", to: "/dashboard", roles: STAFF_ROLES },
  { icon: ClipboardList, label: "Corrective actions", to: "/corrective-actions", roles: STAFF_ROLES },
  { icon: MapPin, label: "Zones & sites", to: "/zones", roles: STAFF_ROLES },
  { icon: Activity, label: "Analytics", to: "/analytics", roles: ["HSE Officer", "Admin"] },
  { icon: Users, label: "Users", to: "/users", roles: ["HSE Officer", "Admin"] },
];

export function TopNav() {
  const { role, profile, signOut, isAuthed } = useAuth();
  const pathname = useRouterState({ select: s => s.location.pathname });
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const items = NAV.filter(i => i.publicItem || (role && i.roles?.includes(role)));

  return (
    <header className="sticky top-0 z-40 backdrop-blur-xl bg-background/80 border-b border-border">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center gap-4">
        <Link to="/" className="flex items-center gap-2.5 shrink-0">
          <img
            src={siginonLogo.url}
            alt="Siginon Group"
            className="h-9 sm:h-10 w-auto object-contain"
          />
          <div className="hidden sm:block leading-tight">
            <div className="font-bold text-sm tracking-tight leading-none">Safety Culture</div>
            <div className="text-[10px] uppercase tracking-widest text-accent font-semibold mt-0.5">System</div>
          </div>
        </Link>

        <nav className="hidden lg:flex items-center gap-1 ml-4">
          {items.map(it => {
            const active = pathname === it.to;
            return (
              <Link
                key={it.label}
                to={it.to}
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-foreground/70 hover:text-foreground hover:bg-muted"
                }`}
              >
                <it.icon className="w-4 h-4" />
                {it.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex-1" />

        {isAuthed && (
          <Button variant="ghost" size="icon" className="hidden sm:inline-flex">
            <Bell className="w-4 h-4" />
          </Button>
        )}

        {isAuthed && role && profile ? (
          <div className="hidden sm:flex items-center gap-3 pl-3 border-l border-border">
            <div className="text-right leading-tight">
              <div className="text-sm font-semibold">{profile.full_name}</div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{role}</div>
            </div>
            <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${roleColors[role]} flex items-center justify-center text-white font-bold text-xs shadow-sm`}>
              {initials(profile.full_name)}
            </div>
            <Button variant="ghost" size="icon" onClick={() => { signOut(); router.navigate({ to: "/" }); }} title="Sign out">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        ) : (
          <Link to="/auth">
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90 hi-vis-glow font-semibold">
              <LogIn className="w-4 h-4 mr-1.5" /> Staff sign in
            </Button>
          </Link>
        )}

        <button
          className="lg:hidden p-2 -mr-2"
          onClick={() => setOpen(o => !o)}
          aria-label="Toggle menu"
        >
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {open && (
        <div className="lg:hidden border-t border-border bg-card">
          <nav className="px-4 py-2 space-y-1">
            {items.map(it => (
              <Link
                key={it.label}
                to={it.to}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm hover:bg-muted"
              >
                <it.icon className="w-4 h-4" />
                {it.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-border bg-card/60 backdrop-blur">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        <img
          src={siginonLogo.url}
          alt="Siginon Group"
          className="h-10 sm:h-12 w-auto object-contain"
        />
        <div className="text-xs text-muted-foreground text-center sm:text-right">
          © {new Date().getFullYear()} Siginon Group. SafeGuard HSE reporting platform.
          <div className="mt-0.5">Aligned with DOSH Kenya incident reporting standards.</div>
        </div>
      </div>
    </footer>
  );
}

function initials(name: string): string {
  return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}
