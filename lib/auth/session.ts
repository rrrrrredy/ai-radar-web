import "server-only";

import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import { loginPathForNext } from "@/lib/auth/redirects";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function getCurrentUser(): Promise<User | null> {
  const supabase = await getSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase.auth.getUser();

  if (error) {
    return null;
  }

  return data.user ?? null;
}

export async function requireAuth(next = "/"): Promise<User> {
  const user = await getCurrentUser();

  if (!user) {
    redirect(loginPathForNext(next));
  }

  return user;
}
