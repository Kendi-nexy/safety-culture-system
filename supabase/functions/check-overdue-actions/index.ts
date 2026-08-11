// Runs on a schedule (every 30 min, via pg_cron — see the migration) rather
// than being triggered by a single row change. Finds reports past their SLA
// due date that are still open, and reminds whoever they're assigned to.
// Skips reports reminded in the last 24h so it doesn't spam the same person
// every 30 minutes.

import { createClient } from "npm:@supabase/supabase-js@2";
import { sendEmail } from "../_shared/email.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (_req) => {
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: overdue, error } = await supabase
      .from("reports")
      .select("id, reference_number, category, zone, severity, due_at, assigned_to, last_reminder_sent_at, profiles!reports_assigned_to_fkey(email, full_name)")
      .lt("due_at", new Date().toISOString())
      .not("status", "in", "(resolved,closed)")
      .not("assigned_to", "is", null)
      .or(`last_reminder_sent_at.is.null,last_reminder_sent_at.lt.${twentyFourHoursAgo}`);

    if (error) {
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const results = [];
    for (const report of overdue ?? []) {
      const assignee = (report as any).profiles;
      if (!assignee?.email) continue;

      const sendResult = await sendEmail({
        to: assignee.email,
        subject: `Overdue: ${report.reference_number} needs attention`,
        html: `
          <p>Hi ${assignee.full_name?.split(" ")[0] ?? "there"},</p>
          <p><strong>${report.reference_number}</strong> (${report.category.replace("_", " ")} at ${report.zone}) is past its SLA due date and still open.</p>
          <p>Severity: ${report.severity}. Please review and update its status.</p>
        `,
      });

      if (sendResult.ok) {
        await supabase
          .from("reports")
          .update({ last_reminder_sent_at: new Date().toISOString() })
          .eq("id", report.id);
      }
      results.push({ report: report.reference_number, ...sendResult });
    }

    return new Response(JSON.stringify({ ok: true, checked: overdue?.length ?? 0, results }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
