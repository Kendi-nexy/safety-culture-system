import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, ArrowLeft, Calendar, Clock, ImageOff, Loader2, MapPin,
  MessageSquare, Send, ShieldAlert, User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { TopNav, SiteFooter, useAuth, can, type Role } from "@/lib/app-shell";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/reports/$reportId")({
  component: ReportDetailPage,
  head: () => ({
    meta: [{ title: "Report detail · SafeGuard" }],
  }),
});

const DB_ROLE_TO_LABEL: Record<string, Role> = {
  employee: "Employee",
  supervisor: "Supervisor",
  hse: "HSE Officer",
  admin: "Admin",
};

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
const STATUS_ORDER = ["open", "assigned", "in_progress", "resolved", "closed"] as const;

type Report = Tables<"reports">;
type Attachment = Tables<"attachments">;
type Comment = Tables<"comments">;
type StatusLogRow = Tables<"status_log">;
type Profile = Tables<"profiles">;

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  });
}
function initials(name: string | null | undefined): string {
  if (!name) return "?";
  return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

function useReportDetail(reportId: string) {
  const [report, setReport] = useState<Report | null | undefined>(undefined); // undefined = loading, null = not found
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string>>({});
  const [comments, setComments] = useState<Comment[]>([]);
  const [statusLog, setStatusLog] = useState<StatusLogRow[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const [reportRes, attRes, commentsRes, logRes, profilesRes] = await Promise.all([
      supabase.from("reports").select("*").eq("id", reportId).maybeSingle(),
      supabase.from("attachments").select("*").eq("report_id", reportId).order("created_at"),
      supabase.from("comments").select("*").eq("report_id", reportId).order("created_at"),
      supabase.from("status_log").select("*").eq("report_id", reportId).order("changed_at"),
      supabase.from("profiles").select("*"),
    ]);
    setReport(reportRes.error ? null : reportRes.data);
    setAttachments(attRes.error ? [] : (attRes.data ?? []));
    setComments(commentsRes.error ? [] : (commentsRes.data ?? []));
    setStatusLog(logRes.error ? [] : (logRes.data ?? []));
    setProfiles(profilesRes.error ? [] : (profilesRes.data ?? []));

    // Bucket is private, so each photo needs a signed URL rather than a
    // public one.
    if (!attRes.error && attRes.data?.length) {
      const entries = await Promise.all(
        attRes.data.map(async a => {
          const { data } = await supabase.storage.from("report-attachments").createSignedUrl(a.storage_path, 3600);
          return [a.id, data?.signedUrl ?? ""] as const;
        })
      );
      setAttachmentUrls(Object.fromEntries(entries));
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, [reportId]);

  return { report, attachments, attachmentUrls, comments, statusLog, profiles, loading, reload: load };
}

function ReportDetailPage() {
  const { reportId } = Route.useParams();
  const { role, ready, isAuthed } = useAuth();
  const { report, attachments, attachmentUrls, comments, statusLog, profiles, loading, reload } = useReportDetail(reportId);
  const [newComment, setNewComment] = useState("");
  const [posting, setPosting] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (ready && !isAuthed && typeof window !== "undefined") window.location.href = "/auth";
  }, [ready, isAuthed]);

  const canComment = can(role, "comment");
  const canManage = can(role, "assign");

  const profileById = useMemo(() => new Map(profiles.map(p => [p.id, p])), [profiles]);
  const assignees = useMemo(
    () => profiles.filter(p => ["supervisor", "hse", "admin"].includes(p.role)).sort((a, b) => a.full_name.localeCompare(b.full_name)),
    [profiles]
  );

  async function postComment() {
    if (!newComment.trim() || !report) return;
    setPosting(true);
    const { data: session } = await supabase.auth.getUser();
    const { error } = await supabase.from("comments").insert({
      report_id: report.id,
      author_id: session.user?.id,
      body: newComment.trim(),
    });
    setPosting(false);
    if (error) {
      toast.error("Couldn't post comment", { description: error.message });
      return;
    }
    setNewComment("");
    reload();
  }

  async function updateStatus(nextStatus: string) {
    if (!report) return;
    setBusy(true);
    const { error } = await supabase.from("reports").update({ status: nextStatus }).eq("id", report.id);
    setBusy(false);
    if (error) {
      toast.error("Couldn't update status", { description: error.message });
      return;
    }
    toast.success(`Status changed to ${nextStatus.replace("_", " ")}`);
    reload();
  }

  async function reassign(profileId: string) {
    if (!report) return;
    setBusy(true);
    const nextStatus = report.status === "open" || report.status === "reopened" ? "assigned" : report.status;
    const { error } = await supabase.from("reports").update({ assigned_to: profileId, status: nextStatus }).eq("id", report.id);
    setBusy(false);
    if (error) {
      toast.error("Couldn't reassign", { description: error.message });
      return;
    }
    toast.success("Report reassigned");
    reload();
  }

  if (!ready || (ready && !role)) {
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
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to dashboard
        </Link>

        {loading && report === undefined && (
          <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading report…</div>
        )}

        {!loading && report === null && (
          <div className="glass-card rounded-2xl p-8 text-center space-y-2">
            <ShieldAlert className="w-8 h-8 text-muted-foreground mx-auto" />
            <h2 className="text-lg font-semibold">Report not found</h2>
            <p className="text-sm text-muted-foreground">
              Either this report doesn't exist, or you don't have permission to view it.
            </p>
          </div>
        )}

        {report && (
          <>
            {/* Header */}
            <div className="glass-card rounded-2xl p-6">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div>
                  <div className="text-xs uppercase tracking-widest text-muted-foreground">Report</div>
                  <div className="flex items-center gap-2 flex-wrap mt-1">
                    <span className="font-mono text-primary text-sm">{report.reference_number}</span>
                    <Badge variant="outline" className={severityStyles[report.severity]}>{report.severity}</Badge>
                    <Badge variant="outline" className={statusStyles[report.status]}>{report.status.replace("_", " ")}</Badge>
                    {report.is_anonymous && <Badge variant="outline">Anonymous</Badge>}
                  </div>
                  <h1 className="text-2xl font-bold tracking-tight mt-2 capitalize">{report.category.replace("_", " ")}</h1>
                  <p className="text-muted-foreground text-sm mt-1">Full details, photos, comments and status history for this report.</p>
                </div>
              </div>

              <p className="mt-4 text-sm leading-relaxed whitespace-pre-wrap">{report.description}</p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5 pt-5 border-t border-border text-sm">
                <div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" /> Zone</div>
                  <div className="font-medium mt-0.5">{report.zone}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1"><User className="w-3 h-3" /> Reported by</div>
                  <div className="font-medium mt-0.5">
                    {report.is_anonymous ? "Anonymous" : (report.reporter_name ?? profileById.get(report.reporter_id ?? "")?.full_name ?? "—")}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3" /> Logged</div>
                  <div className="font-medium mt-0.5">{fmtDateTime(report.created_at)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> Due</div>
                  <div className="font-medium mt-0.5">{fmtDateTime(report.due_at)}</div>
                </div>
              </div>

              {canManage && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5 pt-5 border-t border-border">
                  <div>
                    <div className="text-xs text-muted-foreground mb-1.5">Status</div>
                    <Select value={report.status} onValueChange={updateStatus} disabled={busy}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[...STATUS_ORDER, "reopened"].map(s => (
                          <SelectItem key={s} value={s} className="capitalize">{s.replace("_", " ")}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1.5">Assigned to</div>
                    <Select value={report.assigned_to ?? "__unassigned"} onValueChange={reassign} disabled={busy}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__unassigned" disabled>Unassigned</SelectItem>
                        {assignees.map(a => <SelectItem key={a.id} value={a.id}>{a.full_name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>

            {/* Photos */}
            <div className="glass-card rounded-2xl p-6">
              <h3 className="text-lg font-semibold mb-4">Photos</h3>
              {attachments.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <ImageOff className="w-4 h-4" /> No photos attached to this report.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {attachments.map(a => (
                    <a
                      key={a.id}
                      href={attachmentUrls[a.id] || undefined}
                      target="_blank"
                      rel="noreferrer"
                      className="block rounded-xl overflow-hidden border border-border aspect-square bg-muted/40 relative group"
                    >
                      {attachmentUrls[a.id] ? (
                        <img src={attachmentUrls[a.id]} alt={a.file_name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">Loading…</div>
                      )}
                      <Badge variant="outline" className="absolute bottom-1.5 left-1.5 text-[10px] bg-background/90 capitalize">{a.tag}</Badge>
                    </a>
                  ))}
                </div>
              )}
            </div>

            {/* Status history */}
            <div className="glass-card rounded-2xl p-6">
              <h3 className="text-lg font-semibold mb-4">Status history</h3>
              {statusLog.length === 0 ? (
                <p className="text-sm text-muted-foreground">No status changes recorded yet.</p>
              ) : (
                <div className="space-y-4">
                  {statusLog.map((s, i) => {
                    const changer = s.changed_by ? profileById.get(s.changed_by) : null;
                    return (
                      <div key={s.id} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div className="w-2.5 h-2.5 rounded-full bg-primary mt-1.5" />
                          {i < statusLog.length - 1 && <div className="w-px flex-1 bg-border mt-1" />}
                        </div>
                        <div className="pb-4 text-sm">
                          <div>
                            <span className="capitalize text-muted-foreground">{s.old_status?.replace("_", " ") ?? "created"}</span>
                            {" → "}
                            <span className="font-medium capitalize">{s.new_status.replace("_", " ")}</span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {changer?.full_name ?? "System"} · {fmtDateTime(s.changed_at)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Comments */}
            <div className="glass-card rounded-2xl p-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2"><MessageSquare className="w-4 h-4 text-primary" /> Comments</h3>

              {comments.length === 0 && <p className="text-sm text-muted-foreground mb-4">No comments yet.</p>}

              <div className="space-y-4 mb-4">
                {comments.map(c => {
                  const author = c.author_id ? profileById.get(c.author_id) : null;
                  return (
                    <div key={c.id} className="flex gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-bold text-[11px] shrink-0">
                        {initials(author?.full_name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">{author?.full_name ?? "Unknown"}</span>
                          {author && <Badge variant="outline" className="text-[10px]">{DB_ROLE_TO_LABEL[author.role] ?? author.role}</Badge>}
                          <span className="text-xs text-muted-foreground">{fmtDateTime(c.created_at)}</span>
                        </div>
                        <p className="text-sm mt-1 whitespace-pre-wrap">{c.body}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {canComment ? (
                <div className="flex gap-2 pt-3 border-t border-border">
                  <Textarea
                    value={newComment}
                    onChange={e => setNewComment(e.target.value)}
                    placeholder="Add a comment for the team working this report…"
                    className="min-h-[44px] text-sm"
                  />
                  <Button onClick={postComment} disabled={posting || !newComment.trim()} className="shrink-0 self-end">
                    {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs text-muted-foreground pt-3 border-t border-border">
                  <AlertTriangle className="w-3.5 h-3.5" /> Commenting is limited to Supervisors, HSE Officers and Admins.
                </div>
              )}
            </div>
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}