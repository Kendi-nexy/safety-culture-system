import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Activity, AlertTriangle, ArrowUpRight, CheckCircle2, ChevronRight,
  Eye, FileWarning, Filter, Flame, HardHat, MapPin, Search,
  Siren, Sparkles, TrendingDown, TrendingUp, Zap,
} from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Toaster } from "@/components/ui/sonner";
import { TopNav, SiteFooter, useAuth, can, type Role } from "@/lib/app-shell";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/dashboard")({
  component: DashboardPage,
  head: () => ({
    meta: [
      { title: "Staff dashboard · SafeGuard" },
      { name: "description", content: "Live warehouse safety operations for supervisors, HSE officers and admins." },
    ],
  }),
});

/*
 * NOTE ON AUTH: this dashboard now queries Supabase directly for everything
 * below. That works for `select` calls allowed to any signed-in session
 * ("hse and admin see all reports" etc.) — but the current staff sign-in
 * (see src/lib/app-shell.tsx useAuth()) is still a local-only demo picker,
 * not a real supabase.auth session. Until real Supabase Auth + a matching
 * `profiles` row exists for the signed-in user, RLS will correctly return
 * zero rows here rather than leaking data — the queries themselves are
 * correct and will start working the moment real auth is wired in.
 */

const severityStyles: Record<string, string> = {
  high: "bg-destructive/10 text-destructive border-destructive/30",
  medium: "bg-primary/10 text-primary border-primary/30",
  low: "bg-accent/10 text-accent border-accent/30",
};
const statusStyles: Record<string, string> = {
  open: "bg-destructive/10 text-destructive border-destructive/30",
  assigned: "bg-primary/10 text-primary border-primary/30",
  in_progress: "bg-primary/10 text-primary border-primary/30",
  resolved: "bg-accent/10 text-accent border-accent/30",
  closed: "bg-accent/10 text-accent border-accent/30",
  reopened: "bg-destructive/10 text-destructive border-destructive/30",
};
const CATEGORY_COLORS: Record<string, string> = {
  near_miss: "oklch(0.68 0.19 45)",
  hazard: "oklch(0.6 0.22 25)",
  observation: "oklch(0.62 0.13 190)",
  good_catch: "oklch(0.6 0.16 260)",
  incident: "oklch(0.7 0.15 140)",
  unsafe_act: "oklch(0.55 0.2 300)",
  unsafe_condition: "oklch(0.55 0.2 320)",
  environmental: "oklch(0.65 0.15 160)",
  quality: "oklch(0.6 0.12 220)",
};

type Report = Tables<"reports">;
type StatusLogRow = Tables<"status_log">;

function useDashboardData() {
  const [reports, setReports] = useState<Report[] | null>(null);
  const [statusLog, setStatusLog] = useState<StatusLogRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [reportsRes, logRes] = await Promise.all([
        supabase.from("reports").select("*").order("created_at", { ascending: false }).limit(200),
        supabase.from("status_log").select("*").order("changed_at", { ascending: false }).limit(200),
      ]);
      if (cancelled) return;
      setReports(reportsRes.error ? [] : (reportsRes.data ?? []));
      setStatusLog(logRes.error ? [] : (logRes.data ?? []));
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  return { reports: reports ?? [], statusLog: statusLog ?? [], loading };
}

