// Shared email sender for Edge Functions. Reads EMAIL_PROVIDER to decide
// whether to send through Mailtrap (sandbox testing — emails never leave
// Mailtrap's fake inbox, safe to use while developing) or Resend
// (production — actually delivers). Same call shape either way, so
// switching from testing to production is a one-line env var change, not a
// code change.
//
// Set these as Supabase secrets (Project Settings -> Edge Functions ->
// Secrets, or `supabase secrets set NAME=value` if you have the CLI):
//
//   EMAIL_PROVIDER=mailtrap            (or "resend")
//   MAILTRAP_API_TOKEN=...             (from Mailtrap -> Sandbox -> API tokens)
//   MAILTRAP_INBOX_ID=...              (numeric id shown in the sandbox inbox URL)
//   RESEND_API_KEY=...                 (only needed once you switch to resend)
//   EMAIL_FROM=safeguard@siginon.com   (used by either provider)

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: SendEmailInput): Promise<{ ok: boolean; error?: string }> {
  const provider = Deno.env.get("EMAIL_PROVIDER") ?? "mailtrap";
  const from = Deno.env.get("EMAIL_FROM") ?? "safeguard@siginon.com";

  try {
    if (provider === "resend") {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from, to, subject, html }),
      });
      if (!res.ok) return { ok: false, error: `Resend ${res.status}: ${await res.text()}` };
      return { ok: true };
    }

    // Default: Mailtrap sandbox testing API
    const inboxId = Deno.env.get("MAILTRAP_INBOX_ID");
    const res = await fetch(`https://sandbox.api.mailtrap.io/api/send/${inboxId}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${Deno.env.get("MAILTRAP_API_TOKEN")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: { email: from, name: "SafeGuard" },
        to: [{ email: to }],
        subject,
        html,
      }),
    });
    if (!res.ok) return { ok: false, error: `Mailtrap ${res.status}: ${await res.text()}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
