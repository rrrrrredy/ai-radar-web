import "server-only";

import { redirect } from "next/navigation";

import { sanitizeNextPath } from "@/lib/auth/redirects";
import { requireAuth } from "@/lib/auth/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const appRoles = ["admin", "editor", "viewer"] as const;

export type AppRole = (typeof appRoles)[number];

const roleRank: Record<AppRole, number> = {
  viewer: 1,
  editor: 2,
  admin: 3
};

export function isAppRole(value: string): value is AppRole {
  return appRoles.includes(value as AppRole);
}

export function canAccessRole(userRole: AppRole, minimumRole: AppRole) {
  return roleRank[userRole] >= roleRank[minimumRole];
}

export async function getUserRole(userId: string): Promise<AppRole | null> {
  const supabase = await getSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const { data: profile, error: profileError } = await supabase
    .from("users_profile")
    .select("id")
    .eq("auth_user_id", userId)
    .maybeSingle();

  if (profileError || !profile || typeof profile.id !== "string") {
    return null;
  }

  const { data: rows, error: rolesError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", profile.id);

  if (rolesError || !rows) {
    return null;
  }

  return highestRole(rows.map((row) => String(row.role)));
}

export async function requireUserRole(minRole: AppRole, next = "/") {
  const user = await requireAuth(sanitizeNextPath(next));
  const role = await getUserRole(user.id);

  if (!role || !canAccessRole(role, minRole)) {
    redirect("/unauthorized");
  }

  return { role, user };
}

export function highestRole(roles: string[]): AppRole | null {
  return roles.reduce<AppRole | null>((highest, role) => {
    if (!isAppRole(role)) {
      return highest;
    }

    if (!highest || roleRank[role] > roleRank[highest]) {
      return role;
    }

    return highest;
  }, null);
}

export function getBootstrapRoleForEmail(
  email: string | null | undefined,
  adminEmail = process.env.ADMIN_EMAIL || ""
): AppRole {
  if (adminEmail && email?.toLowerCase() === adminEmail.toLowerCase()) {
    return "admin";
  }

  return "viewer";
}
