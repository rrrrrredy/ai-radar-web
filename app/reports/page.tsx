import { EmptyState } from "@/components/empty-state";
import { mockReports } from "@/lib/radar/mock-data";

export default function ReportsPage() {
  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-3xl font-semibold text-radar-ink">Reports</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-radar-muted">
          Daily and weekly reports will use ranked radar evidence, source citations,
          and DeepSeek V4 Pro synthesis in a later phase. No model calls are made here.
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {mockReports.map((report) => (
          <article className="rounded-lg border border-radar-line bg-white p-5 shadow-soft" key={report.id}>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-md bg-radar-panel px-2 py-1 text-xs font-medium text-radar-muted">
                {report.type}
              </span>
              <span className="rounded-md bg-radar-panel px-2 py-1 text-xs font-medium text-radar-muted">
                {report.language}
              </span>
              <span className="rounded-md bg-radar-panel px-2 py-1 text-xs font-medium text-radar-muted">
                {report.status}
              </span>
            </div>
            <h2 className="mt-4 text-xl font-semibold text-radar-ink">{report.title}</h2>
            <p className="mt-3 text-sm leading-6 text-radar-muted">{report.body}</p>
          </article>
        ))}
      </section>

      <EmptyState
        description="Report generation scope: retrieve evidence, rank event clusters, generate bilingual synthesis, cite sources, and preserve uncertainty notes."
        title="Report generation is intentionally disabled in Phase 2"
      />
    </div>
  );
}
