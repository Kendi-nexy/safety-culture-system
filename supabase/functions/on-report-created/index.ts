// Fires once per new report (triggered by the trg_notify_on_report_created
// Postgres trigger — see supabase/migrations/20260801000000_email_notifications.sql).
// Handles two independent notifications:
//   1. Hazard reports -> email every Supervisor/HSE/Admin.
//   2. Any report with a reporter_email -> send that person a confirmation.
// Either can fail independently without blocking the other.

import { createClient } from "npm:@supabase/supabase-js@2";
import { sendEmail } from "../_shared/email.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const SEVERITY_LABEL: Record<string, string> = { low: "Low", medium: "Medium", high: "High" };

Deno.serve(async (req) => {
  try {
    const { record } = await req.json();
    const results: Record<string, unknown> = {};

    // --- 1. Hazard -> notify Supervisor/HSE/Admin -------------------------
    if (record.category === "hazard") {
      const { data: staff, error } = await supabase
        .from("profiles")
        .select("email, full_name")
        .in("role", ["supervisor", "hse", "admin"]);

      if (error) {
        results.hazardNotify = { ok: false, error: error.message };
      } else {
        const sendResults = await Promise.all(
          (staff ?? []).map((person) =>
            sendEmail({
              to: person.email,
              subject: `New hazard reported — ${record.reference_number}`,
              html: `
                <p>Hi ${person.full_name.split(" ")[0]},</p>
                <p>A new hazard was just reported at <strong>${record.zone}</strong>.</p>
                <p><strong>Severity:</strong> ${SEVERITY_LABEL[record.severity] ?? record.severity}</p>
                <p><strong>Description:</strong> ${record.description}</p>
                <p>Reference: <strong>${record.reference_number}</strong></p>
                <p><a href="https://your-app-domain.com/dashboard">Open the dashboard</a> to investigate and assign it.</p>
              `,
            })
          )
        );
        results.hazardNotify = { ok: true, count: sendResults.length, results: sendResults };
      }
    }

    // --- 2. Reporter confirmation -----------------------------------------
    if (record.reporter_email) {
      const confirmResult = await sendEmail({
        to: record.reporter_email,
        subject: `We got your report — ${record.reference_number}`,
        html: `
          <p>Thanks for speaking up.</p>
          <p>Your report has been logged as <strong>${record.reference_number}</strong> and will be reviewed within 24 hours.</p>
          <p><strong>Type:</strong> ${record.category.replace("_", " ")}</p>
          <p><strong>Zone:</strong> ${record.zone}</p>
          <p>Every catch counts — thank you for helping keep Siginon safe.</p>
        `,
      });
      results.confirmation = confirmResult;
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
