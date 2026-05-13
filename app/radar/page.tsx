import { RadarCard } from "@/components/radar-card";
import { filterOptions } from "@/lib/radar/filters";
import { mockRadarItems, mockSources } from "@/lib/radar/mock-data";
import { sortRadarItems } from "@/lib/radar/scoring";

export default function RadarPage() {
  const items = sortRadarItems(mockRadarItems);

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-3xl font-semibold text-radar-ink">Radar</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-radar-muted">
          Phase 2 shows static filter controls and synthetic radar items. Real
          filtering, retrieval, and source freshness checks come after ingestion.
        </p>
      </section>

      <section className="rounded-lg border border-radar-line bg-radar-panel p-5">
        <div className="grid gap-4 md:grid-cols-5">
          {Object.entries(filterOptions).map(([key, values]) => (
            <label className="block" key={key}>
              <span className="text-xs font-semibold uppercase tracking-wide text-radar-muted">
                {key.replace(/([A-Z])/g, " $1")}
              </span>
              <select className="mt-2 w-full rounded-md border border-radar-line bg-white px-3 py-2 text-sm text-radar-ink">
                {values.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {items.map((item) => (
          <RadarCard
            item={item}
            key={item.id}
            source={mockSources.find((source) => source.id === item.sourceId)}
          />
        ))}
      </section>
    </div>
  );
}
