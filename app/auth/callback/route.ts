import { NextResponse, type NextRequest } from "next/server";

import { sanitizeNextPath } from "@/lib/auth/redirects";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = sanitizeNextPath(requestUrl.searchParams.get("next"), "/");

  if (!code) {
    return redirectToLogin(requestUrl, "missing-code", next);
  }

  const supabase = await getSupabaseServerClient();

  if (!supabase) {
    return redirectToLogin(requestUrl, "supabase-not-configured", next);
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return redirectToLogin(requestUrl, "auth-error", next);
  }

  return NextResponse.redirect(new URL(next, requestUrl));
}

function redirectToLogin(requestUrl: URL, status: string, next: string) {
  const loginUrl = new URL("/auth/login", requestUrl);
  loginUrl.searchParams.set("status", status);
  loginUrl.searchParams.set("next", sanitizeNextPath(next));

  return NextResponse.redirect(loginUrl);
}
