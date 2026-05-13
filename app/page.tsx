import Link from "next/link";

import { MetricCard } from "@/components/metric-card";
import { RadarCard } from "@/components/radar-card";
import { mockRadarItems, mockSources } from "@/lib/radar/mock-data";
import { sortRadarItems } from "@/lib/radar/scoring";

const cards = [
  {
    title: "What happened today",
    body: "Daily AI events will be organized by source quality, timestamp, and evidence trail."
  },
  {
    title: "True hotspots",
    body: "Ranking separates primary signals from repeated summaries and title-driven noise."
  },
  {
    title: "Models, products, companies",
    body: "Entity tracking links models, products, companies, people, papers, and projects."
  },
  {
    title: "Daily and weekly reports",
    body: "Reports will synthesize ranked evidence with bilingual summaries and uncertainty notes."
  }
];

export default function HomePage() {
  const rankedItems = sortRadarItems(mockRadarItems);

  return (
    <div className="space-y-10">
      <section className="grid gap-8 rounded-xl border border-radar-line bg-radar-panel p-6 shadow-soft lg:grid-cols-[1.15fr_0.85fr] lg:p-8">
        <div>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-normal text-radar-ink sm:text-5xl">
            AI Industry Radar
          </h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-radar-muted">
            A bilingual AI industry radar for answering what happened in AI today,
            which events are real hotspots, and which entities are worth tracking.
          </p>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-radar-muted">
            Public information only. Demo data on this Phase 2 skeleton is synthetic
            and does not claim to describe current real-world events.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              className="rounded-md bg-radar-ink px-4 py-2 text-sm font-semibold text-white hover:bg-black"
              href="/radar"
            >
              View radar
            </Link>
            <Link
              className="rounded-md border border-radar-line px-4 py-2 text-sm font-semibold text-radar-ink hover:border-radar-cyan hover:text-radar-cyan"
              href="/admin"
            >
              Admin skeleton
            </Link>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <MetricCard
            detail="Synthetic items ranked by credibility, novelty, and importance."
            label="Today"
            value="3 demo items"
          />
          <MetricCard
            detail="No private sources, credentials, or internal links are stored."
            label="Boundary"
            value="Public only"
          />
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div className="rounded-lg border border-radar-line bg-white p-5 shadow-soft" key={card.title}>
            <h2 className="text-base font-semibold text-radar-ink">{card.title}</h2>
            <p className="mt-3 text-sm leading-6 text-radar-muted">{card.body}</p>
          </div>
        ))}
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-radar-ink">Mock radar preview</h2>
            <p className="mt-2 text-sm text-radar-muted">
              These synthetic examples exercise the future ranking and bilingual display model.
            </p>
          </div>
          <Link className="text-sm font-semibold text-radar-cyan" href="/radar">
            Open full radar
          </Link>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {rankedItems.map((item) => (
            <RadarCard
              item={item}
              key={item.id}
              source={mockSources.find((source) => source.id === item.sourceId)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
