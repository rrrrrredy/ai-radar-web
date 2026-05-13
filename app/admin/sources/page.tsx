import { mockSources } from "@/lib/radar/mock-data";

export default function AdminSourcesPage() {
  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-3xl font-semibold text-radar-ink">Source registry</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-radar-muted">
          Sources are tiered by evidence quality. Tier 1 is primary or official,
          Tier 2 is reputable secondary or public repository signal, Tier 3 is
          contextual, and Tier 4 is low-confidence watch-only material.
        </p>
      </section>

      <section className="rounded-lg border border-radar-line bg-white p-5 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-radar-ink">Demo sources</h2>
          <button
            className="rounded-md border border-radar-line px-3 py-2 text-sm font-semibold text-radar-muted"
            disabled
            type="button"
          >
            Add source placeholder
          </button>
        </div>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-radar-line text-radar-muted">
                <th className="py-3 pr-4 font-semibold">Name</th>
                <th className="py-3 pr-4 font-semibold">Type</th>
                <th className="py-3 pr-4 font-semibold">Tier</th>
                <th className="py-3 pr-4 font-semibold">Status</th>
                <th className="py-3 pr-4 font-semibold">Weight</th>
                <th className="py-3 pr-4 font-semibold">Risk notes</th>
              </tr>
            </thead>
            <tbody>
              {mockSources.map((source) => (
                <tr className="border-b border-radar-line last:border-0" key={source.id}>
                  <td className="py-3 pr-4 font-medium text-radar-ink">{source.name}</td>
                  <td className="py-3 pr-4 text-radar-muted">{source.type}</td>
                  <td className="py-3 pr-4 text-radar-muted">Tier {source.tier}</td>
                  <td className="py-3 pr-4 text-radar-muted">{source.status}</td>
                  <td className="py-3 pr-4 text-radar-muted">{source.weight.toFixed(2)}</td>
                  <td className="py-3 pr-4 text-radar-muted">{source.riskNotes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
