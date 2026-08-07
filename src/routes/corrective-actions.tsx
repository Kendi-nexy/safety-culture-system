import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, ArrowUpRight, CalendarClock, CheckCircle2, ClipboardList,
  Clock, MapPin, Search, UserCheck, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { TopNav, SiteFooter, useAuth, can } from "@/lib/app-shell";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/corrective-actions")({
  component: CorrectiveActionsPage,
  head: () => ({
    meta: [
      { title: "Corrective actions · SafeGuard" },
      { name: "description", content: "Assign, track and close out corrective actions across Siginon sites." },
    ],
  }),
});

// NOTE ON SCHEMA: there is no separate `corrective_actions` table yet — that
// question (fold into `reports` vs. its own entity) is still pending with
// the partner. This page treats every non-closed report as a corrective
// action to work: status moves open -> assigned -> in_progress -> resolved
// -> closed (or reopened). If a dedicated table lands later, this is the
// page to rebuild around it.

const severityStyles: Record<string, string> = {
  high: "bg-destructive/10 text-destructive border-destructive/30",
  medium: "bg-primary/10 text-primary border-primary/30",
  low: "bg-accent/10 text-accent border-accent/30",
};

const STATUS_COLUMNS = [
  { key: "open", label: "Open" },
  { key: "assigned", label: "Assigned" },
  { key: "in_progress", label: "In progress" },
  { key: "resolved", label: "Resolved" },
] as const;
type StatusKey = (typeof STATUS_COLUMNS)[number]["key"] | "closed" | "reopened";

const STATUS_FLOW: Record<string, string | null> = {
  open: "assigned",
  assigned: "in_progress",
  in_progress: "resolved",
  resolved: "closed",
  reopened: "assigned",
  closed: null,
};
const NEXT_LABEL: Record<string, string> = {
  open: "Assign",
  assigned: "Start work",
  in_progress: "Mark resolved",
  resolved: "Close out",
  reopened: "Re-assign",
};

type Report = Tables<"reports">;
type Profile = Tables<"profiles">;

function useCorrectiveActionsData() {
  const [reports, setReports] = useState<Report[] | null>(null);
  const [assignees, setAssignees] = useState<Profile[] | null>(null);
  const [loading, setLoading] = useState(true);

  async function load(cancelledRef?: { cancelled: boolean }) {
    setLoading(true);
    const [reportsRes, profilesRes] = await Promise.all([
      supabase.from("reports").select("*").order("due_at", { ascending: true, nullsFirst: false }).limit(500),
      supabase.from("profiles").select("*").in("role", ["supervisor", "hse", "admin"]).order("full_name"),
    ]);
    if (cancelledRef?.cancelled) return;
    setReports(reportsRes.error ? [] : (reportsRes.data ?? []));
    setAssignees(profilesRes.error ? [] : (profilesRes.data ?? []));
    setLoading(false);
  }

  useEffect(() => {
    const ref = { cancelled: false };
    load(ref);
    return () => { ref.cancelled = true; };
  }, []);

  const reload = () => load();

  return { reports: reports ?? [], assignees: assignees ?? [], loading, reload };
}

function isOverdue(r: Report): boolean {
  if (!r.due_at) return false;
  if (["resolved", "closed"].includes(r.status)) return false;
  return new Date(r.due_at).getTime() < Date.now();
}

function dueLabel(r: Report): string {
  if (!r.due_at) return "No due date";
  const diffMs = new Date(r.due_at).getTime() - Date.now();
  const days = Math.round(diffMs / (24 * 60 * 60 * 1000));
  if (["resolved", "closed"].includes(r.status)) return "—";
  if (days < 0) return `Overdue by ${Math.abs(days)}d`;
  if (days === 0) return "Due today";
  return `Due in ${days}d`;
}

