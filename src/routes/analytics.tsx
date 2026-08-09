import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight, CheckCircle2, Clock, Eye, FileWarning, Gauge, TrendingUp,
} from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Toaster } from "@/components/ui/sonner";
import { TopNav, SiteFooter, useAuth } from "@/lib/app-shell";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/analytics")({
  component: AnalyticsPage,
  head: () => ({
    meta: [
      { title: "Analytics · SafeGuard" },
      { name: "description", content: "Trends, SLA compliance and breakdowns across Siginon HSE reporting." },
    ],
  }),
});

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
const SEVERITY_COLORS: Record<string, string> = {
  low: "oklch(0.62 0.13 190)",
  medium: "oklch(0.68 0.19 45)",
  high: "oklch(0.6 0.22 25)",
};

type Report = Tables<"reports">;
type StatusLogRow = Tables<"status_log">;
type SlaRule = Tables<"sla_rules">;

const RANGE_OPTIONS = [
  { key: "7", label: "7 days", days: 7 },
  { key: "30", label: "30 days", days: 30 },
  { key: "90", label: "90 days", days: 90 },
  { key: "all", label: "All time", days: null },
] as const;
type RangeKey = (typeof RANGE_OPTIONS)[number]["key"];

function useAnalyticsData() {
  const [reports, setReports] = useState<Report[] | null>(null);
  const [statusLog, setStatusLog] = useState<StatusLogRow[] | null>(null);
  const [slaRules, setSlaRules] = useState<SlaRule[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [reportsRes, logRes, slaRes] = await Promise.all([
        supabase.from("reports").select("*").order("created_at", { ascending: false }).limit(1000),
        supabase.from("status_log").select("*").order("changed_at", { ascending: false }).limit(1000),
        supabase.from("sla_rules").select("*"),
      ]);
      if (cancelled) return;
      setReports(reportsRes.error ? [] : (reportsRes.data ?? []));
      setStatusLog(logRes.error ? [] : (logRes.data ?? []));
      setSlaRules(slaRes.error ? [] : (slaRes.data ?? []));
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  return { reports: reports ?? [], statusLog: statusLog ?? [], slaRules: slaRules ?? [], loading };
}

function buildTrendData(reports: Report[], statusLog: StatusLogRow[], days: number) {
  const buckets: { key: string; d: string }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const dt = new Date();
    dt.setDate(dt.getDate() - i);
    buckets.push({
      key: dt.toDateString(),
      d: days <= 14
        ? dt.toLocaleDateString(undefined, { weekday: "short" })
        : dt.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    });
  }
  return buckets.map(({ key, d }) => ({
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

function buildSeverityMix(reports: Report[]) {
  return ["low", "medium", "high"].map(sev => ({
    name: sev,
    value: reports.filter(r => r.severity === sev).length,
    color: SEVERITY_COLORS[sev],
  }));
}

function buildZoneData(reports: Report[]) {
  const counts = new Map<string, number>();
  for (const r of reports) counts.set(r.zone, (counts.get(r.zone) ?? 0) + 1);
  return Array.from(counts.entries())
    .map(([zone, count]) => ({ zone, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

// SLA compliance: for each severity, of the reports that reached
// resolved/closed, what share hit that status before their due_at?
function buildSlaCompliance(reports: Report[], statusLog: StatusLogRow[], slaRules: SlaRule[]) {
  return slaRules.map(rule => {
    const inSeverity = reports.filter(r => r.severity === rule.severity);
    const resolvedReports = inSeverity.filter(r => ["resolved", "closed"].includes(r.status) && r.due_at);
    let onTime = 0;
    for (const r of resolvedReports) {
      const firstResolve = statusLog
        .filter(s => s.report_id === r.id && (s.new_status === "resolved" || s.new_status === "closed"))
        .sort((a, b) => new Date(a.changed_at ?? 0).getTime() - new Date(b.changed_at ?? 0).getTime())[0];
      const resolvedAt = firstResolve?.changed_at ? new Date(firstResolve.changed_at) : null;
      if (resolvedAt && r.due_at && resolvedAt.getTime() <= new Date(r.due_at).getTime()) onTime++;
    }
    return {
      severity: rule.severity,
      responseHours: rule.response_hours,
      resolutionHours: rule.resolution_hours,
      resolvedCount: resolvedReports.length,
      onTime,
      pct: resolvedReports.length > 0 ? Math.round((onTime / resolvedReports.length) * 100) : null,
    };
  });
}

function buildAvgCloseDays(reports: Report[], statusLog: StatusLogRow[]): string {
  const closes = statusLog.filter(s => s.new_status === "closed");
  const avgMs = closes.length
    ? closes.reduce((sum, c) => {
        const report = reports.find(r => r.id === c.report_id);
        if (!report?.created_at || !c.changed_at) return sum;
        return sum + (new Date(c.changed_at).getTime() - new Date(report.created_at).getTime());
      }, 0) / closes.length
    : 0;
  return avgMs > 0 ? (avgMs / (24 * 60 * 60 * 1000)).toFixed(1) : "—";
}

function AnalyticsPage() {
  const { role, ready, isAuthed } = useAuth();
  const { reports, statusLog, slaRules, loading } = useAnalyticsData();
  const [range, setRange] = useState<RangeKey>("30");

  useEffect(() => {
    if (ready && !isAuthed && typeof window !== "undefined") {
      window.location.href = "/auth";
    }
  }, [ready, isAuthed]);

  const rangeDef = RANGE_OPTIONS.find(r => r.key === range)!;

  const scopedReports = useMemo(() => {
    if (rangeDef.days === null) return reports;
    const cutoff = Date.now() - rangeDef.days * 24 * 60 * 60 * 1000;
    return reports.filter(r => r.created_at && new Date(r.created_at).getTime() > cutoff);
  }, [reports, rangeDef]);

  const trendData = useMemo(
    () => buildTrendData(scopedReports, statusLog, rangeDef.days ?? 90),
    [scopedReports, statusLog, rangeDef]
  );
  const typeMix = useMemo(() => buildTypeMix(scopedReports), [scopedReports]);
  const severityMix = useMemo(() => buildSeverityMix(scopedReports), [scopedReports]);
  const zoneData = useMemo(() => buildZoneData(scopedReports), [scopedReports]);
  const slaCompliance = useMemo(
    () => buildSlaCompliance(scopedReports, statusLog, slaRules),
    [scopedReports, statusLog, slaRules]
  );
  const avgCloseDays = useMemo(() => buildAvgCloseDays(scopedReports, statusLog), [scopedReports, statusLog]);

  const kpis = useMemo(() => {
    const total = scopedReports.length;
    const nearMisses = scopedReports.filter(r => r.category === "near_miss").length;
    const goodCatches = scopedReports.filter(r => r.category === "good_catch").length;
    const overallOnTime = slaCompliance.reduce((sum, s) => sum + s.onTime, 0);
    const overallResolved = slaCompliance.reduce((sum, s) => sum + s.resolvedCount, 0);
    return {
      total,
      nearMisses,
      goodCatches,
      avgCloseDays,
      slaPct: overallResolved > 0 ? Math.round((overallOnTime / overallResolved) * 100) : null,
    };
  }, [scopedReports, slaCompliance, avgCloseDays]);

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
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Insights</div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">Analytics</h1>
            <p className="text-muted-foreground text-sm mt-1">Trends and SLA compliance across every Siginon site.</p>
          </div>
          <Link to="/dashboard">
            <Button variant="outline" size="sm">
              Back to dashboard <ArrowUpRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
        </div>

        {/* Range picker */}
        <div className="flex items-center gap-2 flex-wrap">
          {RANGE_OPTIONS.map(opt => (
            <Button
              key={opt.key}
              size="sm"
              variant={range === opt.key ? "default" : "outline"}
              className={range === opt.key ? "bg-primary text-primary-foreground" : ""}
              onClick={() => setRange(opt.key)}
            >
              {opt.label}
            </Button>
          ))}
        </div>

        {loading && <div className="text-sm text-muted-foreground">Loading analytics…</div>}

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {[
            { label: "Total reports", value: String(kpis.total), icon: FileWarning, tint: "primary" },
            { label: "Near misses", value: String(kpis.nearMisses), icon: TrendingUp, tint: "destructive" },
            { label: "Good catches", value: String(kpis.goodCatches), icon: Eye, tint: "accent" },
            { label: "Avg close time", value: kpis.avgCloseDays === "—" ? "—" : `${kpis.avgCloseDays}d`, icon: Clock, tint: "primary" },
            { label: "SLA on-time", value: kpis.slaPct === null ? "—" : `${kpis.slaPct}%`, icon: Gauge, tint: "accent" },
          ].map(k => (
            <div key={k.label} className="glass-card rounded-2xl p-5 relative overflow-hidden group">
              <div className={`absolute -right-6 -top-6 w-24 h-24 rounded-full blur-2xl opacity-20 group-hover:opacity-40 transition-opacity bg-${k.tint}`} />
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-${k.tint}/15 text-${k.tint} border border-${k.tint}/20 relative`}>
                <k.icon className="w-5 h-5" />
              </div>
              <div className="mt-4 text-3xl font-bold tracking-tight">{k.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{k.label}</div>
            </div>
          ))}
        </div>

        {/* Trend + type mix */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 glass-card rounded-2xl p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="text-xs uppercase tracking-widest text-muted-foreground">Reporting activity</div>
                <h3 className="text-xl font-semibold mt-1">Reports vs closed actions</h3>
              </div>
              <Badge variant="outline" className="border-accent/40 text-accent bg-accent/10">
                <TrendingUp className="w-3 h-3 mr-1" /> {rangeDef.label}
              </Badge>
            </div>
            <div className="h-64">
              <ResponsiveContainer>
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="ag1" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="oklch(0.68 0.19 45)" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="oklch(0.68 0.19 45)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="ag2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="oklch(0.62 0.13 190)" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="oklch(0.62 0.13 190)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="oklch(0.9 0.01 250)" vertical={false} />
                  <XAxis dataKey="d" stroke="oklch(0.5 0.02 250)" fontSize={11} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis stroke="oklch(0.5 0.02 250)" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ background: "white", border: "1px solid oklch(0.9 0.01 250)", borderRadius: 12 }} />
                  <Area type="monotone" dataKey="reports" stroke="oklch(0.68 0.19 45)" strokeWidth={2.5} fill="url(#ag1)" />
                  <Area type="monotone" dataKey="closed" stroke="oklch(0.62 0.13 190)" strokeWidth={2.5} fill="url(#ag2)" />
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

        {/* Severity + zones */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="glass-card rounded-2xl p-6">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Risk profile</div>
            <h3 className="text-xl font-semibold mt-1 mb-4">By severity</h3>
            <div className="h-48">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={severityMix} dataKey="value" innerRadius={50} outerRadius={80} paddingAngle={3}>
                    {severityMix.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "white", border: "1px solid oklch(0.9 0.01 250)", borderRadius: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-2">
              {severityMix.map(s => (
                <div key={s.name} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                  <span className="truncate capitalize">{s.name}</span>
                  <span className="ml-auto text-foreground font-semibold">{s.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="xl:col-span-2 glass-card rounded-2xl p-6">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Warehouse heat</div>
            <h3 className="text-xl font-semibold mt-1 mb-4">Top sites by report volume</h3>
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
        </div>

        {/* SLA compliance table */}
        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="p-5 border-b border-border">
            <h3 className="text-lg font-semibold flex items-center gap-2"><Gauge className="w-4 h-4 text-primary" /> SLA compliance</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Share of resolved/closed reports that hit their `sla_rules` target for the selected range.
            </p>
          </div>
          {slaRules.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">No SLA rules configured.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wider text-muted-foreground bg-muted/50">
                    <th className="text-left px-5 py-3 font-medium">Severity</th>
                    <th className="text-left px-3 py-3 font-medium">Response target</th>
                    <th className="text-left px-3 py-3 font-medium">Resolution target</th>
                    <th className="text-left px-3 py-3 font-medium">Resolved this range</th>
                    <th className="text-left px-3 py-3 font-medium">On time</th>
                    <th className="text-right px-5 py-3 font-medium">Compliance</th>
                  </tr>
                </thead>
                <tbody>
                  {slaCompliance.map(s => (
                    <tr key={s.severity} className="border-t border-border">
                      <td className="px-5 py-3.5">
                        <Badge variant="outline" className="capitalize">{s.severity}</Badge>
                      </td>
                      <td className="px-3 py-3.5 text-muted-foreground">{s.responseHours}h</td>
                      <td className="px-3 py-3.5 text-muted-foreground">{s.resolutionHours}h</td>
                      <td className="px-3 py-3.5 text-muted-foreground">{s.resolvedCount}</td>
                      <td className="px-3 py-3.5 text-muted-foreground">{s.onTime}</td>
                      <td className="px-5 py-3.5 text-right">
                        {s.pct === null ? (
                          <span className="text-muted-foreground text-xs">No data</span>
                        ) : (
                          <span className={`font-semibold ${s.pct >= 80 ? "text-accent" : s.pct >= 50 ? "text-primary" : "text-destructive"}`}>
                            {s.pct}%
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {!loading && scopedReports.length === 0 && (
          <div className="glass-card rounded-2xl p-8 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
            <CheckCircle2 className="w-4 h-4" /> No reports in this range yet — charts will populate once real submissions come in.
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
