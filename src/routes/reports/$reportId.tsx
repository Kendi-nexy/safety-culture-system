import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowLeft, Building2, CalendarClock, CheckCircle2, Image as ImageIcon, Mail,
  Maximize2, MessageSquare, Send, UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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

export const Route = createFileRoute("/reports/$reportId")({
  component: ReportDetailPage,
  head: () => ({
    meta: [
      { title: "Report detail · SafeGuard" },
      { name: "description", content: "Full detail view for a single safety report." },
    ],
  }),
});

type Report = Tables<"reports">;
type Profile = Tables<"profiles">;
type CommentRow = Tables<"comments">;
type AttachmentRow = Tables<"attachments">;

const statusStyles: Record<string, string> = {
  open: "bg-destructive/10 text-destructive border-destructive/30",
  in_progress: "bg-primary/10 text-primary border-primary/30",
  resolved: "bg-accent/10 text-accent border-accent/30",
  closed: "bg-accent/10 text-accent border-accent/30",
  reopened: "bg-destructive/10 text-destructive border-destructive/30",
};
const severityStyles: Record<string, string> = {
  high: "bg-destructive/10 text-destructive border-destructive/30",
  medium: "bg-primary/10 text-primary border-primary/30",
  low: "bg-accent/10 text-accent border-accent/30",
};
const WORKFLOW_STATUSES = ["open", "in_progress", "closed"] as const;

