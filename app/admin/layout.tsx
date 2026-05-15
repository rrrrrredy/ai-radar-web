import type { ReactNode } from "react";
import { headers } from "next/headers";

import { sanitizeNextPath } from "@/lib/auth/redirects";
import { requireUserRole } from "@/lib/auth/roles";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const headerList = await headers();
  const next = sanitizeNextPath(headerList.get("x-ai-radar-pathname"), "/admin");

  await requireUserRole("admin", next);

  return <>{children}</>;
}
