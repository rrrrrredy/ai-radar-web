import Link from "next/link";

import { StatusChip } from "@/components/status-chip";

export default function UnauthorizedPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section>
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip label="Signed in" tone="admin" />
          <StatusChip label="Role required" tone="risk" />
        </div>
        <h1 className="mt-4 text-3xl font-semibold text-radar-ink">
          Unauthorized
        </h1>
        <p className="mt-3 text-sm leading-6 text-radar-muted">
          This account is authenticated but does not have the admin role required
          for the production-safe analyst console. Public radar and entity pages
          remain available.
        </p>
      </section>

      <section className="rounded-lg border border-radar-line bg-radar-panel p-5">
        <div className="flex flex-wrap gap-3">
          <Link
            className="rounded-md bg-radar-ink px-4 py-2 text-sm font-semibold text-white hover:bg-black"
            href="/"
          >
            Home
          </Link>
          <Link
            className="rounded-md border border-radar-line bg-white px-4 py-2 text-sm font-semibold text-radar-ink hover:border-radar-evidence hover:text-radar-evidence"
            href="/auth/login?next=/admin"
          >
            Sign in again
          </Link>
        </div>
      </section>
    </div>
  );
}
