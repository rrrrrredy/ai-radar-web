import { formatPercent } from "@/lib/utils";
import { mockEventClusters, mockRadarItems } from "@/lib/radar/mock-data";

export default function ClustersPage() {
  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-3xl font-semibold text-radar-ink">Event clusters</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-radar-muted">
          Clusters represent real-world events and evidence trails, not article-title
          matches. A single event can include an official announcement, analysis,
          repository movement, and follow-up clarification.
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {mockEventClusters.map((cluster) => (
          <article className="rounded-lg border border-radar-line bg-white p-5 shadow-soft" key={cluster.id}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-radar-panel px-2 py-1 text-xs font-medium text-radar-muted">
                {cluster.confidence} confidence
              </span>
              <span className="rounded-md bg-radar-panel px-2 py-1 text-xs font-medium text-radar-muted">
                {formatPercent(cluster.importanceScore)} importance
              </span>
            </div>
            <h2 className="mt-4 text-xl font-semibold text-radar-ink">{cluster.titleEn}</h2>
            <p className="mt-2 text-sm font-medium text-radar-muted">{cluster.titleZh}</p>
            <p className="mt-4 text-sm leading-6 text-radar-muted">{cluster.summaryEn}</p>
            <p className="mt-3 text-sm leading-6 text-radar-muted">{cluster.summaryZh}</p>
            <div className="mt-5">
              <h3 className="text-sm font-semibold text-radar-ink">Representative items</h3>
              <ul className="mt-2 space-y-2 text-sm text-radar-muted">
                {cluster.radarItemIds.map((itemId) => {
                  const item = mockRadarItems.find((candidate) => candidate.id === itemId);
                  return <li key={itemId}>{item?.title || itemId}</li>;
                })}
              </ul>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
