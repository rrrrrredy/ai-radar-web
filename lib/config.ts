import { isEnabled } from "@/lib/utils";

export type AppConfig = {
  appBaseUrl: string;
  adminEmail: string;
  featureFlags: {
    enableXApi: boolean;
    enableWechatAuth: boolean;
    enableSupabaseRetrieval: boolean;
    enableSupabaseWrites: boolean;
  };
  supabase: {
    url?: string;
    anonKey?: string;
    isConfigured: boolean;
  };
  deepSeek: {
    baseUrl: string;
    fastModel: string;
    smartModel: string;
    hasApiKey: boolean;
  };
};

export function getAppConfig(): AppConfig {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const deepSeekApiKey = process.env.DEEPSEEK_API_KEY?.trim();

  return {
    appBaseUrl: process.env.APP_BASE_URL || "http://localhost:3000",
    adminEmail: process.env.ADMIN_EMAIL || "luosongred@gmail.com",
    featureFlags: {
      enableXApi: isEnabled(process.env.ENABLE_X_API),
      enableWechatAuth: isEnabled(process.env.ENABLE_WECHAT_AUTH),
      enableSupabaseRetrieval: isEnabled(process.env.ENABLE_SUPABASE_RETRIEVAL),
      enableSupabaseWrites: isEnabled(process.env.ENABLE_SUPABASE_WRITES)
    },
    supabase: {
      url: supabaseUrl,
      anonKey: supabaseAnonKey,
      isConfigured: Boolean(supabaseUrl && supabaseAnonKey)
    },
    deepSeek: {
      baseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
      fastModel: process.env.DEEPSEEK_FAST_MODEL || "deepseek-v4-flash",
      smartModel: process.env.DEEPSEEK_SMART_MODEL || "deepseek-v4-pro",
      hasApiKey: Boolean(deepSeekApiKey)
    }
  };
}

export function getSupabasePublicConfig() {
  const { supabase } = getAppConfig();

  if (!supabase.url || !supabase.anonKey) {
    return null;
  }

  return {
    url: supabase.url,
    anonKey: supabase.anonKey
  };
}
