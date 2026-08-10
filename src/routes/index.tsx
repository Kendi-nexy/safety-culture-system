import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight, CheckCircle2, ClipboardList, Eye, HardHat, ImagePlus, Lightbulb,
  MapPin, Plus, Send, ShieldCheck, Sparkles, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { TopNav, SiteFooter } from "@/lib/app-shell";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/")({
  component: LandingPage,
  head: () => ({
    meta: [
      { title: "Report a safety issue · SafeGuard" },
      { name: "description", content: "Report hazards, near misses and good catches at Siginon — in under 60 seconds, from any device." },
    ],
  }),
});

// UI label -> DB category value (public.reports.category check constraint).
// "Unsafe Condition" and "Quality" needed the check constraint widened —
// see supabase/migrations/20260723000000_categories_and_storage.sql
const TYPE_TO_CATEGORY: Record<string, string> = {
  "Observation": "observation",
  "Near Miss": "near_miss",
  "Hazard": "hazard",
  "Incident": "incident",
  "Unsafe Act": "unsafe_act",
  "Unsafe Condition": "unsafe_condition",
  "Good Catch": "good_catch",
  "Environmental": "environmental",
  "Quality": "quality",
};
const types = Object.keys(TYPE_TO_CATEGORY);

const severityStyles: Record<string, string> = {
  Low: "bg-accent/10 text-accent border-accent/30 hover:bg-accent/20",
  Medium: "bg-primary/10 text-primary border-primary/30 hover:bg-primary/20",
  High: "bg-destructive/10 text-destructive border-destructive/30 hover:bg-destructive/20",
};

const statusStyles: Record<string, string> = {
  open: "bg-destructive/10 text-destructive border-destructive/30",
  assigned: "bg-primary/10 text-primary border-primary/30",
  in_progress: "bg-primary/10 text-primary border-primary/30",
  resolved: "bg-accent/10 text-accent border-accent/30",
  closed: "bg-accent/10 text-accent border-accent/30",
  reopened: "bg-destructive/10 text-destructive border-destructive/30",
};
const statusLabel: Record<string, string> = {
  open: "Open", assigned: "Assigned", in_progress: "In Progress",
  resolved: "Resolved", closed: "Closed", reopened: "Reopened",
};

const MY_REPORTS_KEY = "safeguard.my_report_refs";

