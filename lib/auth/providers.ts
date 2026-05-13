import { getAppConfig } from "@/lib/config";

export type AuthProviderStatus = "ready" | "needs_config" | "feature_disabled";

export type AuthProviderConfig = {
  id: "email" | "github" | "wechat";
  label: string;
  description: string;
  status: AuthProviderStatus;
};

export function getAuthProviders(): AuthProviderConfig[] {
  const config = getAppConfig();
  const supabaseReady = config.supabase.isConfigured;

  return [
    {
      id: "email",
      label: "Email",
      description: "Supabase email magic-link sign-in for editors and admins.",
      status: supabaseReady ? "ready" : "needs_config"
    },
    {
      id: "github",
      label: "GitHub",
      description: "Supabase GitHub OAuth provider for technical contributors.",
      status: supabaseReady ? "ready" : "needs_config"
    },
    {
      id: "wechat",
      label: "WeChat",
      description: "Placeholder adapter only; no working WeChat login is enabled in Phase 2.",
      status: config.featureFlags.enableWechatAuth ? "needs_config" : "feature_disabled"
    }
  ];
}
