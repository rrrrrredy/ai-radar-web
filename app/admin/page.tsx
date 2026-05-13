import { AdminSection } from "@/components/admin-section";
import { MetricCard } from "@/components/metric-card";
import { mockIngestionRuns, mockRadarItems, mockSources } from "@/lib/radar/mock-data";

const sections = [
  {
    href: "/admin/sources",
    title: "Sources",
    description: "Manage public source registry, tiers, health status, and risk notes.",
    metric: "3 demo sources"
  },
  {
    href: "/admin/ingestion",
    title: "Ingestion",
    description: "Inspect scheduled and manual ingestion runs before real jobs exist.",
    metric: "2 demo runs"
  },
  {
    href: "/admin/scoring",
    title: "Scoring",
    description: "Review score dimensions, weights, and negative rules.",
    metric: "5 dimensions"
  },
  {
    href: "/admin/settings",
    title: "Settings",
    description: "Check environment placeholders, feature flags, and provider boundaries.",
    metric: "Phase 2 config"
  }
];

export default function AdminPage() {
  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-3xl font-semibold text-radar-ink">Admin dashboard</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-radar-muted">
          Admin protection is structured but not hard-blocking in Phase 2. The next
          phase should enforce role checks in server code, not only middleware.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard
          detail="Synthetic source registry rows."
          label="Sources"
          value={String(mockSources.length)}
        />
        <MetricCard
          detail="Synthetic radar items currently displayed."
          label="Radar items"
          value={String(mockRadarItems.length)}
        />
        <MetricCard
          detail="Placeholder operational logs."
          label="Ingestion runs"
          value={String(mockIngestionRuns.length)}
        />
      </section>

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {sections.map((section) => (
          <AdminSection key={section.href} {...section} />
        ))}
      </section>
    </div>
  );
}
