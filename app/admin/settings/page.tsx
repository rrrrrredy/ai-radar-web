import { AdminDataTable, type AdminDataTableColumn } from "@/components/admin-data-table";
import { AdminStatusCard } from "@/components/admin-status-card";
import { DataSourceChip } from "@/components/data-source-chip";
import { StatusChip, type StatusTone } from "@/components/status-chip";
import { getAppConfig } from "@/lib/config";
import { getDeepSeekConfig } from "@/lib/deepseek/provider";
import { getSupabaseServiceStatus } from "@/lib/supabase/service";

type ConfigRow = {
  boundary: string;
  detail: string;
  keyName: string;
  status: boolean | "setup placeholder" | "daily guarded refresh";
  tone?: StatusTone;
};

export default function AdminSettingsPage() {
  const config = getAppConfig();
  const deepSeek = getDeepSeekConfig();
  const supabaseService = getSupabaseServiceStatus();

  const retrievalRows: ConfigRow[] = [
    {
      boundary: "Public anon retrieval",
      detail: "Required before server routes can read the public Supabase radar view.",
      keyName: "NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY",
      status: config.supabase.isConfigured,
      tone: config.supabase.isConfigured ? "success" : "neutral"
    },
    {
      boundary: "Read feature flag",
      detail: "When false, retrieval falls back to local understanding output and then mock data.",
      keyName: "ENABLE_SUPABASE_RETRIEVAL",
      status: config.featureFlags.enableSupabaseRetrieval,
      tone: config.featureFlags.enableSupabaseRetrieval ? "success" : "caution"
    }
  ];

  const mutationRows: ConfigRow[] = [
    {
      boundary: "Service-role mutation scripts",
      detail: "Server-side CLI scripts only. Never exposed to browser code.",
      keyName: "SUPABASE_SERVICE_ROLE_KEY",
      status: supabaseService.serviceRoleConfigured,
      tone: supabaseService.serviceRoleConfigured ? "risk" : "neutral"
    },
    {
      boundary: "Supabase mutation feature flag",
      detail: "False blocks mutation clients. True still requires an explicit CLI mutation request.",
      keyName: "ENABLE_SUPABASE_WRITES",
      status: config.featureFlags.enableSupabaseWrites,
      tone: config.featureFlags.enableSupabaseWrites ? "risk" : "success"
    },
    {
      boundary: "Combined mutation readiness",
      detail: "True means environment gates are present; admin pages still do not execute mutations.",
      keyName: "public config + service role + mutation flag",
      status: supabaseService.writeReady,
      tone: supabaseService.writeReady ? "risk" : "success"
    }
  ];

  const providerRows: ConfigRow[] = [
    {
      boundary: "DeepSeek live mode",
      detail: "Live calls require explicit live mode plus a configured key. Admin pages do not call DeepSeek.",
      keyName: "DEEPSEEK_API_KEY",
      status: deepSeek.hasApiKey,
      tone: deepSeek.hasApiKey ? "caution" : "success"
    },
    {
      boundary: "Scheduled jobs",
      detail: "GitHub Actions runs a daily guarded refresh at 08:17 Asia/Shanghai, followed by strict snapshot and deployment verification.",
      keyName: ".github/workflows/radar-refresh-cloudflare.yml",
      status: "daily guarded refresh",
      tone: "success"
    },
    {
      boundary: "X API placeholder",
      detail: "Feature flag only. X account rows remain future/manual workflow items.",
      keyName: "ENABLE_X_API",
      status: config.featureFlags.enableXApi,
      tone: config.featureFlags.enableXApi ? "caution" : "success"
    },
    {
      boundary: "WeChat placeholder",
      detail: "Feature flag only. No WeChat auth or auto-crawl path is enabled here.",
      keyName: "ENABLE_WECHAT_AUTH",
      status: config.featureFlags.enableWechatAuth,
      tone: config.featureFlags.enableWechatAuth ? "caution" : "success"
    },
    {
      boundary: "Admin bootstrap",
      detail: "Only boolean setup status is shown; the email value is never rendered here.",
      keyName: "ADMIN_EMAIL",
      status: Boolean(process.env.ADMIN_EMAIL?.trim()) || "setup placeholder",
      tone: process.env.ADMIN_EMAIL?.trim() ? "success" : "neutral"
    }
  ];

  return (
    <div className="space-y-8">
      <section>
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip label="Booleans only" tone="admin" />
          <StatusChip label="No secret values" tone="risk" />
          <StatusChip label="Supabase mutations separated" tone="caution" />
        </div>
        <h1 className="mt-4 text-3xl font-semibold text-radar-ink">
          Settings
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-radar-muted">
          Configuration status is shown without exposing environment values,
          model names, keys, URLs, emails, or service tokens. Unknown setup
          areas are labeled as placeholders instead of guessed.
        </p>
      </section>

      <section
        aria-label="Configuration overview"
        className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
      >
        <AdminStatusCard
          detail="Anon Supabase retrieval can only read the public-safe radar item view when configured and enabled."
          label="Public retrieval"
          tone={config.featureFlags.enableSupabaseRetrieval ? "success" : "caution"}
          value={String(config.featureFlags.enableSupabaseRetrieval)}
        />
        <AdminStatusCard
          detail="Supabase mutation scripts require service-role credentials, the mutation flag, and explicit CLI mutation mode."
          label="Supabase mutations"
          tone={config.featureFlags.enableSupabaseWrites ? "risk" : "success"}
          value={String(config.featureFlags.enableSupabaseWrites)}
        />
        <AdminStatusCard
          detail="Live provider calls remain explicit opt-in; mock/local flows do not require this key."
          label="DeepSeek key"
          tone={deepSeek.hasApiKey ? "caution" : "success"}
          value={String(deepSeek.hasApiKey)}
        />
        <AdminStatusCard
          detail="Only scheduled dry-runs exist. WeChat auth and X API integration are placeholders or disabled flags."
          label="External ops"
          tone="caution"
          value="dry-run"
        />
      </section>

      <section className="min-w-0 rounded-lg border border-radar-line bg-white p-4 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-radar-ink">
              Public anon retrieval
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-radar-muted">
              Read-only retrieval is separate from service-role scripts. It uses
              public-safe fields only when enabled and configured.
            </p>
          </div>
          <DataSourceChip detail="read-only" source="supabase_radar_items" />
        </div>
        <div className="mt-4">
          <AdminDataTable
            ariaLabel="Public retrieval configuration status"
            columns={configColumns}
            minWidth="820px"
            rowKey={(row) => row.keyName}
            rows={retrievalRows}
          />
        </div>
      </section>

      <section className="min-w-0 rounded-lg border border-radar-risk/30 bg-white p-4 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-radar-ink">
              Service-role mutation scripts
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-radar-muted">
              Service-role access belongs to local/server CLI scripts only.
              Admin UI pages do not expose, execute, or schedule mutation paths.
            </p>
          </div>
          <StatusChip label="Mutation gated" tone="risk" />
        </div>
        <div className="mt-4">
          <AdminDataTable
            ariaLabel="Service-role mutation configuration status"
            columns={configColumns}
            minWidth="820px"
            rowKey={(row) => row.keyName}
            rows={mutationRows}
          />
        </div>
      </section>

      <section className="min-w-0 rounded-lg border border-radar-line bg-radar-panel p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-radar-ink">
              Provider and job placeholders
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-radar-muted">
              Placeholders are explicit so they cannot be mistaken for enabled
              production integrations or scheduled persistence jobs.
            </p>
          </div>
          <StatusChip label="No live job implied" tone="caution" />
        </div>
        <div className="mt-4">
          <AdminDataTable
            ariaLabel="Provider and scheduled job configuration status"
            columns={configColumns}
            minWidth="820px"
            rowKey={(row) => row.keyName}
            rows={providerRows}
          />
        </div>
      </section>
    </div>
  );
}

const configColumns: AdminDataTableColumn<ConfigRow>[] = [
  {
    header: "Boundary",
    render: (row) => <p className="font-semibold text-radar-ink">{row.boundary}</p>
  },
  {
    header: "Key / setup area",
    render: (row) => (
      <p className="break-words font-mono text-xs leading-5 text-radar-code">
        {row.keyName}
      </p>
    )
  },
  {
    header: "Status",
    render: (row) => (
      <StatusChip
        label={String(row.status)}
        tone={row.tone ?? statusTone(row.status)}
      />
    )
  },
  {
    header: "Boundary note",
    render: (row) => (
      <p className="max-w-2xl text-sm leading-6 text-radar-muted">
        {row.detail}
      </p>
    )
  }
];

function statusTone(status: ConfigRow["status"]): StatusTone {
  if (status === true) {
    return "success";
  }

  if (status === false) {
    return "neutral";
  }

  return "caution";
}