function LandingPage() {
  return (
    <div className="min-h-screen">
      <Toaster position="top-right" />
      <TopNav />

      {/* Full-bleed dark hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#160f36] via-[#1c1046] to-[#2a1230]">
        <div className="absolute -left-24 top-1/3 w-96 h-96 rounded-full bg-accent/25 blur-[100px]" />
        <div className="absolute right-0 -top-24 w-[32rem] h-[32rem] rounded-full bg-primary/25 blur-[120px]" />
        <div className="absolute right-1/4 bottom-0 w-72 h-72 rounded-full bg-primary/15 blur-[100px]" />

        {/* Photo fades into the gradient on its left/top/bottom edges (baked
            into the PNG itself) rather than sitting as a hard rectangle. */}
        <img
          src="/hero-worker.png"
          alt=""
          aria-hidden="true"
          className="hidden lg:block absolute right-0 top-0 h-full w-[46%] object-cover object-[30%_20%] opacity-90 pointer-events-none select-none"
        />

        <div className="relative max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 lg:py-24">
          <div className="max-w-2xl">
            <div className="text-accent text-xs font-bold tracking-[0.2em] uppercase mb-4">
              See it. Report it. Fix it.
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05] text-white">
              Every catch counts. <span className="text-accent">Every voice matters.</span>
            </h1>
            <p className="text-slate-300 mt-5 text-base sm:text-lg max-w-xl">
              Log a hazard, near-miss, good catch or incident from the docks, warehouse bays, yard or cold room in under a minute — with your name, or completely anonymously.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row flex-wrap gap-3">
              <a href="#report" className="w-full sm:w-auto">
                <Button size="lg" className="w-full sm:w-auto bg-accent text-accent-foreground hover:bg-accent/90 font-semibold shadow-lg shadow-accent/30">
                  <Plus className="w-4 h-4 mr-1.5" /> New report
                </Button>
              </a>
              <Link to="/auth" className="w-full sm:w-auto">
                <Button size="lg" variant="outline" className="w-full sm:w-auto bg-white/5 border-white/25 text-white hover:bg-white/10 hover:text-white">
                  Staff dashboard <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
              </Link>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <HeroStat value="47" label="days without LTI" />
              <HeroStat value="112" label="good catches this month" accent />
              <HeroStat value="98%" label="PPE compliance" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 border border-white/15 rounded-full px-2.5 py-1">
                Sample data
              </span>
            </div>
          </div>
        </div>
      </section>

      <main className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12 space-y-10">
        {/* Report form + types */}
        <section id="report" className="grid lg:grid-cols-[1.3fr_1fr] gap-6">
          <div className="glass-card rounded-3xl p-6 sm:p-8">
            <ReportForm />
          </div>

          <div>
            <h2 className="text-2xl font-semibold mb-4">What can I report?</h2>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Near miss", desc: "Almost happened", tint: "primary" },
                { label: "Hazard", desc: "Unsafe condition", tint: "destructive" },
                { label: "Good catch", desc: "You prevented it", tint: "accent" },
                { label: "Incident", desc: "Something happened", tint: "destructive" },
                { label: "Environmental", desc: "Spill, waste, noise", tint: "accent" },
                { label: "Observation", desc: "Something worth noting", tint: "primary" },
              ].map(t => (
                <div key={t.label} className="glass-card rounded-2xl p-4 hover:shadow-md transition-shadow">
                  <div className={`w-9 h-9 rounded-lg bg-${t.tint}/10 text-${t.tint} border border-${t.tint}/20 flex items-center justify-center mb-3`}>
                    <ClipboardList className="w-4 h-4" />
                  </div>
                  <div className="font-semibold text-sm">{t.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{t.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* My recent reports + tips */}
        <section className="grid lg:grid-cols-[1.5fr_1fr] gap-6">
          <MyRecentReports />

          <div className="glass-card rounded-2xl p-6">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-3">
              <Lightbulb className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-lg">Safety tip of the day</h3>
            <p className="text-sm text-muted-foreground mt-2">
              Before operating any MHE, do a 60-second walk-around: brakes, forks, horn, mast, tyres. If anything looks off — <span className="text-foreground font-medium">report it, don't drive it.</span>
            </p>
            <div className="mt-5 pt-5 border-t border-border">
              <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Need help?</div>
              <p className="text-sm">Speak to your supervisor or contact HSE on <span className="font-semibold">ext. 4711</span>.</p>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />

      <footer className="border-t border-border mt-12 py-6 text-center text-xs text-muted-foreground">
        SafeGuard · Siginon HSE · Every report is reviewed within 24 hours
      </footer>
    </div>
  );
}

function HeroStat({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-full bg-white/8 border border-white/10 pl-3 pr-4 py-1.5">
      <span className={`font-bold text-sm ${accent ? "text-accent" : "text-white"}`}>{value}</span>
      <span className="text-xs text-slate-300">{label}</span>
    </div>
  );
}

// Reads locally-remembered reference numbers (see MY_REPORTS_KEY) and looks
// them up live. This is the practical stand-in for "your recent reports"
// while public reporters have no real account/session — see README.
function MyRecentReports() {
  const [reports, setReports] = useState<Tables<"reports">[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const refs: string[] = JSON.parse(localStorage.getItem(MY_REPORTS_KEY) ?? "[]");
      if (refs.length === 0) {
        if (!cancelled) setReports([]);
        return;
      }
      const { data, error } = await supabase
        .from("reports")
        .select("*")
        .in("reference_number", refs)
        .order("created_at", { ascending: false });
      if (!cancelled) setReports(error ? [] : (data ?? []));
    }
    load();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="glass-card rounded-2xl overflow-hidden">
      <div className="p-5 border-b border-border flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-lg">Your recent reports</h3>
          <p className="text-xs text-muted-foreground">Track the status of what you've submitted on this device</p>
        </div>
        <Badge variant="outline">{reports?.length ?? 0}</Badge>
      </div>
      <div className="divide-y divide-border">
        {reports === null && (
          <div className="p-4 text-sm text-muted-foreground">Loading…</div>
        )}
        {reports?.length === 0 && (
          <div className="p-4 text-sm text-muted-foreground">
            Nothing submitted from this device yet — reports you file will show up here.
          </div>
        )}
        {reports?.map(r => (
          <div key={r.id} className="p-4 flex items-center gap-4 hover:bg-muted/50 transition-colors">
            <div className="font-mono text-xs text-primary shrink-0">{r.reference_number}</div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm truncate capitalize">{r.category.replace("_", " ")}</div>
              <div className="text-xs text-muted-foreground inline-flex items-center gap-1">
                <MapPin className="w-3 h-3" /> {r.zone}
              </div>
            </div>
            <Badge variant="outline" className={statusStyles[r.status]}>{statusLabel[r.status]}</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReportForm() {
  const [type, setType] = useState("Near Miss");
  const [zone, setZone] = useState("");
  const [sites, setSites] = useState<Tables<"sites">[] | null>(null);
  const [description, setDescription] = useState("");
  const [name, setName] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [severity, setSeverity] = useState("Medium");
  const [photos, setPhotos] = useState<{ file: File; url: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    supabase.from("sites").select("*").order("name").then(({ data, error }) => {
      if (cancelled) return;
      const list = error ? [] : (data ?? []);
      setSites(list);
      if (list.length > 0) setZone(list[0].name);
    });
    return () => { cancelled = true; };
  }, []);

  function addFiles(files: FileList | null) {
    if (!files) return;
    const next = Array.from(files).slice(0, 6 - photos.length).map(f => ({
      file: f,
      url: URL.createObjectURL(f),
    }));
    setPhotos(p => [...p, ...next]);
  }
  function removePhoto(i: number) {
    setPhotos(p => {
      URL.revokeObjectURL(p[i].url);
      return p.filter((_, idx) => idx !== i);
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!zone.trim()) {
      toast.error("Please tell us the zone/site this happened at.");
      return;
    }
    setSubmitting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const reporterId = sessionData?.session?.user?.id ?? null;

      const { data: report, error } = await supabase
        .from("reports")
        .insert({
          category: TYPE_TO_CATEGORY[type],
          description,
          zone: zone.trim(),
          severity: severity.toLowerCase(),
          is_anonymous: anonymous,
          reporter_name: anonymous ? null : (name.trim() || null),
          reporter_id: reporterId,
        })
        .select()
        .single();

      if (error || !report) throw error ?? new Error("Insert failed");

      // Upload photos to Storage, then record each in `attachments`.
      for (const p of photos) {
        const path = `${report.id}/${Date.now()}-${p.file.name}`;
        const { error: uploadError } = await supabase.storage
          .from("report-attachments")
          .upload(path, p.file);
        if (uploadError) {
          console.error("Attachment upload failed:", uploadError);
          continue; // don't block the whole submission over one photo
        }
        await supabase.from("attachments").insert({
          report_id: report.id,
          storage_path: path,
          file_name: p.file.name,
          tag: "supporting",
        });
      }

      // Remember this reference locally so "Your recent reports" can find it.
      const existing: string[] = JSON.parse(localStorage.getItem(MY_REPORTS_KEY) ?? "[]");
      localStorage.setItem(MY_REPORTS_KEY, JSON.stringify([report.reference_number, ...existing].slice(0, 20)));

      toast.success("Report submitted", {
        description: `Reference ${report.reference_number} · ${photos.length} photo${photos.length === 1 ? "" : "s"} · reviewed within 24h`,
      });

      photos.forEach(p => URL.revokeObjectURL(p.url));
      setPhotos([]);
      setDescription("");
      setName("");
      setZone("");
      setSeverity("Medium");
      setAnonymous(false);
    } catch (err) {
      console.error(err);
      toast.error("Something went wrong submitting your report. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form id="report" onSubmit={handleSubmit} className="space-y-4">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <Send className="w-4 h-4" />
          </div>
          <h2 className="text-xl font-bold">Report a safety issue</h2>
        </div>
        <p className="text-sm text-muted-foreground">Under 60 seconds. No login needed.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Type</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
            <SelectContent>{types.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Zone / site</Label>
          <Select value={zone} onValueChange={setZone}>
            <SelectTrigger className="mt-1.5">
              <SelectValue placeholder={sites === null ? "Loading sites…" : "Select a site"} />
            </SelectTrigger>
            <SelectContent>
              {(sites ?? []).map(s => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Severity</Label>
        <div className="grid grid-cols-3 gap-2 mt-1.5">
          {["Low", "Medium", "High"].map(s => (
            <button
              type="button"
              key={s}
              onClick={() => setSeverity(s)}
              className={`px-3 py-2 rounded-lg text-sm font-medium border transition-all ${severityStyles[s]} ${severity === s ? "ring-2 ring-offset-2 ring-offset-background ring-current" : ""}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">What happened?</Label>
        <Textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Describe the observation, hazard or event…"
          className="mt-1.5 min-h-24"
          required
        />
      </div>

      <div>
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Photos (optional)</Label>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          capture="environment"
          className="hidden"
          onChange={e => { addFiles(e.target.files); e.target.value = ""; }}
        />
        <div className="mt-1.5 grid grid-cols-4 gap-2">
          {photos.map((p, i) => (
            <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-border group">
              <img src={p.url} alt={p.file.name} className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => removePhoto(i)}
                className="absolute top-1 right-1 w-6 h-6 rounded-full bg-background/90 border border-border flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Remove photo"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          {photos.length < 6 && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="aspect-square rounded-lg border border-dashed border-border flex flex-col items-center justify-center gap-1 text-xs text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors"
            >
              <ImagePlus className="w-4 h-4" />
              <span>Add</span>
            </button>
          )}
        </div>
      </div>

      {!anonymous && (
        <div>
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Your name</Label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="Full name" className="mt-1.5" />
        </div>
      )}

      <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border">
        <div>
          <div className="text-sm font-medium">Report anonymously</div>
          <div className="text-xs text-muted-foreground">Your name won't be attached</div>
        </div>
        <Switch checked={anonymous} onCheckedChange={setAnonymous} />
      </div>

      <Button
        type="submit"
        size="lg"
        disabled={submitting}
        className="w-full bg-primary text-primary-foreground hover:bg-primary/90 hi-vis-glow font-semibold disabled:opacity-60"
      >
        <Send className="w-4 h-4 mr-1.5" /> {submitting ? "Submitting…" : "Submit report"}
      </Button>
    </form>
  );
}
