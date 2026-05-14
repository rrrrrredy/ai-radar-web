import { mockSourceRegistrySample } from "@/lib/radar/mock-data";
import { readCleanedSources } from "@/lib/ingestion/select-sources";
import { countBy, isSourceHealthEligible } from "@/lib/supabase/persistence";

export default function AdminSourcesPage() {
  const cleanedSources = readCleanedSources();
  const healthEligibleCount = cleanedSources.filter(isSourceHealthEligible).length;
  const statusCounts = countBy(cleanedSources, (source) => source.status);
  const crawlCounts = countBy(cleanedSources, (source) => source.crawl_method);

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-3xl font-semibold text-radar-ink">Source registry</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-radar-muted">
          Sources are tiered by evidence quality. Phase 3 adds a cleaned seed
          registry with public-only URLs, manual URL-completion flags, crawl
          method planning, and conservative source weights.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <StatusCard label="Registry rows" value={String(cleanedSources.length)} />
        <StatusCard label="Active/trial" value={String((statusCounts.active ?? 0) + (statusCounts.trial ?? 0))} />
        <StatusCard label="Health eligible" value={String(healthEligibleCount)} />
        <StatusCard label="Needs URL" value={String(statusCounts.needs_public_url ?? 0)} />
      </section>

      <section>
        <h2 className="text-lg font-semibold text-radar-ink">Supabase persistence status</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <StatusCard label="Import key" value="sources.slug" />
          <StatusCard label="Default mode" value="dry-run" />
          <StatusCard label="Source health history" value="planned table writes" />
        </div>
        <p className="mt-4 text-sm leading-6 text-radar-muted">
          The Phase 7 import script upserts cleaned registry rows by stable slug.
          Sources with missing public URLs are preserved for review but are not
          selected for automated health checks.
        </p>
      </section>

      <section className="rounded-lg border border-radar-line bg-white p-5 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-radar-ink">Cleaned registry sample</h2>
          <button
            className="rounded-md border border-radar-line px-3 py-2 text-sm font-semibold text-radar-muted"
            disabled
            type="button"
          >
            Complete URL placeholder
          </button>
        </div>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-radar-line text-radar-muted">
                <th className="py-3 pr-4 font-semibold">Name</th>
                <th className="py-3 pr-4 font-semibold">Type</th>
                <th className="py-3 pr-4 font-semibold">Tier</th>
                <th className="py-3 pr-4 font-semibold">Status</th>
                <th className="py-3 pr-4 font-semibold">Crawl</th>
                <th className="py-3 pr-4 font-semibold">Weight</th>
                <th className="py-3 pr-4 font-semibold">Risk notes</th>
              </tr>
            </thead>
            <tbody>
              {mockSourceRegistrySample.map((source) => (
                <tr className="border-b border-radar-line last:border-0" key={source.id}>
                  <td className="py-3 pr-4 font-medium text-radar-ink">{source.name}</td>
                  <td className="py-3 pr-4 text-radar-muted">{source.type}</td>
                  <td className="py-3 pr-4 text-radar-muted">{source.tier}</td>
                  <td className="py-3 pr-4 text-radar-muted">{source.status}</td>
                  <td className="py-3 pr-4 text-radar-muted">{source.crawlMethod}</td>
                  <td className="py-3 pr-4 text-radar-muted">{source.weight.toFixed(2)}</td>
                  <td className="py-3 pr-4 text-radar-muted">{source.riskNotes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border border-radar-line bg-white p-5 shadow-soft">
        <h2 className="text-lg font-semibold text-radar-ink">Crawl method distribution</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {Object.entries(crawlCounts)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([method, count]) => (
              <span className="rounded-md border border-radar-line px-2 py-1 text-xs font-semibold text-radar-muted" key={method}>
                {method}: {count}
              </span>
            ))}
        </div>
      </section>
    </div>
  );
}

function StatusCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-radar-line bg-white p-5 shadow-soft">
      <p className="text-sm font-semibold text-radar-muted">{label}</p>
      <p className="mt-3 text-xl font-semibold text-radar-ink">{value}</p>
    </div>
  );
}