function initials(name: string | null | undefined): string {
  if (!name) return "?";
  return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

function CorrectiveActionsPage() {
  const { role, ready, isAuthed } = useAuth();
  const { reports, assignees, loading, reload } = useCorrectiveActionsData();
  const [search, setSearch] = useState("");
  const [showClosed, setShowClosed] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (ready && !isAuthed && typeof window !== "undefined") {
      window.location.href = "/auth";
    }
  }, [ready, isAuthed]);

  const canAssign = can(role, "assign");
  const canClose = can(role, "close");

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return reports.filter(r => {
      if (!showClosed && r.status === "closed") return false;
      if (!q) return true;
      return [r.reference_number, r.category, r.zone, r.assigned_to ?? ""].join(" ").toLowerCase().includes(q);
    });
  }, [reports, search, showClosed]);

  const kpis = useMemo(() => {
    const active = reports.filter(r => r.status !== "closed");
    return {
      unassigned: active.filter(r => r.status === "open" || r.status === "reopened").length,
      overdue: active.filter(isOverdue).length,
      dueThisWeek: active.filter(r => {
        if (!r.due_at || isOverdue(r)) return false;
        const days = (new Date(r.due_at).getTime() - Date.now()) / (24 * 60 * 60 * 1000);
        return days >= 0 && days <= 7;
      }).length,
      awaitingCloseout: reports.filter(r => r.status === "resolved").length,
    };
  }, [reports]);

  async function assignTo(report: Report, profileId: string) {
    setBusyId(report.id);
    const { error } = await supabase
      .from("reports")
      .update({ assigned_to: profileId, status: report.status === "open" || report.status === "reopened" ? "assigned" : report.status })
      .eq("id", report.id);
    setBusyId(null);
    if (error) {
      toast.error("Couldn't assign this action", { description: error.message });
      return;
    }
    toast.success(`${report.reference_number} assigned`);
    reload();
  }

  async function advanceStatus(report: Report) {
    const next = STATUS_FLOW[report.status];
    if (!next) return;
    setBusyId(report.id);
    const { error } = await supabase.from("reports").update({ status: next }).eq("id", report.id);
    setBusyId(null);
    if (error) {
      toast.error("Couldn't update status", { description: error.message });
      return;
    }
    toast.success(`${report.reference_number} → ${next.replace("_", " ")}`);
    reload();
  }

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
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Follow-through</div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">Corrective Actions</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Assign owners, track due dates and drive every open report to close-out.
            </p>
          </div>
          <Link to="/dashboard">
            <Button variant="outline" size="sm">
              Back to dashboard <ArrowUpRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
        </div>

        {!canAssign && (
          <div className="glass-card rounded-2xl p-4 flex items-center gap-3 border border-primary/20 text-sm">
            <UserCheck className="w-4 h-4 text-primary shrink-0" />
            <span className="text-muted-foreground">
              Read-only view for your role. Assigning and closing actions is limited to Supervisors, HSE Officers and Admins
              — and, until real Supabase Auth sessions are wired up, further limited by RLS to whoever a report is already
              assigned to, plus HSE/Admin. See README.
            </span>
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Unassigned", value: kpis.unassigned, icon: ClipboardList, tint: "primary" },
            { label: "Overdue", value: kpis.overdue, icon: AlertTriangle, tint: "destructive" },
            { label: "Due this week", value: kpis.dueThisWeek, icon: CalendarClock, tint: "primary" },
            { label: "Awaiting close-out", value: kpis.awaitingCloseout, icon: CheckCircle2, tint: "accent" },
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

        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative flex-1 min-w-0 sm:max-w-xs">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search ref, zone, assignee…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9 w-full" />
          </div>
          <Button
            variant={showClosed ? "default" : "outline"}
            size="sm"
            onClick={() => setShowClosed(s => !s)}
            className={showClosed ? "bg-primary text-primary-foreground" : ""}
          >
            {showClosed ? <CheckCircle2 className="w-4 h-4 mr-1.5" /> : null}
            {showClosed ? "Showing closed" : "Show closed"}
          </Button>
        </div>

        {loading && <div className="text-sm text-muted-foreground">Loading corrective actions…</div>}

        {/* Kanban-style board by status */}
        <div className={`grid grid-cols-1 md:grid-cols-2 ${showClosed ? "xl:grid-cols-5" : "xl:grid-cols-4"} gap-4`}>
          {[...STATUS_COLUMNS, ...(showClosed ? [{ key: "closed" as const, label: "Closed" }] : [])].map(col => {
            const items = filtered.filter(r => r.status === col.key || (col.key === "open" && r.status === "reopened"));
            return (
              <div key={col.key} className="glass-card rounded-2xl overflow-hidden flex flex-col">
                <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                  <span className="text-sm font-semibold">{col.label}</span>
                  <Badge variant="outline">{items.length}</Badge>
                </div>
                <div className="p-3 space-y-3 flex-1 min-h-[120px]">
                  {items.length === 0 && (
                    <p className="text-xs text-muted-foreground px-1 py-4 text-center">Nothing here.</p>
                  )}
                  {items.map(r => {
                    const overdue = isOverdue(r);
                    const assignee = assignees.find(a => a.id === r.assigned_to);
                    const nextLabel = NEXT_LABEL[r.status];
                    return (
                      <div
                        key={r.id}
                        className={`rounded-xl border p-3 space-y-2 bg-card/60 ${overdue ? "border-destructive/40" : "border-border"}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <Link to="/reports/$reportId" params={{ reportId: r.id }} className="font-mono text-[11px] text-primary hover:underline">
                            {r.reference_number}
                          </Link>
                          <Badge variant="outline" className={severityStyles[r.severity]}>{r.severity}</Badge>
                        </div>
                        <div className="text-sm font-medium capitalize leading-snug">{r.category.replace("_", " ")}</div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="w-3 h-3" /> {r.zone}
                        </div>
                        <div className={`flex items-center gap-1 text-xs ${overdue ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                          {overdue ? <AlertTriangle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                          {dueLabel(r)}
                        </div>

                        <div className="pt-2 border-t border-border space-y-2">
                          {canAssign ? (
                            <Select
                              value={r.assigned_to ?? "__unassigned"}
                              onValueChange={v => v !== "__unassigned" && assignTo(r, v)}
                              disabled={busyId === r.id}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Unassigned" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__unassigned" disabled>Unassigned</SelectItem>
                                {assignees.map(a => (
                                  <SelectItem key={a.id} value={a.id}>{a.full_name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-bold text-[10px]">
                                {initials(assignee?.full_name)}
                              </div>
                              {assignee?.full_name ?? "Unassigned"}
                            </div>
                          )}

                          {nextLabel && canClose && r.status !== "closed" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full h-8 text-xs"
                              disabled={busyId === r.id}
                              onClick={() => advanceStatus(r)}
                            >
                              {busyId === r.id ? "Updating…" : nextLabel}
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}