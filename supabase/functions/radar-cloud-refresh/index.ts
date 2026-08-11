import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.86.0";

import { collectSource, type CloudSource } from "./parser.ts";

type TaskRequest = {
  run_id?: unknown;
  source_id?: unknown;
  token?: unknown;
};

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff"
};

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405, { allow: "POST" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "service_unavailable" }, 503);
  }

  let body: TaskRequest;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_request" }, 400);
  }

  const runId = stringValue(body.run_id);
  const sourceId = stringValue(body.source_id);
  const token = stringValue(body.token);
  if (!uuid(runId) || !uuid(sourceId) || token.length < 32 || token.length > 256) {
    return json({ error: "invalid_request" }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const claimed = await supabase.rpc("radar_cloud_claim_task", {
    p_run_id: runId,
    p_source_id: sourceId,
    p_token: token
  });
  if (claimed.error || !claimed.data || typeof claimed.data !== "object") {
    return json({ error: "not_authorized" }, 401);
  }

  const source = claimed.data as CloudSource;
  try {
    const result = await collectSource(source, 3);
    const completed = await supabase.rpc("radar_cloud_complete_task", {
      p_run_id: runId,
      p_source_id: sourceId,
      p_token: token,
      p_fetch_succeeded: result.fetch_succeeded,
      p_items: result.items,
      p_error_message: result.error_message
    });
    if (completed.error) {
      throw new Error("Unable to persist the source result.");
    }
    return json({ ok: true }, 200);
  } catch {
    await supabase.rpc("radar_cloud_fail_task", {
      p_run_id: runId,
      p_source_id: sourceId,
      p_token: token,
      p_error_message: "The cloud source task failed before persistence."
    });
    return json({ error: "source_task_failed" }, 500);
  }
});

function json(body: Record<string, unknown>, status: number, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...headers }
  });
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function uuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