function DashboardPage() {
  const { role, profile, ready, isAuthed } = useAuth();
  const [search, setSearch] = useState("");
  const { reports, statusLog, loading } = useDashboardData();

  useEffect(() => {
    if (ready && !isAuthed && typeof window !== "undefined") {
      window.location.href = "/auth";
    }
  }, [ready, isAuthed]);

  // Client-side search only; row visibility itself is already enforced by RLS.
  const filtered = reports.filter(r =>
    [r.reference_number, r.category, r.zone, r.assigned_to ?? ""].join(" ").toLowerCase().includes(search.toLowerCase())
  );

  // These hooks must run on every render regardless of auth state below —
  // React requires the same hooks in the same order every time. Moving the
  // "not signed in yet" early return above this point caused a real bug:
  // "Rendered more hooks than during the previous render", because these
  // four useMemo calls were being skipped on the first render (when `ready`
  // was still false) and then suddenly called once `ready` became true.
  const trendData = useMemo(() => buildTrendData(reports, statusLog), [reports, statusLog]);
  const typeMix = useMemo(() => buildTypeMix(reports), [reports]);
  const zoneData = useMemo(() => buildZoneData(reports), [reports]);
  const kpis = useMemo(() => buildKpis(reports, statusLog), [reports, statusLog]);

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
        <Hero role={role} profile={profile} />
        <KpiRow kpis={kpis} />

        {loading && (
          <div className="text-sm text-muted-foreground">Loading live data…</div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 glass-card rounded-2xl p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="text-xs uppercase tracking-widest text-muted-foreground">Reporting activity</div>
                <h3 className="text-xl font-semibold mt-1">Reports vs closed actions</h3>
              </div>
              <Badge variant="outline" className="border-accent/40 text-accent bg-accent/10">
                <TrendingUp className="w-3 h-3 mr-1" /> last 7 days
              </Badge>
            </div>
            <div className="h-64">
              <ResponsiveContainer>
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="oklch(0.68 0.19 45)" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="oklch(0.68 0.19 45)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="oklch(0.62 0.13 190)" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="oklch(0.62 0.13 190)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="oklch(0.9 0.01 250)" vertical={false} />
                  <XAxis dataKey="d" stroke="oklch(0.5 0.02 250)" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="oklch(0.5 0.02 250)" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ background: "white", border: "1px solid oklch(0.9 0.01 250)", borderRadius: 12 }} />
                  <Area type="monotone" dataKey="reports" stroke="oklch(0.68 0.19 45)" strokeWidth={2.5} fill="url(#g1)" />
                  <Area type="monotone" dataKey="closed" stroke="oklch(0.62 0.13 190)" strokeWidth={2.5} fill="url(#g2)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="glass-card rounded-2xl p-6">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Report mix</div>
            <h3 className="text-xl font-semibold mt-1 mb-4">By type</h3>
            <div className="h-48">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={typeMix} dataKey="value" innerRadius={50} outerRadius={80} paddingAngle={3}>
                    {typeMix.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "white", border: "1px solid oklch(0.9 0.01 250)", borderRadius: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {typeMix.map(t => (
                <div key={t.name} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="w-2 h-2 rounded-full" style={{ background: t.color }} />
                  <span className="truncate capitalize">{t.name.replace("_", " ")}</span>
                  <span className="ml-auto text-foreground font-semibold">{t.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 glass-card rounded-2xl overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 sm:p-5 border-b border-border">
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold">Live reports</h3>
                <p className="text-xs text-muted-foreground">Real-time feed from all Siginon sites</p>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search ref, zone, assignee…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9 w-full" />
              </div>
              <Button variant="outline" size="sm" className="w-full sm:w-auto"><Filter className="w-4 h-4 mr-1" />Filter</Button>
            </div>

            {!loading && filtered.length === 0 && (
              <div className="p-6 text-sm text-muted-foreground">
                No reports visible yet. Once real staff auth is wired in and reports come through RLS, they'll show here.
              </div>
            )}

            {/* Mobile card list */}
            <div className="md:hidden divide-y divide-border">
              {filtered.map(r => (
                <div key={r.id} className="p-4 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-primary text-xs">
                      <Link to="/reports/$reportId" params={{ reportId: r.id }} className="hover:underline">{r.reference_number}</Link>
                    </span>
                    <Badge variant="outline" className={severityStyles[r.severity]}>{r.severity}</Badge>
                    <Badge variant="outline" className={statusStyles[r.status]}>{r.status.replace("_", " ")}</Badge>
                    <span className="ml-auto text-xs text-muted-foreground">{timeAgo(r.created_at)}</span>
                  </div>
                  <div className="text-sm font-medium capitalize">{r.category.replace("_", " ")}</div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" /> {r.zone}</span>
                    <span>Assignee: {r.assigned_to ?? "—"}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wider text-muted-foreground bg-muted/50">
                    <th className="text-left px-5 py-3 font-medium">Reference</th>
                    <th className="text-left px-3 py-3 font-medium">Type</th>
                    <th className="text-left px-3 py-3 font-medium">Zone</th>
                    <th className="text-left px-3 py-3 font-medium">Severity</th>
                    <th className="text-left px-3 py-3 font-medium">Status</th>
                    <th className="text-left px-3 py-3 font-medium">Assignee</th>
                    <th className="text-right px-5 py-3 font-medium">Logged</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => (
                    <tr key={r.id} className="border-t border-border hover:bg-muted/40 transition-colors">
                      <td className="px-5 py-3.5 font-mono text-primary text-xs">
                        <Link to="/reports/$reportId" params={{ reportId: r.id }} className="hover:underline">{r.reference_number}</Link>
                      </td>
                      <td className="px-3 py-3.5 capitalize">{r.category.replace("_", " ")}</td>
                      <td className="px-3 py-3.5"><span className="inline-flex items-center gap-1 text-muted-foreground"><MapPin className="w-3 h-3" />{r.zone}</span></td>
                      <td className="px-3 py-3.5"><Badge variant="outline" className={severityStyles[r.severity]}>{r.severity}</Badge></td>
                      <td className="px-3 py-3.5"><Badge variant="outline" className={statusStyles[r.status]}>{r.status.replace("_", " ")}</Badge></td>
                      <td className="px-3 py-3.5 text-muted-foreground">{r.assigned_to ?? "—"}</td>
                      <td className="px-5 py-3.5 text-right text-muted-foreground text-xs">{timeAgo(r.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-6">
            <div className="glass-card rounded-2xl p-6">
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Warehouse heat</div>
              <h3 className="text-xl font-semibold mt-1 mb-4">Incidents by zone</h3>
              <div className="h-56">
                <ResponsiveContainer>
                  <BarChart data={zoneData} layout="vertical" margin={{ left: 8 }}>
                    <CartesianGrid stroke="oklch(0.9 0.01 250)" horizontal={false} />
                    <XAxis type="number" stroke="oklch(0.5 0.02 250)" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis dataKey="zone" type="category" stroke="oklch(0.3 0.02 250)" fontSize={12} tickLine={false} axisLine={false} width={60} />
                    <Tooltip contentStyle={{ background: "white", border: "1px solid oklch(0.9 0.01 250)", borderRadius: 12 }} />
                    <Bar dataKey="count" fill="oklch(0.68 0.19 45)" radius={[0, 8, 8, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="glass-card rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-xs uppercase tracking-widest text-muted-foreground">Activity</div>
                  <h3 className="text-xl font-semibold mt-1">Recent updates</h3>
                </div>
                <Sparkles className="w-4 h-4 text-primary" />
              </div>
              <ActivityFeed reports={reports} statusLog={statusLog} />
            </div>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  return `${Math.floor(hrs / 24)} d ago`;
}

function buildTrendData(reports: Report[], statusLog: StatusLogRow[]) {
  const days: { key: string; d: string }[] = [];
  for (let i = 6; i >= 0; i--) {
    const dt = new Date();
    dt.setDate(dt.getDate() - i);
    days.push({ key: dt.toDateString(), d: dt.toLocaleDateString(undefined, { weekday: "short" }) });
  }
  return days.map(({ key, d }) => ({
    d,
    reports: reports.filter(r => r.created_at && new Date(r.created_at).toDateString() === key).length,
    closed: statusLog.filter(s => s.new_status === "closed" && s.changed_at && new Date(s.changed_at).toDateString() === key).length,
  }));
}

function buildTypeMix(reports: Report[]) {
  const counts = new Map<string, number>();
  for (const r of reports) counts.set(r.category, (counts.get(r.category) ?? 0) + 1);
  return Array.from(counts.entries())
    .map(([name, value]) => ({ name, value, color: CATEGORY_COLORS[name] ?? "oklch(0.6 0.1 250)" }))
    .sort((a, b) => b.value - a.value);
}

function buildZoneData(reports: Report[]) {
  const counts = new Map<string, number>();
  for (const r of reports) counts.set(r.zone, (counts.get(r.zone) ?? 0) + 1);
  return Array.from(counts.entries())
    .map(([zone, count]) => ({ zone, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
}

function buildKpis(reports: Report[], statusLog: StatusLogRow[]) {
  const open = reports.filter(r => !["resolved", "closed"].includes(r.status)).length;
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const nearMisses30d = reports.filter(r => r.category === "near_miss" && r.created_at && new Date(r.created_at).getTime() > thirtyDaysAgo).length;
  const goodCatches = reports.filter(r => r.category === "good_catch").length;

  const closes = statusLog.filter(s => s.new_status === "closed");
  const avgCloseMs = closes.length
    ? closes.reduce((sum, c) => {
        const report = reports.find(r => r.id === c.report_id);
        if (!report?.created_at || !c.changed_at) return sum;
        return sum + (new Date(c.changed_at).getTime() - new Date(report.created_at).getTime());
      }, 0) / closes.length
    : 0;
  const avgCloseDays = avgCloseMs > 0 ? (avgCloseMs / (24 * 60 * 60 * 1000)).toFixed(1) : "—";

  return [
    { label: "Open reports", value: String(open), icon: FileWarning, tint: "primary" },
    { label: "Near misses (30d)", value: String(nearMisses30d), icon: AlertTriangle, tint: "destructive" },
    { label: "Good catches", value: String(goodCatches), icon: Eye, tint: "accent" },
    { label: "Avg close time", value: avgCloseDays === "—" ? "—" : `${avgCloseDays}d`, icon: CheckCircle2, tint: "primary" },
  ];
}

function Hero({ role, profile }: { role: Role; profile: Tables<"profiles"> | null }) {
  const firstName = profile?.full_name?.split(" ")[0] ?? "there";
  return (
    <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/8 via-card to-accent/8 p-5 sm:p-8">
      <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-primary/15 blur-3xl" />
      <div className="absolute -bottom-16 -left-16 w-64 h-64 rounded-full bg-accent/15 blur-3xl" />
      <div className="relative flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="max-w-2xl min-w-0">
          <Badge variant="outline" className="border-primary/40 text-primary bg-primary/10 mb-3">
            <Zap className="w-3 h-3 mr-1" /> Signed in as {role}
          </Badge>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight leading-tight">
            Welcome back, {firstName}.
          </h1>
          <p className="text-muted-foreground mt-2 max-w-xl text-sm sm:text-base">
            {role === "Supervisor"
              ? "Triage new reports from your team, assign owners and drive corrective actions to close-out."
              : role === "HSE Officer"
                ? "Live view across all Siginon warehouses. Investigate, assign, close and learn — in seconds."
                : "Manage users, roles and system settings across every Siginon site."}
          </p>
        </div>
        <div className="flex gap-3 w-full md:w-auto">
          <Link to="/" className="w-full md:w-auto">
            <Button size="lg" variant="outline" className="w-full md:w-auto">
              View public report page <ArrowUpRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

function KpiRow({ kpis }: { kpis: ReturnType<typeof buildKpis> }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {kpis.map(k => (
        <div key={k.label} className="glass-card rounded-2xl p-5 relative overflow-hidden group">
          <div className={`absolute -right-6 -top-6 w-24 h-24 rounded-full blur-2xl opacity-20 group-hover:opacity-40 transition-opacity bg-${k.tint}`} />
          <div className="flex items-start justify-between relative">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-${k.tint}/15 text-${k.tint} border border-${k.tint}/20`}>
              <k.icon className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 text-3xl font-bold tracking-tight">{k.value}</div>
          <div className="text-xs text-muted-foreground mt-1">{k.label}</div>
        </div>
      ))}
    </div>
  );
}

function ActivityFeed({ reports, statusLog }: { reports: Report[]; statusLog: StatusLogRow[] }) {
  type FeedItem = { icon: any; tone: string; text: string; meta: string; ts: number };

  const fromLog: FeedItem[] = statusLog.slice(0, 10).map(s => {
    const report = reports.find(r => r.id === s.report_id);
    const closing = s.new_status === "closed" || s.new_status === "resolved";
    return {
      icon: closing ? CheckCircle2 : Activity,
      tone: closing ? "accent" : "primary",
      text: `${report?.reference_number ?? "Report"} → ${s.new_status.replace("_", " ")}`,
      meta: timeAgo(s.changed_at),
      ts: s.changed_at ? new Date(s.changed_at).getTime() : 0,
    };
  });

  const fromSubmissions: FeedItem[] = reports.slice(0, 10).map(r => ({
    icon: r.category === "good_catch" ? Eye : r.category === "hazard" ? Siren : FileWarning,
    tone: r.category === "good_catch" ? "accent" : r.severity === "high" ? "destructive" : "primary",
    text: `${r.reference_number} submitted — ${r.category.replace("_", " ")}`,
    meta: timeAgo(r.created_at),
    ts: r.created_at ? new Date(r.created_at).getTime() : 0,
  }));

  const items = [...fromLog, ...fromSubmissions].sort((a, b) => b.ts - a.ts).slice(0, 6);

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No activity yet.</p>;
  }

  return (
    <div className="space-y-3">
      {items.map((i, k) => (
        <div key={k} className="flex items-start gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-${i.tone}/10 text-${i.tone} border border-${i.tone}/20`}>
            <i.icon className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm truncate">{i.text}</div>
            <div className="text-xs text-muted-foreground">{i.meta}</div>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        </div>
      ))}
    </div>
  );
}