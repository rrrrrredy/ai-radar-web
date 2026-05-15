import { NextResponse, type NextRequest } from "next/server";

import { sanitizeNextPath } from "@/lib/auth/redirects";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const next = sanitizeNextPath(requestUrl.searchParams.get("next"), "/");
  const supabase = await getSupabaseServerClient();

  if (supabase) {
    await supabase.auth.signOut();
  }

  const redirectUrl = new URL(next === "/" ? "/auth/login" : next, requestUrl);

  if (next === "/") {
    redirectUrl.searchParams.set("status", "signed-out");
  }

  return NextResponse.redirect(redirectUrl);
}
