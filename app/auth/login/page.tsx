import { getAuthProviders } from "@/lib/auth/providers";
import { getAppConfig } from "@/lib/config";

export default function LoginPage() {
  const config = getAppConfig();
  const providers = getAuthProviders();

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <section>
        <h1 className="text-3xl font-semibold text-radar-ink">Sign in</h1>
        <p className="mt-3 text-sm leading-6 text-radar-muted">
          Supabase Email and GitHub auth are the first supported providers. WeChat
          is a feature-flagged placeholder and is not presented as working login.
        </p>
      </section>

      {!config.supabase.isConfigured ? (
        <div className="rounded-lg border border-radar-line bg-radar-panel p-5 text-sm leading-6 text-radar-muted">
          Supabase environment variables are not configured yet. Add
          NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY locally to
          enable auth flows. The app still builds without them.
        </div>
      ) : null}

      <section className="rounded-lg border border-radar-line bg-white p-5 shadow-soft">
        <label className="block">
          <span className="text-sm font-semibold text-radar-ink">Email</span>
          <input
            className="mt-2 w-full rounded-md border border-radar-line px-3 py-2 text-sm text-radar-ink"
            disabled={!config.supabase.isConfigured}
            placeholder="you@example.com"
            type="email"
          />
        </label>
        <button
          className="mt-4 rounded-md bg-radar-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          disabled
          type="button"
        >
          Email sign-in placeholder
        </button>
      </section>

      <section className="space-y-3">
        {providers.map((provider) => (
          <div className="rounded-lg border border-radar-line bg-white p-4" key={provider.id}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-radar-ink">{provider.label}</h2>
                <p className="mt-1 text-sm text-radar-muted">{provider.description}</p>
              </div>
              <span className="rounded-md bg-radar-panel px-2 py-1 text-xs font-medium text-radar-muted">
                {provider.status}
              </span>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
