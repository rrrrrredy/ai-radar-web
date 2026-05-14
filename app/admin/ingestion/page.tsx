import { formatDate } from "@/lib/utils";

const supportedMethods = ["rss", "html", "api", "podcast_feed", "youtube_feed"];
const outputPaths = ["data/ingestion/latest/raw-items.json", "data/ingestion/latest/ingestion-run.json"];
const latestLocalSummary = {
  id: "phase4-local-latest",
  startedAt: "2026-05-13T09:00:00.000Z",
  status: "local-ready",
  selectedSources: 10,
  rawItems: 0,
  duplicates: 0,
  errors: 0
};

const sourceStatusPreview = [
  {
    label: "Eligible public sources",
    value: "active/trial only",
    detail: "Registry rows with public URLs and supported crawl methods."
  },
  {
    label: "Skipped sources",
    value: "manual/future",
    detail: "X accounts, WeChat-style entries, books, courses, and records missing public URLs."
  },
  {
    label: "Failure handling",
    value: "source-level",
    detail: "A failed source records its error and the remaining sources continue."
  }
];

export default function AdminIngestionPage() {
  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-3xl font-semibold text-radar-ink">Ingestion</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-radar-muted">
          Phase 4 adds a local public-source ingestion foundation. It selects safe
          sources from the cleaned registry, fetches public metadata or feed items,
          normalizes raw items, deduplicates within the run, and writes local JSON
          artifacts before any Supabase insertion work.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-radar-line bg-white p-5 shadow-soft">
          <p className="text-sm font-semibold text-radar-muted">Latest local summary</p>
          <h2 className="mt-3 text-xl font-semibold text-radar-ink">{latestLocalSummary.status}</h2>
          <p className="mt-2 text-sm text-radar-muted">{formatDate(latestLocalSummary.startedAt)}</p>
        </div>
        <div className="rounded-lg border border-radar-line bg-white p-5 shadow-soft">
          <p className="text-sm font-semibold text-radar-muted">Supported methods</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {supportedMethods.map((method) => (
              <span className="rounded-md border border-radar-line px-2 py-1 text-xs font-semibold text-radar-muted" key={method}>
                {method}
              </span>
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-radar-line bg-white p-5 shadow-soft">
          <p className="text-sm font-semibold text-radar-muted">DeepSeek boundary</p>
          <h2 className="mt-3 text-xl font-semibold text-radar-ink">Not called in Phase 4</h2>
          <p className="mt-2 text-sm text-radar-muted">Phase 5 adds the understanding layer.</p>
        </div>
      </section>

      <section className="rounded-lg border border-radar-line bg-white p-5 shadow-soft">
        <h2 className="text-lg font-semibold text-radar-ink">Local output artifacts</h2>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {outputPaths.map((outputPath) => (
            <div className="rounded-md border border-radar-line bg-radar-bg px-3 py-3" key={outputPath}>
              <p className="font-mono text-xs text-radar-ink">{outputPath}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-radar-line bg-white p-5 shadow-soft">
        <h2 className="text-lg font-semibold text-radar-ink">Phase 4 run shape</h2>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-radar-line text-radar-muted">
                <th className="py-3 pr-4 font-semibold">Run</th>
                <th className="py-3 pr-4 font-semibold">Started</th>
                <th className="py-3 pr-4 font-semibold">Status</th>
                <th className="py-3 pr-4 font-semibold">Sources</th>
                <th className="py-3 pr-4 font-semibold">Raw</th>
                <th className="py-3 pr-4 font-semibold">Duplicates</th>
                <th className="py-3 pr-4 font-semibold">Errors</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-radar-line last:border-0">
                <td className="py-3 pr-4 font-medium text-radar-ink">{latestLocalSummary.id}</td>
                <td className="py-3 pr-4 text-radar-muted">{formatDate(latestLocalSummary.startedAt)}</td>
                <td className="py-3 pr-4 text-radar-muted">{latestLocalSummary.status}</td>
                <td className="py-3 pr-4 text-radar-muted">{latestLocalSummary.selectedSources}</td>
                <td className="py-3 pr-4 text-radar-muted">{latestLocalSummary.rawItems}</td>
                <td className="py-3 pr-4 text-radar-muted">{latestLocalSummary.duplicates}</td>
                <td className="py-3 pr-4 text-radar-muted">{latestLocalSummary.errors}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border border-radar-line bg-white p-5 shadow-soft">
        <h2 className="text-lg font-semibold text-radar-ink">Source handling</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {sourceStatusPreview.map((item) => (
            <div className="rounded-md border border-radar-line p-4" key={item.label}>
              <p className="text-sm font-semibold text-radar-ink">{item.label}</p>
              <p className="mt-2 text-sm font-medium text-radar-muted">{item.value}</p>
              <p className="mt-2 text-sm leading-6 text-radar-muted">{item.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-radar-line bg-white p-5 shadow-soft">
        <h2 className="text-lg font-semibold text-radar-ink">Next step</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-radar-muted">
          Phase 5 will read the collected raw items, run the DeepSeek understanding
          layer, and prepare scored radar items for Supabase-backed review.
        </p>
      </section>
    </div>
  );
}
