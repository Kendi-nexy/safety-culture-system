import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowUpRight, Building2, CheckCircle2, FileWarning,
  MapPin, Search, X,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Toaster } from "@/components/ui/sonner";
import { TopNav, SiteFooter, useAuth } from "@/lib/app-shell";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/zones")({
  component: ZonesPage,
  head: () => ({
    meta: [
      { title: "Zones & sites · SafeGuard" },
      { name: "description", content: "Report activity broken down by Siginon site." },
    ],
  }),
});

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

type Report = Tables<"reports">;
type Site = Tables<"sites">;

// NOTE ON SCHEMA: there is no `zones`/`departments` hierarchy table yet —
// that's still pending agreement with the partner (see backend plan doc).
// This page works off what actually exists today: the `sites` table plus
// `reports.zone`, which stores the site name chosen on the public report
// form. If/when a real site → department → zone hierarchy lands, this page
// is the one to revisit first.
function useZonesData() {
  const [sites, setSites] = useState<Site[] | null>(null);
  const [reports, setReports] = useState<Report[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [sitesRes, reportsRes] = await Promise.all([
        supabase.from("sites").select("*").order("name"),
        supabase.from("reports").select("*").order("created_at", { ascending: false }).limit(500),
      ]);
      if (cancelled) return;
      setSites(sitesRes.error ? [] : (sitesRes.data ?? []));
      setReports(reportsRes.error ? [] : (reportsRes.data ?? []));
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  return { sites: sites ?? [], reports: reports ?? [], loading };
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

type SiteSummary = {
  site: Site;
  reports: Report[];
  open: number;
  closed: number;
  low: number;
  medium: number;
  high: number;
  lastReportAt: string | null;
};

function buildSiteSummaries(sites: Site[], reports: Report[]): SiteSummary[] {
  return sites.map(site => {
    const siteReports = reports.filter(r => r.zone === site.name);
    const closedStatuses = ["resolved", "closed"];
    return {
      site,
      reports: siteReports,
      open: siteReports.filter(r => !closedStatuses.includes(r.status)).length,
      closed: siteReports.filter(r => closedStatuses.includes(r.status)).length,
      low: siteReports.filter(r => r.severity === "low").length,
      medium: siteReports.filter(r => r.severity === "medium").length,
      high: siteReports.filter(r => r.severity === "high").length,
      lastReportAt: siteReports[0]?.created_at ?? null, // reports already ordered desc
    };
  });
}

function ZonesPage() {
  const { role, ready, isAuthed } = useAuth();
  const { sites, reports, loading } = useZonesData();
  const [selectedSite, setSelectedSite] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (ready && !isAuthed && typeof window !== "undefined") {
      window.location.href = "/auth";
    }
  }, [ready, isAuthed]);

  const summaries = useMemo(() => buildSiteSummaries(sites, reports), [sites, reports]);

  const chartData = useMemo(
    () => summaries
      .map(s => ({ zone: s.site.name, count: s.reports.length }))
      .sort((a, b) => b.count - a.count),
    [summaries]
  );

  const tableReports = useMemo(() => {
    const base = selectedSite ? reports.filter(r => r.zone === selectedSite) : reports;
    if (!search.trim()) return base;
    const q = search.toLowerCase();
    return base.filter(r =>
      [r.reference_number, r.category, r.zone, r.assigned_to ?? ""].join(" ").toLowerCase().includes(q)
    );
  }, [reports, selectedSite, search]);

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
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Locations</div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">Zones & Sites</h1>
            <p className="text-muted-foreground text-sm mt-1">Report activity across every Siginon site.</p>
          </div>
          <Link to="/dashboard">
            <Button variant="outline" size="sm">
              Back to dashboard <ArrowUpRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
        </div>

        {loading && (
          <div className="text-sm text-muted-foreground">Loading site data…</div>
        )}

        {!loading && sites.length === 0 && (
          <div className="glass-card rounded-2xl p-8 text-center text-sm text-muted-foreground">
            No sites found in the `sites` table yet.
          </div>
        )}

        {/* Site cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {summaries.map(s => {
            const active = selectedSite === s.site.name;
            return (
              <button
                key={s.site.id}
                onClick={() => setSelectedSite(active ? null : s.site.name)}
                className={`glass-card rounded-2xl p-5 text-left relative overflow-hidden group transition-all ${
                  active ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "hover:shadow-md"
                }`}
              >
                <div className="absolute -right-6 -top-6 w-20 h-20 rounded-full blur-2xl opacity-20 group-hover:opacity-40 transition-opacity bg-primary" />
                <div className="relative flex items-start justify-between">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary border border-primary/20 flex items-center justify-center">
                    <Building2 className="w-4 h-4" />
                  </div>
                  {s.reports.length === 0 ? null : (
                    <Badge variant="outline" className="text-[10px]">
                      {s.reports.length} total
                    </Badge>
                  )}
                </div>
                <div className="font-semibold mt-3">{s.site.name}</div>

                {s.reports.length === 0 ? (
                  <p className="text-xs text-muted-foreground mt-2">No reports logged at this site yet.</p>
                ) : (
                  <>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <FileWarning className="w-3 h-3" /> {s.open} open
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> {s.closed} closed
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-3">
                      {s.low > 0 && <span className="inline-flex items-center gap-1 text-[10px] text-accent"><span className="w-1.5 h-1.5 rounded-full bg-accent" />{s.low}</span>}
                      {s.medium > 0 && <span className="inline-flex items-center gap-1 text-[10px] text-primary"><span className="w-1.5 h-1.5 rounded-full bg-primary" />{s.medium}</span>}
                      {s.high > 0 && <span className="inline-flex items-center gap-1 text-[10px] text-destructive"><span className="w-1.5 h-1.5 rounded-full bg-destructive" />{s.high}</span>}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-3 pt-3 border-t border-border">
                      Last report: {timeAgo(s.lastReportAt)}
                    </div>
                  </>
                )}
              </button>
            );
          })}
        </div>

        {/* Comparison chart */}
        {chartData.length > 0 && (
          <div className="glass-card rounded-2xl p-6">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Comparison</div>
            <h3 className="text-xl font-semibold mt-1 mb-4">Reports by site</h3>
            <div className="h-72">
              <ResponsiveContainer>
                <BarChart data={chartData} layout="vertical" margin={{ left: 8 }}>
                  <CartesianGrid stroke="oklch(0.9 0.01 250)" horizontal={false} />
                  <XAxis type="number" stroke="oklch(0.5 0.02 250)" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis dataKey="zone" type="category" stroke="oklch(0.3 0.02 250)" fontSize={12} tickLine={false} axisLine={false} width={70} />
                  <Tooltip contentStyle={{ background: "white", border: "1px solid oklch(0.9 0.01 250)", borderRadius: 12 }} />
                  <Bar dataKey="count" fill="oklch(0.68 0.19 45)" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Filtered report table */}
        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 sm:p-5 border-b border-border">
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold flex items-center gap-2 flex-wrap">
                Reports
                {selectedSite && (
                  <Badge variant="outline" className="border-primary/40 text-primary bg-primary/10">
                    <MapPin className="w-3 h-3 mr-1" /> {selectedSite}
                  </Badge>
                )}
              </h3>
              <p className="text-xs text-muted-foreground">
                {selectedSite ? `Filtered to ${selectedSite}` : "All sites"}
              </p>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search ref, zone, assignee…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9 w-full" />
            </div>
            {selectedSite && (
              <Button variant="outline" size="sm" onClick={() => setSelectedSite(null)}>
                <X className="w-4 h-4 mr-1" /> Clear filter
              </Button>
            )}
          </div>

          {!loading && tableReports.length === 0 && (
            <div className="p-6 text-sm text-muted-foreground">
              No reports match this filter.
            </div>
          )}

          {/* Mobile card list */}
          <div className="md:hidden divide-y divide-border">
            {tableReports.map(r => (
              <div key={r.id} className="p-4 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Link to="/reports/$reportId" params={{ reportId: r.id }} className="font-mono text-primary text-xs hover:underline">{r.reference_number}</Link>
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
                {tableReports.map(r => (
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
      </main>
      <SiteFooter />
    </div>
  );
}