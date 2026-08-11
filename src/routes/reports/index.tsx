import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, Columns3, FileText,
  FileWarning, Flag, Grid2X2, Inbox, ListFilter, Mail, MailOpen, MapPin,
  MessageSquarePlus, RefreshCcw, Search, Settings2, ShieldCheck, Square,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { TopNav, SiteFooter, useAuth } from "@/lib/app-shell";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/reports/")({
  component: ReportsPage,
  head: () => ({
    meta: [
      { title: "All reports · SafeGuard" },
      { name: "description", content: "Every safety report across Siginon warehouses." },
    ],
  }),
});

type Report = Tables<"reports">;
type Profile = Tables<"profiles">;

const WORKFLOW_STATUSES = ["open", "in_progress", "closed"] as const;

function useReportsData() {
  const [reports, setReports] = useState<Report[] | null>(null);
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [reportsRes, profilesRes] = await Promise.all([
        supabase.from("reports").select("*").order("created_at", { ascending: false }).limit(500),
        supabase.from("profiles").select("*").order("full_name"),
      ]);
      if (cancelled) return;
      setReports(reportsRes.error ? [] : (reportsRes.data ?? []));
      setProfiles(profilesRes.error ? [] : (profilesRes.data ?? []));
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  return { reports: reports ?? [], setReports, profiles: profiles ?? [], loading };
}

