import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { sanitizeNextPath } from "@/lib/auth/redirects";
import { getSupabasePublicConfig } from "@/lib/config";

export async function updateSession(request: NextRequest) {
  const config = getSupabasePublicConfig();
  const requestPath = sanitizeNextPath(
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
    "/"
  );
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-ai-radar-pathname", requestPath);

  let response = NextResponse.next({
    request: {
      headers: requestHeaders
    }
  });
  const isAdminPath =
    request.nextUrl.pathname === "/admin" ||
    request.nextUrl.pathname.startsWith("/admin/");

  if (!config) {
    if (isAdminPath) {
      return redirectToLogin(request, requestPath);
    }

    return response;
  }

  const supabase = createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        response = NextResponse.next({
          request: {
            headers: requestHeaders
          }
        });

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      }
    }
  });

  const { data, error } = await supabase.auth.getUser();

  if (isAdminPath && (error || !data.user)) {
    const redirectResponse = redirectToLogin(request, requestPath);

    response.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie);
    });

    return redirectResponse;
  }

  return response;
}

function redirectToLogin(request: NextRequest, next: string) {
  const loginUrl = new URL("/auth/login", request.url);
  loginUrl.searchParams.set("next", sanitizeNextPath(next, "/admin"));

  return NextResponse.redirect(loginUrl);
}
