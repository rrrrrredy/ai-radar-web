import { EmptyState } from "@/components/empty-state";
import { mockReports } from "@/lib/radar/mock-data";

export default function ReportsPage() {
  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-3xl font-semibold text-radar-ink">Reports</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-radar-muted">
          Reports will build on the same retrieval and writing assistant foundation
          now used by Ask and Write. Phase 6 provides evidence-backed Q&A and writing
          seeds; full daily and weekly report generation remains future work.
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
        description="Current report scope: use retrieved radar-item evidence to seed topics and outlines. Later phases will add daily and weekly synthesis, report persistence, review workflow, and publication controls."
        title="Full report generation is intentionally deferred"
      />
    </div>
  );
}
