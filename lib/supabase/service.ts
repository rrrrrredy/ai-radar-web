import { createClient, type SupabaseClient, type WebSocketLikeConstructor } from "@supabase/supabase-js";
import WebSocket from "ws";

import { getSupabasePublicConfig } from "@/lib/config";
import { isEnabled } from "@/lib/utils";

const nodeRealtimeTransport = WebSocket as unknown as WebSocketLikeConstructor;

export type SupabaseServiceStatus = {
  publicConfigConfigured: boolean;
  serviceRoleConfigured: boolean;
  writesEnabled: boolean;
  writeReady: boolean;
};

export function getSupabaseServiceStatus(): SupabaseServiceStatus {
  assertServerRuntime();

  const publicConfig = getSupabasePublicConfig();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const writesEnabled = isEnabled(process.env.ENABLE_SUPABASE_WRITES);

  return {
    publicConfigConfigured: Boolean(publicConfig),
    serviceRoleConfigured: Boolean(serviceRoleKey),
    writesEnabled,
    writeReady: Boolean(publicConfig && serviceRoleKey && writesEnabled)
  };
}

export function getSupabaseServiceClient(): SupabaseClient {
  assertServerRuntime();

  const publicConfig = getSupabasePublicConfig();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!publicConfig || !serviceRoleKey) {
    throw new Error("Supabase service access requires public Supabase config and SUPABASE_SERVICE_ROLE_KEY.");
  }

  return createClient(publicConfig.url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    // Supabase JS constructs Realtime during createClient; Node 20 CLI writes need an explicit transport.
    realtime: {
      transport: nodeRealtimeTransport
    }
  });
}

export function getSupabaseServiceClientForWrite(): SupabaseClient {
  if (!isEnabled(process.env.ENABLE_SUPABASE_WRITES)) {
    throw new Error("Supabase write mode requires ENABLE_SUPABASE_WRITES=true.");
  }

  return getSupabaseServiceClient();
}

export function assertSupabaseWriteGate(writeRequested: boolean) {
  if (!writeRequested) {
    return;
  }

  getSupabaseServiceClientForWrite();
}

function assertServerRuntime() {
  if (typeof window !== "undefined") {
    throw new Error("Supabase service access is server-only.");
  }
}
