import { getAppConfig } from "@/lib/config";
import { getDeepSeekConfig } from "@/lib/deepseek/provider";

function StatusRow({
  label,
  value,
  detail
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="grid gap-2 border-b border-radar-line py-4 last:border-0 md:grid-cols-[220px_180px_1fr]">
      <p className="font-medium text-radar-ink">{label}</p>
      <p className="text-radar-muted">{value}</p>
      <p className="text-radar-muted">{detail}</p>
    </div>
  );
}

export default function AdminSettingsPage() {
  const config = getAppConfig();
  const deepSeek = getDeepSeekConfig();

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-3xl font-semibold text-radar-ink">Settings</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-radar-muted">
          Configuration status is shown without exposing secret values. Missing
          environment variables should not break local builds.
        </p>
      </section>

      <section className="rounded-lg border border-radar-line bg-white p-5 text-sm shadow-soft">
        <h2 className="text-lg font-semibold text-radar-ink">Environment status</h2>
        <div className="mt-3">
          <StatusRow
            detail="Required for Supabase Auth and Postgres access."
            label="Supabase public config"
            value={config.supabase.isConfigured ? "Configured" : "Missing"}
          />
          <StatusRow
            detail="Server-side only. Never expose this to browser code."
            label="Supabase service role"
            value={config.supabase.hasServiceRoleKey ? "Configured" : "Missing"}
          />
          <StatusRow
            detail="Server-side only. Phase 6 mock/local Q&A and writing do not require this key; live mode is explicit opt-in."
            label="DeepSeek API key"
            value={deepSeek.hasApiKey ? "Configured" : "Missing"}
          />
          <StatusRow
            detail="Bootstrap admin email used for initial role setup."
            label="Admin email"
            value={config.adminEmail}
          />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-radar-line bg-white p-5 shadow-soft">
          <h2 className="text-lg font-semibold text-radar-ink">DeepSeek models</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-radar-muted">Fast model</dt>
              <dd className="font-medium text-radar-ink">{deepSeek.fastModel}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-radar-muted">Smart model</dt>
              <dd className="font-medium text-radar-ink">{deepSeek.smartModel}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-lg border border-radar-line bg-white p-5 shadow-soft">
          <h2 className="text-lg font-semibold text-radar-ink">Feature flags</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-radar-muted">ENABLE_X_API</dt>
              <dd className="font-medium text-radar-ink">
                {String(config.featureFlags.enableXApi)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-radar-muted">ENABLE_WECHAT_AUTH</dt>
              <dd className="font-medium text-radar-ink">
                {String(config.featureFlags.enableWechatAuth)}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="rounded-lg border border-radar-line bg-white p-5 shadow-soft">
        <h2 className="text-lg font-semibold text-radar-ink">Phase 6 generation boundary</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-radar-muted">
          Q&A and writing assistant routes default to mock/local generation over
          retrieved radar-item evidence. Live DeepSeek generation is available only
          when explicitly requested by API input and when the server environment has
          a local key. Supabase-backed retrieval remains future work.
        </p>
      </section>
    </div>
  );
}
