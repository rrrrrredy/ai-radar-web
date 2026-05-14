const dimensions = [
  {
    name: "AI relevance",
    weight: "30%",
    description: "Phase 5 relevance score from validated model output or deterministic mock rules."
  },
  {
    name: "Importance",
    weight: "20%",
    description: "Expected impact for AI practitioners, products, research, and markets."
  },
  {
    name: "Credibility",
    weight: "20%",
    description: "Source quality, attribution clarity, and primary-source strength."
  },
  {
    name: "Novelty",
    weight: "15%",
    description: "Whether the item adds information instead of repeating summaries."
  },
  {
    name: "Freshness",
    weight: "10%",
    description: "Recency based on published time, or collected time when publication time is missing."
  },
  {
    name: "Source weight",
    weight: "5%",
    description: "Registry trust weight from the cleaned public source system."
  }
];

const negativeRules = [
  "Exclude items below 0.35 AI relevance.",
  "Send items from 0.35 to 0.60 relevance to review.",
  "Send low-credibility sources to review even when relevance is high.",
  "Downgrade unsourced reposts and title-only summaries.",
  "Do not reward duplicate summaries unless they add independent evidence.",
  "Keep rumor or leak sources low weight and clearly labeled.",
  "Validate model JSON before writing radar items."
];

const formula =
  "overall = relevance*0.30 + importance*0.20 + credibility*0.20 + novelty*0.15 + freshness*0.10 + source_weight*0.05";

export default function AdminScoringPage() {
  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-3xl font-semibold text-radar-ink">Scoring</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-radar-muted">
          Phase 5 turns raw ingestion items into scored radar items. DeepSeek can
          provide classification, summaries, entities, and scoring rationale, but
          deterministic thresholds and the formula below control inclusion.
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

      <section className="rounded-lg border border-radar-line bg-white p-5 shadow-soft">
        <h2 className="text-lg font-semibold text-radar-ink">Phase 5 formula</h2>
        <p className="mt-3 font-mono text-xs leading-6 text-radar-ink">{formula}</p>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-radar-muted">
          Mock mode uses deterministic heuristics for validation and builds. Live
          mode requires an explicit CLI flag and a local DeepSeek key. Invalid
          model output falls back or records a failed understanding item instead
          of silently publishing.
        </p>
      </section>
    </div>
  );
}