function ReportsPage() {
  const { role, ready, isAuthed } = useAuth();
  const [search, setSearch] = useState("");
  const { reports, setReports, profiles, loading } = useReportsData();
  const navigate = useNavigate();

  const [closingReport, setClosingReport] = useState<Report | null>(null);
  const [resolution, setResolution] = useState("");
  const [closureComments, setClosureComments] = useState("");
  const [savingReportId, setSavingReportId] = useState<string | null>(null);

  useEffect(() => {
    if (ready && !isAuthed && typeof window !== "undefined") {
      window.location.href = "/auth";
    }
  }, [ready, isAuthed]);

  const filtered = reports.filter(r =>
    [
      r.reference_number, r.category, r.zone, assigneeName(r, profiles),
      r.reporter_name ?? "", r.reporter_email ?? "", r.description,
    ].join(" ").toLowerCase().includes(search.toLowerCase())
  );

  const openCount = reports.filter(r => !["resolved", "closed"].includes(r.status)).length;
  const overdueCount = reports.filter(r => r.overdue === true).length;
  const closedCount = reports.filter(r => ["resolved", "closed"].includes(r.status)).length;

  async function updateStatus(report: Report, nextStatus: string) {
    if (!WORKFLOW_STATUSES.includes(nextStatus as (typeof WORKFLOW_STATUSES)[number])) return;
    if (nextStatus === report.status) return;

    if (nextStatus === "closed") {
      setClosingReport(report);
      setResolution(report.resolution ?? "");
      setClosureComments(report.closure_comments ?? "");
      return;
    }

    setSavingReportId(report.id);
    const { data, error } = await supabase.rpc("update_report_workflow", {
      p_report_id: report.id,
      p_status: nextStatus,
      p_resolution: null,
      p_closure_comments: null,
    });
    setSavingReportId(null);

    if (error || !data) {
      toast.error("Status update failed", { description: error?.message ?? "Please try again." });
      return;
    }
    setReports(current => (current ?? []).map(r => r.id === data.id ? data : r));
    toast.success(`Report marked as ${nextStatus === "in_progress" ? "in progress" : nextStatus}`);
  }

  async function closeReport() {
    if (!closingReport) return;
    if (!resolution.trim() || !closureComments.trim()) {
      toast.error("Resolution and closure comments are required to close a report.");
      return;
    }

    setSavingReportId(closingReport.id);
    const { data, error } = await supabase.rpc("update_report_workflow", {
      p_report_id: closingReport.id,
      p_status: "closed",
      p_resolution: resolution.trim(),
      p_closure_comments: closureComments.trim(),
    });
    setSavingReportId(null);

    if (error || !data) {
      toast.error("Could not close report", { description: error?.message ?? "Please try again." });
      return;
    }
    setReports(current => (current ?? []).map(r => r.id === data.id ? data : r));
    setClosingReport(null);
    setResolution("");
    setClosureComments("");
    toast.success("Report closed with resolution");
  }

  const navigateToReport = (reportId: string) => {
    navigate({ to: "/reports/$reportId", params: { reportId } });
  };

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
        <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/8 via-card to-accent/8 p-5 sm:p-8">
          <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-primary/15 blur-3xl" />
          <div className="relative min-w-0">
            <Link to="/dashboard" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-3">
              <ArrowLeft className="w-3 h-3" /> Back to dashboard
            </Link>
            <Badge variant="outline" className="border-primary/40 text-primary bg-primary/10 mb-3">
              <ShieldCheck className="w-3 h-3 mr-1" /> Signed in as {role}
            </Badge>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">All reports</h1>
            <p className="text-muted-foreground mt-2 max-w-xl text-sm sm:text-base">
              Every safety report across every Siginon site — search, triage and close out from here.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[
            { label: "Total reports", value: reports.length, icon: FileText, tint: "primary" },
            { label: "Open", value: openCount, icon: FileWarning, tint: "primary" },
            { label: "Overdue", value: overdueCount, icon: AlertTriangle, tint: "destructive" },
            { label: "Closed", value: closedCount, icon: CheckCircle2, tint: "accent" },
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
          <div className="border-b border-border bg-card/90">
            <div className="flex flex-col gap-3 px-3 py-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" className="h-8 px-2.5 bg-white">
                  <Inbox className="w-4 h-4 text-primary" />
                  <span className="font-semibold">All Reports</span>
                </Button>
                <IconTool label="Add report"><MessageSquarePlus /></IconTool>
                <IconTool label="List options"><ListFilter /></IconTool>
                <div className="relative w-52">
                  <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search reports"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="h-8 pl-8 text-xs bg-white"
                  />
                </div>
                <IconTool label="Columns"><Columns3 /></IconTool>
                <IconTool label="Refresh"><RefreshCcw /></IconTool>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="hidden sm:flex h-8 items-center rounded-md border border-input bg-white px-2.5 text-xs text-muted-foreground">
                  {loading ? "Loading..." : `${filtered.length} of ${reports.length}`}
                </div>
                <IconTool label="Previous page"><ArrowLeft /></IconTool>
                <IconTool label="Next page"><ArrowRight /></IconTool>
                <Badge variant="outline" className="h-8 gap-1.5 rounded-md border-accent/35 bg-accent/10 text-accent">
                  <FileText className="w-3.5 h-3.5" />
                  All Tasks
                  <span className="rounded-full bg-muted-foreground px-1.5 py-0.5 text-[10px] leading-none text-white">{openCount}</span>
                </Badge>
                <IconTool label="Grid view"><Grid2X2 /></IconTool>
                <IconTool label="Density"><Settings2 /></IconTool>
              </div>
            </div>
          </div>

          {!loading && filtered.length === 0 && (
            <div className="p-6 text-sm text-muted-foreground">
              No reports visible yet. Once real staff auth is wired in and reports come through RLS, they'll show here.
            </div>
          )}

          {/* Mobile card list */}
          <div className="md:hidden divide-y divide-emerald-100 bg-emerald-50/70">
            {filtered.map(r => (
              <div
                key={r.id}
                className="p-4 space-y-2 cursor-pointer hover:bg-emerald-100/60 active:bg-emerald-100/80 transition-colors"
                onClick={() => navigateToReport(r.id)}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-primary text-xs font-semibold">{r.reference_number}</span>
                  <StatusMarker report={r} />
                  <span className="ml-auto text-xs text-muted-foreground">{formatReportDate(r.created_at)}</span>
                </div>
                <div className="text-sm font-semibold line-clamp-1">{reportSubject(r)}</div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><UserRound className="w-3 h-3" /> {reportRequester(r)}</span>
                  <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" /> {r.zone}</span>
                  <span>Assigned: {assigneeName(r, profiles)}</span>
                </div>
                <div onClick={e => e.stopPropagation()}>
                  <ReportStatusControl
                    report={r}
                    disabled={savingReportId === r.id}
                    onStatusChange={next => updateStatus(r, next)}
                  />
                </div>
                {r.status === "closed" && (r.resolution || r.closure_comments) && (
                  <div className="rounded-lg border border-emerald-200 bg-white/70 p-3 text-xs">
                    {r.resolution && <div><span className="font-semibold">Resolution:</span> {r.resolution}</div>}
                    {r.closure_comments && <div className="mt-1"><span className="font-semibold">Closure:</span> {r.closure_comments}</div>}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full min-w-[1180px] border-collapse text-[12px]">
              <thead>
                <tr className="bg-muted/70 text-left text-[11px] font-semibold text-foreground">
                  <th className="w-10 border-r border-border px-3 py-2"><Square className="w-3.5 h-3.5 text-muted-foreground" /></th>
                  <th className="w-10 border-r border-border px-2 py-2"></th>
                  <th className="w-10 border-r border-border px-2 py-2"></th>
                  <th className="w-24 border-r border-border px-3 py-2">ID</th>
                  <th className="min-w-[210px] border-r border-border px-3 py-2">Subject</th>
                  <th className="w-40 border-r border-border px-3 py-2">Requester</th>
                  <th className="w-40 border-r border-border px-3 py-2">Assigned To</th>
                  <th className="w-40 border-r border-border px-3 py-2">DueBy Date</th>
                  <th className="w-40 border-r border-border px-3 py-2">Status</th>
                  <th className="w-44 border-r border-border px-3 py-2">Created Date</th>
                  <th className="w-28 px-3 py-2">Site</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr
                    key={r.id}
                    className="border-t border-emerald-100 bg-emerald-50/80 text-foreground hover:bg-emerald-100/80 transition-colors cursor-pointer group"
                    onClick={() => navigateToReport(r.id)}
                  >
                    <td className="border-r border-emerald-100 px-3 py-3" onClick={e => e.stopPropagation()}>
                      <Square className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                    </td>
                    <td className="border-r border-emerald-100 px-2 py-3 text-center" onClick={e => e.stopPropagation()}>
                      <MailState report={r} />
                    </td>
                    <td className="border-r border-emerald-100 px-2 py-3 text-center" onClick={e => e.stopPropagation()}>
                      <FileText className="mx-auto w-4 h-4 text-muted-foreground/70" />
                    </td>
                    <td className="border-r border-emerald-100 px-3 py-3 font-mono font-semibold text-primary">
                      {compactReference(r.reference_number)}
                    </td>
                    <td className="border-r border-emerald-100 px-3 py-3 font-semibold">
                      <div className="max-w-[260px] truncate">{reportSubject(r)}</div>
                    </td>
                    <td className="border-r border-emerald-100 px-3 py-3">{reportRequester(r)}</td>
                    <td className="border-r border-emerald-100 px-3 py-3 font-medium">{assigneeName(r, profiles)}</td>
                    <td className="border-r border-emerald-100 px-3 py-3 font-medium">{formatReportDate(r.due_at)}</td>
                    <td className="border-r border-emerald-100 px-3 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        <StatusMarker report={r} />
                        <ReportStatusControl
                          report={r}
                          disabled={savingReportId === r.id}
                          compact
                          onStatusChange={next => updateStatus(r, next)}
                        />
                      </div>
                      {r.status === "closed" && r.resolution && (
                        <div className="mt-1 max-w-[220px] truncate text-[11px] text-muted-foreground" title={r.resolution}>
                          {r.resolution}
                        </div>
                      )}
                    </td>
                    <td className="border-r border-emerald-100 px-3 py-3 font-medium">{formatReportDate(r.created_at)}</td>
                    <td className="px-3 py-3">{r.zone || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {closingReport && (
            <div className="border-t border-border bg-card p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">Close {closingReport.reference_number}</div>
                  <div className="text-xs text-muted-foreground">Add the resolution and closure comments before saving.</div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setClosingReport(null)}>Cancel</Button>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Resolution</Label>
                  <Textarea
                    value={resolution}
                    onChange={e => setResolution(e.target.value)}
                    className="mt-1.5 min-h-24"
                    placeholder="What fixed or controlled the issue?"
                  />
                </div>
                <div>
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Closure comments</Label>
                  <Textarea
                    value={closureComments}
                    onChange={e => setClosureComments(e.target.value)}
                    className="mt-1.5 min-h-24"
                    placeholder="Verification, follow-up notes, or handover comments"
                  />
                </div>
              </div>
              <div className="mt-3 flex justify-end">
                <Button onClick={closeReport} disabled={savingReportId === closingReport.id}>
                  <CheckCircle2 className="w-4 h-4 mr-1" />
                  {savingReportId === closingReport.id ? "Saving..." : "Save closure"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

function ReportStatusControl({
  report,
  disabled,
  compact,
  onStatusChange,
}: {
  report: Report;
  disabled: boolean;
  compact?: boolean;
  onStatusChange: (status: string) => void;
}) {
  const value = WORKFLOW_STATUSES.includes(report.status as (typeof WORKFLOW_STATUSES)[number])
    ? report.status
    : "open";

  return (
    <Select value={value} onValueChange={onStatusChange} disabled={disabled}>
      <SelectTrigger className={`${compact ? "h-7 w-28 text-[11px]" : "h-8 w-full text-xs"} bg-white`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="open">Open</SelectItem>
        <SelectItem value="in_progress">In progress</SelectItem>
        <SelectItem value="closed">Closed</SelectItem>
      </SelectContent>
    </Select>
  );
}

function IconTool({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Button variant="outline" size="icon" className="h-8 w-8 bg-white text-muted-foreground hover:text-primary" title={label} aria-label={label}>
      {children}
    </Button>
  );
}

function MailState({ report }: { report: Report }) {
  const isFresh = report.created_at ? Date.now() - new Date(report.created_at).getTime() < 24 * 60 * 60 * 1000 : false;
  return isFresh
    ? <Mail className="mx-auto w-4 h-4 text-accent" />
    : <MailOpen className="mx-auto w-4 h-4 text-muted-foreground/60" />;
}

function StatusMarker({ report }: { report: Report }) {
  const label = report.status.replace("_", " ");
  const showAlert = report.overdue === true;
  const showFlag = ["high", "medium"].includes(report.severity) && !["resolved", "closed"].includes(report.status);

  return (
    <span className="inline-flex items-center gap-1.5 capitalize">
      {showAlert && (
        <span title="Overdue">
          <AlertTriangle className="w-4 h-4 text-destructive" />
        </span>
      )}
      {showFlag && <Flag className="w-4 h-4 fill-accent text-accent" />}
      <span className="font-medium">{label}</span>
    </span>
  );
}

function reportSubject(report: Report) {
  return report.description?.trim() || report.category.replace("_", " ");
}

function reportRequester(report: Report) {
  if (report.is_anonymous) return "Anonymous";
  return report.reporter_name?.trim() || report.reporter_email?.trim() || "Unspecified";
}

function assigneeName(report: Report, profiles: Profile[]) {
  if (!report.assigned_to) return "Unassigned";
  const assignee = profiles.find(p => p.id === report.assigned_to);
  return assignee?.full_name ?? report.assigned_to;
}

function compactReference(reference: string) {
  const trailingDigits = reference.match(/\d+$/)?.[0];
  return trailingDigits ?? reference;
}

function formatReportDate(iso: string | null) {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date).replace(",", "");
}
