import "server-only";

import { createClient, type SupabaseClient, type WebSocketLikeConstructor } from "@supabase/supabase-js";
import WebSocket from "ws";

import { getSupabasePublicConfig } from "@/lib/config";

const nodeRealtimeTransport = WebSocket as unknown as WebSocketLikeConstructor;

export function getSupabaseServerReadClient(): SupabaseClient | null {
  const publicConfig = getSupabasePublicConfig();

  if (!publicConfig) {
    return null;
  }

  return createClient(publicConfig.url, publicConfig.anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    // Supabase JS constructs Realtime during createClient; Node 20 reads need an explicit transport.
    realtime: {
      transport: nodeRealtimeTransport
    }
  });
}
