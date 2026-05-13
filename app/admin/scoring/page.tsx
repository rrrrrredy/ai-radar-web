const dimensions = [
  {
    name: "Credibility",
    weight: "35%",
    description: "Source quality, attribution clarity, and primary-source strength."
  },
  {
    name: "Novelty",
    weight: "25%",
    description: "Whether the item adds information instead of repeating summaries."
  },
  {
    name: "Importance",
    weight: "40%",
    description: "Expected impact for AI practitioners, products, research, and markets."
  },
  {
    name: "Velocity",
    weight: "watch metric",
    description: "Independent confirmations and meaningful follow-up over time."
  },
  {
    name: "Writing value",
    weight: "watch metric",
    description: "Usefulness for daily/weekly reports and article angles."
  }
];

const negativeRules = [
  "Downgrade unsourced reposts and title-only summaries.",
  "Do not reward duplicate summaries unless they add independent evidence.",
  "Keep rumor or leak sources low weight and clearly labeled.",
  "Separate facts from inference and speculation in generated outputs."
];

export default function AdminScoringPage() {
  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-3xl font-semibold text-radar-ink">Scoring</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-radar-muted">
          Phase 2 uses static scoring dimensions. Future scoring changes should be
          versioned and auditable instead of silently rewriting history.
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
        <div className="rounded-lg border border-radar-line bg-white p-5 shadow-soft">
          <h2 className="text-lg font-semibold text-radar-ink">Score dimensions</h2>
          <div className="mt-5 space-y-4">
            {dimensions.map((dimension) => (
              <div className="border-b border-radar-line pb-4 last:border-0 last:pb-0" key={dimension.name}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold text-radar-ink">{dimension.name}</h3>
                  <span className="text-sm font-medium text-radar-muted">{dimension.weight}</span>
                </div>
                <p className="mt-2 text-sm leading-6 text-radar-muted">{dimension.description}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-radar-line bg-radar-panel p-5">
          <h2 className="text-lg font-semibold text-radar-ink">Negative rules</h2>
          <ul className="mt-5 space-y-3 text-sm leading-6 text-radar-muted">
            {negativeRules.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
