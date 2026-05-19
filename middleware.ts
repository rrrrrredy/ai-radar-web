import { NextResponse, type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  const canonicalRequest = canonicalizeLocaleRequest(request);

  if (canonicalRequest) {
    return canonicalRequest;
  }

  return updateSession(request);
}

function canonicalizeLocaleRequest(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (!pathname.startsWith("/en/")) {
    return null;
  }

  const strippedPathname = pathname.slice(3);

  if (!needsLocaleCanonicalization(strippedPathname)) {
    return null;
  }

  const canonicalUrl = new URL(request.url);
  canonicalUrl.pathname = strippedPathname;

  return NextResponse.redirect(canonicalUrl);
}

function needsLocaleCanonicalization(pathname: string) {
  return (
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === "/auth" ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/api/") ||
    pathname === "/api" ||
    pathname === "/unauthorized" ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon.ico") ||
    /\\.(?:svg|png|jpg|jpeg|gif|webp)$/.test(pathname)
  );
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"
  ]
};
