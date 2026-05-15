import type { SupabaseClient, User } from "@supabase/supabase-js";

import { getAppConfig } from "@/lib/config";
import {
  getSupabaseServiceClient,
  getSupabaseServiceStatus
} from "@/lib/supabase/service";

export type BootstrapAdminOptions = {
  write: boolean;
};

export type BootstrapAdminResult = {
  adminEmailConfigured: boolean;
  authLookupAttempted: boolean;
  authUserFound: boolean;
  existingAdminRoleFound: boolean;
  existingProfileFound: boolean;
  mode: "dry-run" | "write";
  profileRowsAffected: number;
  roleRowsAffected: number;
  serviceRoleConfigured: boolean;
  supabaseConfigured: boolean;
  userRowsScanned: number;
  writeReady: boolean;
  writesEnabled: boolean;
};

export async function bootstrapAdminRole(
  options: BootstrapAdminOptions
): Promise<BootstrapAdminResult> {
  const config = getAppConfig();
  const serviceStatus = getSupabaseServiceStatus();
  const adminEmail = config.adminEmail.trim().toLowerCase();
  const result: BootstrapAdminResult = {
    adminEmailConfigured: Boolean(adminEmail),
    authLookupAttempted: false,
    authUserFound: false,
    existingAdminRoleFound: false,
    existingProfileFound: false,
    mode: options.write ? "write" : "dry-run",
    profileRowsAffected: 0,
    roleRowsAffected: 0,
    serviceRoleConfigured: serviceStatus.serviceRoleConfigured,
    supabaseConfigured: serviceStatus.publicConfigConfigured,
    userRowsScanned: 0,
    writeReady: serviceStatus.writeReady,
    writesEnabled: serviceStatus.writesEnabled
  };

  if (options.write && !serviceStatus.writeReady) {
    throw new Error("Admin bootstrap write mode requires all write gates.");
  }

  if (!adminEmail || !serviceStatus.publicConfigConfigured || !serviceStatus.serviceRoleConfigured) {
    return result;
  }

  const supabase = getSupabaseServiceClient();
  const lookup = await findAuthUserByEmail(supabase, adminEmail);
  result.authLookupAttempted = true;
  result.authUserFound = Boolean(lookup.user);
  result.userRowsScanned = lookup.scanned;

  if (!lookup.user) {
    return result;
  }

  const profile = await getExistingProfile(supabase, lookup.user.id);
  result.existingProfileFound = Boolean(profile?.id);

  if (profile?.id) {
    result.existingAdminRoleFound = await hasAdminRole(supabase, profile.id);
  }

  if (!options.write) {
    result.profileRowsAffected = profile?.id ? 0 : 1;
    result.roleRowsAffected = result.existingAdminRoleFound ? 0 : 1;
    return result;
  }

  const profileId = await upsertProfile(supabase, lookup.user, adminEmail);
  result.profileRowsAffected = 1;

  const hadAdminRole = await hasAdminRole(supabase, profileId);
  result.existingAdminRoleFound = hadAdminRole;

  if (!hadAdminRole) {
    await upsertAdminRole(supabase, profileId);
    result.roleRowsAffected = 1;
  }

  return result;
}

async function findAuthUserByEmail(supabase: SupabaseClient, email: string) {
  const perPage = 1000;
  let page = 1;
  let scanned = 0;

  while (page <= 50) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage
    });

    if (error) {
      throw new Error("Admin auth user lookup failed.");
    }

    const users = data.users ?? [];
    scanned += users.length;
    const user = users.find((candidate) => candidate.email?.toLowerCase() === email);

    if (user || users.length < perPage) {
      return { scanned, user: user ?? null };
    }

    page += 1;
  }

  return { scanned, user: null };
}

async function getExistingProfile(supabase: SupabaseClient, authUserId: string) {
  const { data, error } = await supabase
    .from("users_profile")
    .select("id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (error) {
    throw new Error("Admin profile lookup failed.");
  }

  return data as { id: string } | null;
}

async function hasAdminRole(supabase: SupabaseClient, profileId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("id")
    .eq("user_id", profileId)
    .eq("role", "admin")
    .maybeSingle();

  if (error) {
    throw new Error("Admin role lookup failed.");
  }

  return Boolean(data);
}

async function upsertProfile(supabase: SupabaseClient, user: User, fallbackEmail: string) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("users_profile")
    .upsert(
      {
        auth_user_id: user.id,
        avatar_url: nullableString(user.user_metadata.avatar_url),
        display_name: nullableString(user.user_metadata.full_name ?? user.user_metadata.name),
        email: user.email ?? fallbackEmail,
        last_seen_at: now,
        updated_at: now
      },
      { onConflict: "auth_user_id" }
    )
    .select("id")
    .single();

  if (error || !data || typeof data.id !== "string") {
    throw new Error("Admin profile upsert failed.");
  }

  return data.id;
}

async function upsertAdminRole(supabase: SupabaseClient, profileId: string) {
  const { error } = await supabase.from("user_roles").upsert(
    {
      role: "admin",
      user_id: profileId
    },
    { onConflict: "user_id,role" }
  );

  if (error) {
    throw new Error("Admin role upsert failed.");
  }
}

function nullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
