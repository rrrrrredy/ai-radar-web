import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { sanitizeNextPath } from "@/lib/auth/redirects";
import { getAuthProviders } from "@/lib/auth/providers";
import { getAppConfig } from "@/lib/config";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type LoginPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = (await searchParams) ?? {};
  const next = sanitizeNextPath(readParam(params.next), "/");
  const status = readParam(params.status);
  const config = getAppConfig();
  const providers = getAuthProviders();
  const statusMessage = loginStatusMessage(status);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <section>
        <h1 className="text-3xl font-semibold text-radar-ink">Sign in</h1>
        <p className="mt-3 text-sm leading-6 text-radar-muted">
          Supabase Email magic links and GitHub OAuth are the supported sign-in
          paths for editors and admins. Public radar, reports, and entities
          remain available without signing in.
        </p>
      </section>

      {statusMessage ? (
        <div className={`rounded-lg border p-4 text-sm leading-6 ${statusMessage.className}`}>
          {statusMessage.message}
        </div>
      ) : null}

      {!config.supabase.isConfigured ? (
        <div className="rounded-lg border border-radar-line bg-radar-panel p-5 text-sm leading-6 text-radar-muted">
          Supabase environment variables are not configured yet. Add
          NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY locally to
          enable auth flows. The app still builds without them.
        </div>
      ) : null}

      <section className="rounded-lg border border-radar-line bg-white p-5 shadow-soft">
        <form action={sendMagicLink} className="space-y-4">
          <input name="next" type="hidden" value={next} />
          <label className="block" htmlFor="email">
          <span className="text-sm font-semibold text-radar-ink">Email</span>
          <input
            className="mt-2 w-full rounded-md border border-radar-line px-3 py-2 text-sm text-radar-ink"
            disabled={!config.supabase.isConfigured}
            id="email"
            name="email"
            placeholder="you@example.com"
            required
            type="email"
          />
        </label>
        <button
            className="rounded-md bg-radar-ink px-4 py-2 text-sm font-semibold text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!config.supabase.isConfigured}
            type="submit"
        >
            Send magic link
        </button>
        </form>
      </section>

      <section className="space-y-3">
        {providers.map((provider) => (
          <div className="rounded-lg border border-radar-line bg-white p-4" key={provider.id}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-radar-ink">{provider.label}</h2>
                <p className="mt-1 text-sm text-radar-muted">{provider.description}</p>
              </div>
              {provider.id === "github" ? (
                <form action={startGithubOAuth}>
                  <input name="next" type="hidden" value={next} />
                  <button
                    className="rounded-md border border-radar-line px-3 py-2 text-sm font-semibold text-radar-ink hover:border-radar-evidence hover:text-radar-evidence disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={provider.status !== "ready"}
                    type="submit"
                  >
                    Continue with GitHub
                  </button>
                </form>
              ) : (
                <span className="rounded-md bg-radar-panel px-2 py-1 text-xs font-medium text-radar-muted">
                  {provider.id === "wechat" ? "placeholder disabled" : provider.status}
                </span>
              )}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

async function sendMagicLink(formData: FormData) {
  "use server";

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const next = sanitizeNextPath(String(formData.get("next") ?? "/"), "/");
  const config = getAppConfig();

  if (!config.supabase.isConfigured) {
    redirect(loginPath("supabase-not-configured", next));
  }

  if (!isValidEmail(email)) {
    redirect(loginPath("invalid-email", next));
  }

  const supabase = await getSupabaseServerClient();

  if (!supabase) {
    redirect(loginPath("supabase-not-configured", next));
  }

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: await authCallbackUrl(next),
      shouldCreateUser: true
    }
  });

  if (error) {
    redirect(loginPath("auth-error", next));
  }

  redirect(loginPath("magic-link-sent", next));
}

async function startGithubOAuth(formData: FormData) {
  "use server";

  const next = sanitizeNextPath(String(formData.get("next") ?? "/"), "/");
  const config = getAppConfig();

  if (!config.supabase.isConfigured) {
    redirect(loginPath("supabase-not-configured", next));
  }

  const supabase = await getSupabaseServerClient();

  if (!supabase) {
    redirect(loginPath("supabase-not-configured", next));
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "github",
    options: {
      redirectTo: await authCallbackUrl(next)
    }
  });

  if (error || !data.url) {
    redirect(loginPath("auth-error", next));
  }

  redirect(data.url);
}

async function authCallbackUrl(next: string) {
  const callback = new URL("/auth/callback", await currentRequestOrigin());
  callback.searchParams.set("next", sanitizeNextPath(next));

  return callback.toString();
}

async function currentRequestOrigin() {
  const requestHeaders = await headers();
  const appBaseUrl = getAppConfig().appBaseUrl;
  const candidateOrigins = [
    normalizeHttpOrigin(requestHeaders.get("origin")),
    normalizeHttpOrigin(requestHeaders.get("referer")),
    forwardedRequestOrigin(requestHeaders),
    hostRequestOrigin(requestHeaders)
  ];

  return (
    candidateOrigins.find((candidate): candidate is string => {
      if (!candidate) {
        return false;
      }

      return !shouldIgnoreLoopbackOrigin(candidate, appBaseUrl);
    }) ?? appBaseUrl
  );
}

function forwardedRequestOrigin(requestHeaders: Headers) {
  const forwardedProto = requestHeaders.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = requestHeaders.get("x-forwarded-host")?.split(",")[0]?.trim();
  const protocol = forwardedProto || "http";

  return forwardedHost ? normalizeHttpOrigin(`${protocol}://${forwardedHost}`) : null;
}

function hostRequestOrigin(requestHeaders: Headers) {
  const forwardedProto = requestHeaders.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const host = requestHeaders.get("host");
  const protocol = forwardedProto || "http";

  return host ? normalizeHttpOrigin(`${protocol}://${host}`) : null;
}

function normalizeHttpOrigin(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    const parsed = new URL(value);

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    return parsed.origin;
  } catch {
    return null;
  }
}

function shouldIgnoreLoopbackOrigin(candidate: string, fallback: string) {
  return isLoopbackOrigin(candidate) && !isLoopbackOrigin(fallback);
}

function isLoopbackOrigin(value: string) {
  const hostname = new URL(value).hostname;

  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function loginPath(status: string, next: string) {
  const params = new URLSearchParams({
    next: sanitizeNextPath(next),
    status
  });

  return `/auth/login?${params.toString()}`;
}

function loginStatusMessage(status: string | null) {
  switch (status) {
    case "magic-link-sent":
      return {
        className: "border-radar-evidence/30 bg-radar-evidence/5 text-radar-ink",
        message: "Magic link sent. Check the inbox for the configured Supabase Auth account."
      };
    case "signed-out":
      return {
        className: "border-radar-line bg-radar-panel text-radar-muted",
        message: "Signed out."
      };
    case "missing-code":
    case "auth-error":
      return {
        className: "border-radar-risk/30 bg-radar-risk/5 text-radar-risk",
        message: "The sign-in callback could not be completed. Start a new sign-in request."
      };
    case "invalid-email":
      return {
        className: "border-radar-caution/30 bg-radar-caution/5 text-radar-caution",
        message: "Enter a valid email address."
      };
    case "supabase-not-configured":
      return {
        className: "border-radar-caution/30 bg-radar-caution/5 text-radar-caution",
        message: "Supabase Auth is not configured in this environment."
      };
    default:
      return null;
  }
}

function readParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
