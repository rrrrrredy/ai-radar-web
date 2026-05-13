import { formatDate } from "@/lib/utils";
import { mockIngestionRuns } from "@/lib/radar/mock-data";

export default function AdminIngestionPage() {
  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-3xl font-semibold text-radar-ink">Ingestion</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-radar-muted">
          Scheduled jobs will run through GitHub Actions or Vercel Cron in later
          phases. Runs should be idempotent, retry-safe, and logged here.
        </p>
      </section>

      <section className="rounded-lg border border-radar-line bg-white p-5 shadow-soft">
        <h2 className="text-lg font-semibold text-radar-ink">Demo ingestion runs</h2>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-radar-line text-radar-muted">
                <th className="py-3 pr-4 font-semibold">Run</th>
                <th className="py-3 pr-4 font-semibold">Started</th>
                <th className="py-3 pr-4 font-semibold">Status</th>
                <th className="py-3 pr-4 font-semibold">Trigger</th>
                <th className="py-3 pr-4 font-semibold">Sources</th>
                <th className="py-3 pr-4 font-semibold">Raw</th>
                <th className="py-3 pr-4 font-semibold">Radar</th>
                <th className="py-3 pr-4 font-semibold">Errors</th>
              </tr>
            </thead>
            <tbody>
              {mockIngestionRuns.map((run) => (
                <tr className="border-b border-radar-line last:border-0" key={run.id}>
                  <td className="py-3 pr-4 font-medium text-radar-ink">{run.id}</td>
                  <td className="py-3 pr-4 text-radar-muted">{formatDate(run.startedAt)}</td>
                  <td className="py-3 pr-4 text-radar-muted">{run.status}</td>
                  <td className="py-3 pr-4 text-radar-muted">{run.trigger}</td>
                  <td className="py-3 pr-4 text-radar-muted">{run.sourceCount}</td>
                  <td className="py-3 pr-4 text-radar-muted">{run.rawItemCount}</td>
                  <td className="py-3 pr-4 text-radar-muted">{run.radarItemCount}</td>
                  <td className="py-3 pr-4 text-radar-muted">{run.errorCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
