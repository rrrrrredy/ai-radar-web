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

export function getBootstrapRoleForEmail(
  email: string | null | undefined,
  adminEmail = process.env.ADMIN_EMAIL || "luosongred@gmail.com"
): AppRole {
  if (email?.toLowerCase() === adminEmail.toLowerCase()) {
    return "admin";
  }

  return "viewer";
}
