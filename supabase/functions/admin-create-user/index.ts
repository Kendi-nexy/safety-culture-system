// supabase/functions/admin-create-user/index.ts
//
// Lets an Admin create a real login (email + password) for a new user in
// one step: creates the auth.users row via the service role, then inserts
// the matching profiles row. Must run server-side because
// auth.admin.createUser() requires the service role key, which can never
// be shipped to the browser.
//
// Deploy via the Supabase Studio SQL/Functions editor (same route used for
// on-report-created), or `supabase functions deploy admin-create-user` if
// the CLI is available. Requires SUPABASE_URL, SUPABASE_ANON_KEY and
// SUPABASE_SERVICE_ROLE_KEY — all provided automatically in the Edge
// Function environment, no extra secrets to set.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    // Client scoped to the caller's own JWT, purely to find out who they are.
    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: callerData, error: callerErr } = await callerClient.auth.getUser();
    if (callerErr || !callerData?.user) {
      return json({ error: "Not authenticated" }, 401);
    }

    // Service-role client for the privileged checks and writes below.
    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: callerProfile, error: callerProfileErr } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", callerData.user.id)
      .single();

    if (callerProfileErr || callerProfile?.role !== "admin") {
      return json({ error: "Only admins can create accounts" }, 403);
    }

    const body = await req.json().catch(() => null);
    const { email, password, full_name, role, site_id, department, phone } = body ?? {};

    if (!email || !password || !full_name || !role || !site_id) {
      return json(
        { error: "email, password, full_name, role and site_id are all required" },
        400
      );
    }

    const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createErr || !created?.user) {
      return json({ error: createErr?.message ?? "Could not create the auth account" }, 400);
    }

    const { error: insertErr } = await adminClient.from("profiles").insert({
      id: created.user.id,
      full_name,
      email,
      role,
      site_id,
      department: department || null,
      phone: phone || null,
      status: "active",
    });

    if (insertErr) {
      // Don't leave a login with no profile behind it — clean up the auth
      // user if the profile insert failed for any reason.
      await adminClient.auth.admin.deleteUser(created.user.id);
      return json({ error: insertErr.message }, 400);
    }

    return json({ id: created.user.id, email }, 200);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
