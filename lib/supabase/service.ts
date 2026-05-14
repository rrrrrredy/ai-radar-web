import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getSupabasePublicConfig } from "@/lib/config";
import { isEnabled } from "@/lib/utils";

export type SupabaseServiceStatus = {
  publicConfigConfigured: boolean;
  serviceRoleConfigured: boolean;
  writesEnabled: boolean;
  writeReady: boolean;
};

export function getSupabaseServiceStatus(): SupabaseServiceStatus {
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

export function getSupabaseServiceClientForWrite(): SupabaseClient {
  const publicConfig = getSupabasePublicConfig();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!isEnabled(process.env.ENABLE_SUPABASE_WRITES)) {
    throw new Error("Supabase write mode requires ENABLE_SUPABASE_WRITES=true.");
  }

  if (!publicConfig || !serviceRoleKey) {
    throw new Error("Supabase write mode requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }

  return createClient(publicConfig.url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

export function assertSupabaseWriteGate(writeRequested: boolean) {
  if (!writeRequested) {
    return;
  }

  getSupabaseServiceClientForWrite();
}