function ReportDetailPage() {
  const { reportId } = Route.useParams();
  const { role, profile, ready, isAuthed } = useAuth();

  const [report, setReport] = useState<Report | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [resolution, setResolution] = useState("");
  const [closureComments, setClosureComments] = useState("");
  const [showCloseForm, setShowCloseForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [comments, setComments] = useState<CommentRow[]>([]);
  const [newComment, setNewComment] = useState("");
  const [postingComment, setPostingComment] = useState(false);

  const [attachments, setAttachments] = useState<AttachmentRow[]>([]);
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    if (ready && !isAuthed && typeof window !== "undefined") {
      window.location.href = "/auth";
    }
  }, [ready, isAuthed]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [reportRes, profilesRes, commentsRes, attachmentsRes] = await Promise.all([
        supabase.from("reports").select("*").eq("id", reportId).maybeSingle(),
        supabase.from("profiles").select("*").order("full_name"),
        supabase.from("comments").select("*").eq("report_id", reportId).order("created_at", { ascending: true }),
        supabase.from("attachments").select("*").eq("report_id", reportId).order("created_at", { ascending: true }),
      ]);
      if (cancelled) return;
      if (reportRes.error || !reportRes.data) {
        setNotFound(true);
      } else {
        setReport(reportRes.data);
        setResolution(reportRes.data.resolution ?? "");
        setClosureComments(reportRes.data.closure_comments ?? "");
      }
      setProfiles(profilesRes.error ? [] : (profilesRes.data ?? []));
      setComments(commentsRes.error ? [] : (commentsRes.data ?? []));

      const attachmentRows = attachmentsRes.error ? [] : (attachmentsRes.data ?? []);
      if (attachmentsRes.error) {
        console.error("Failed to load attachments:", attachmentsRes.error);
      }
      setAttachments(attachmentRows);

      // Signed URLs (not public ones) so this works whether or not the
      // report-attachments bucket is private — each URL is short-lived and
      // only issued to someone whose session already has SELECT access to
      // that storage object via RLS.
      if (attachmentRows.length > 0) {
        const entries = await Promise.all(
          attachmentRows.map(async a => {
            const { data: signed } = await supabase.storage
              .from("report-attachments")
              .createSignedUrl(a.storage_path, 3600);
            return [a.id, signed?.signedUrl ?? null] as const;
          })
        );
        if (!cancelled) {
          setAttachmentUrls(Object.fromEntries(entries.filter((e): e is [string, string] => e[1] !== null)));
        }
      } else {
        setAttachmentUrls({});
      }

      setLoading(false);
    }
    if (isAuthed) load();
    return () => { cancelled = true; };
  }, [reportId, isAuthed]);

  async function updateStatus(nextStatus: string) {
    if (!report) return;
    if (!WORKFLOW_STATUSES.includes(nextStatus as (typeof WORKFLOW_STATUSES)[number])) return;
    if (nextStatus === report.status) return;

    if (nextStatus === "closed") {
      setShowCloseForm(true);
      return;
    }

    setSaving(true);
    const { data, error } = await supabase.rpc("update_report_workflow", {
      p_report_id: report.id,
      p_status: nextStatus,
      p_resolution: undefined,
      p_closure_comments: undefined,
    });
    setSaving(false);

    if (error || !data) {
      toast.error("Status update failed", { description: error?.message ?? "Please try again." });
      return;
    }
    setReport(data);
    toast.success(`Report marked as ${nextStatus === "in_progress" ? "in progress" : nextStatus}`);
  }

  async function closeReport() {
    if (!report) return;
    if (!resolution.trim() || !closureComments.trim()) {
      toast.error("Resolution and closure comments are required to close a report.");
      return;
    }

    setSaving(true);
    const { data, error } = await supabase.rpc("update_report_workflow", {
      p_report_id: report.id,
      p_status: "closed",
      p_resolution: resolution.trim(),
      p_closure_comments: closureComments.trim(),
    });
    setSaving(false);

    if (error || !data) {
      toast.error("Could not close report", { description: error?.message ?? "Please try again." });
      return;
    }
    setReport(data);
    setShowCloseForm(false);
    toast.success("Report closed with resolution");
  }

  async function addComment() {
    if (!report || !profile) return;
    if (!newComment.trim()) return;

    setPostingComment(true);
    const { data, error } = await supabase
      .from("comments")
      .insert({ report_id: report.id, author_id: profile.id, body: newComment.trim() })
      .select()
      .single();
    setPostingComment(false);

    if (error || !data) {
      toast.error("Could not add comment", { description: error?.message ?? "Please try again." });
      return;
    }
    setComments(current => [...current, data]);
    setNewComment("");
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
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <Link to="/dashboard">
          <Button variant="outline" size="sm">
            <ArrowLeft className="w-4 h-4 mr-1" /> Back to dashboard
          </Button>
        </Link>

        {loading && (
          <div className="glass-card rounded-2xl p-8 text-sm text-muted-foreground">Loading report…</div>
        )}

        {!loading && notFound && (
          <div className="glass-card rounded-2xl p-8">
            <p className="text-sm text-muted-foreground">
              This report doesn't exist, or you don't have access to view it.
            </p>
          </div>
        )}

        {!loading && report && (
          <div className="glass-card rounded-2xl p-6 sm:p-8 space-y-6">
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <span className="font-mono text-primary text-xs font-semibold">{report.reference_number}</span>
                <Badge variant="outline" className={severityStyles[report.severity]}>{report.severity}</Badge>
                <Badge variant="outline" className={statusStyles[report.status]}>{report.status.replace("_", " ")}</Badge>
                {report.overdue && (
                  <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">Overdue</Badge>
                )}
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{reportSubject(report)}</h1>
              <p className="text-sm text-muted-foreground mt-1 capitalize">
                {report.category.replace("_", " ")} · logged {formatReportDate(report.created_at)}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <DetailField icon={UserRound} label="Requester" value={reportRequester(report)} />
              <DetailField
                icon={Mail}
                label="Email"
                value={report.is_anonymous ? "Withheld (anonymous)" : (report.reporter_email?.trim() || "Not provided")}
              />
              <DetailField icon={Building2} label="Site / zone" value={report.zone || "-"} />
              <DetailField icon={UserRound} label="Assigned to" value={assigneeName(report, profiles)} />
              <DetailField icon={CalendarClock} label="Due by" value={formatReportDate(report.due_at)} />
              <DetailField icon={CalendarClock} label="Created" value={formatReportDate(report.created_at)} />
            </div>

            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Description</div>
              <p className="rounded-lg border border-border bg-muted/40 p-4 whitespace-pre-wrap text-sm">
                {report.description?.trim() || "No description provided."}
              </p>
            </div>

            {attachments.length > 0 && (
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
                  <ImageIcon className="w-3 h-3" /> Photos ({attachments.length})
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {attachments.map(a => {
                    const url = attachmentUrls[a.id];
                    return (
                      <a
                        key={a.id}
                        href={url ?? undefined}
                        target="_blank"
                        rel="noreferrer"
                        className={`relative aspect-square rounded-lg overflow-hidden border border-border bg-muted/40 group ${url ? "" : "pointer-events-none opacity-60"}`}
                        title={a.file_name ?? undefined}
                      >
                        {url ? (
                          <>
                            <img src={url} alt={a.file_name ?? "Attachment"} className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                              <Maximize2 className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                          </>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                            Unavailable
                          </div>
                        )}
                      </a>
                    );
                  })}
                </div>
              </div>
            )}

            {report.status === "closed" && (report.resolution || report.closure_comments) && (
              <div className="space-y-2">
                {report.resolution && (
                  <div>
                    <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Resolution</div>
                    <p className="rounded-lg border border-accent/30 bg-accent/10 p-4 whitespace-pre-wrap text-sm">{report.resolution}</p>
                  </div>
                )}
                {report.closure_comments && (
                  <div>
                    <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Closure comments</div>
                    <p className="rounded-lg border border-accent/30 bg-accent/10 p-4 whitespace-pre-wrap text-sm">{report.closure_comments}</p>
                  </div>
                )}
                {report.closed_at && (
                  <div className="text-xs text-muted-foreground">Closed {formatReportDate(report.closed_at)}</div>
                )}
              </div>
            )}

            <div className="border-t border-border pt-5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Update status</Label>
              <div className="mt-2 max-w-xs">
                <Select
                  value={WORKFLOW_STATUSES.includes(report.status as (typeof WORKFLOW_STATUSES)[number]) ? report.status : "open"}
                  onValueChange={updateStatus}
                  disabled={saving}
                >
                  <SelectTrigger className="h-9 bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="in_progress">In progress</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {showCloseForm && (
                <div className="mt-4 rounded-xl border border-border bg-card p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold">Close this report</div>
                    <Button variant="ghost" size="sm" onClick={() => setShowCloseForm(false)}>Cancel</Button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
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
                    <Button onClick={closeReport} disabled={saving}>
                      <CheckCircle2 className="w-4 h-4 mr-1" />
                      {saving ? "Saving..." : "Save closure"}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-border pt-5">
              <div className="flex items-center gap-2 mb-3">
                <MessageSquare className="w-4 h-4 text-primary" />
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Corrective actions & comments</Label>
              </div>

              <div className="space-y-3 mb-4">
                {comments.length === 0 && (
                  <p className="text-sm text-muted-foreground">No follow-up comments yet.</p>
                )}
                {comments.map(c => (
                  <div key={c.id} className="rounded-lg border border-border bg-muted/30 p-3">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-xs font-semibold">{commentAuthorName(c, profiles)}</span>
                      <span className="text-xs text-muted-foreground">{formatReportDate(c.created_at)}</span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{c.body}</p>
                  </div>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <Textarea
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  placeholder="Log a follow-up action or comment — e.g. 'Spoke to operator, retraining scheduled Friday'"
                  className="min-h-16 flex-1"
                />
                <Button onClick={addComment} disabled={postingComment || !newComment.trim()} className="sm:self-end">
                  <Send className="w-4 h-4 mr-1" />
                  {postingComment ? "Posting..." : "Post"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}

function DetailField({ icon: Icon, label, value }: { icon: typeof UserRound; label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-0.5 flex items-center gap-1">
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div className="font-medium truncate" title={value}>{value}</div>
    </div>
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

function commentAuthorName(comment: CommentRow, profiles: Profile[]) {
  if (!comment.author_id) return "Unknown";
  const author = profiles.find(p => p.id === comment.author_id);
  return author?.full_name ?? "Unknown";
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
