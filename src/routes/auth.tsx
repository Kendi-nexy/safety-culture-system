import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { ShieldCheck, User, ArrowRight, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TopNav, SiteFooter, useAuth } from "@/lib/app-shell";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  head: () => ({
    meta: [
      { title: "Staff sign in · SafeGuard" },
      { name: "description", content: "Sign in to the SafeGuard staff dashboard — supervisors, HSE officers and admins." },
    ],
  }),
});

function AuthPage() {
  const { signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = (await signIn(email, password)) as { error?: unknown };
    setSubmitting(false);
    if (result.error) {
      const errorMessage =
        typeof result.error === "object" &&
        result.error !== null &&
        "message" in result.error &&
        typeof (result.error as any).message === "string"
          ? (result.error as any).message
          : String(result.error);

      setError(
        errorMessage === "Invalid login credentials"
          ? "Email or password is incorrect."
          : errorMessage
      );
      return;
    }
    router.navigate({ to: "/dashboard" });
  }

  return (
    <div className="min-h-screen">
      <TopNav />
      <main className="max-w-[560px] mx-auto px-4 sm:px-6 py-14 lg:py-20">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-4">
            <ShieldCheck className="w-3.5 h-3.5" /> Staff access
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Sign in to your dashboard</h1>
          <p className="text-muted-foreground mt-2">
            Employees don't need an account —{" "}
            <Link to="/" className="text-primary hover:underline">just submit a report</Link>.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="glass-card rounded-2xl p-6 sm:p-8 space-y-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <User className="w-4 h-4" /> Staff sign-in — Supervisor, HSE Officer or Admin
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 text-destructive px-3 py-2.5 text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <Label>Email</Label>
            <Input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@siginon.com"
              className="mt-1.5"
              required
              autoComplete="email"
            />
          </div>
          <div>
            <Label>Password</Label>
            <Input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="mt-1.5"
              required
              autoComplete="current-password"
            />
          </div>
          <Button
            type="submit"
            size="lg"
            disabled={submitting}
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90 hi-vis-glow font-semibold disabled:opacity-60"
          >
            {submitting ? "Signing in…" : "Sign in"} <ArrowRight className="w-4 h-4 ml-1.5" />
          </Button>
        </form>
      </main>
      <SiteFooter />
    </div>
  );
}
