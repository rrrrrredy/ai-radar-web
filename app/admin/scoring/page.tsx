import { AdminDataTable, type AdminDataTableColumn } from "@/components/admin-data-table";
import { AdminStatusCard } from "@/components/admin-status-card";
import { EvidenceBadge } from "@/components/evidence-badge";
import { StatusChip, type StatusTone } from "@/components/status-chip";
import { mockRadarItems, mockSources } from "@/lib/radar/mock-data";
import type { RadarItem } from "@/lib/radar/types";

const dimensions = [
  {
    key: "relevance",
    name: "Relevance",
    weight: "30%",
    description: "AI relevance score from validated model output or deterministic mock rules."
  },
  {
    key: "importance",
    name: "Importance",
    weight: "20%",
    description: "Expected impact for AI practitioners, products, research, and markets."
  },
  {
    key: "credibility",
    name: "Credibility",
    weight: "20%",
    description: "Source quality, attribution clarity, and primary-source strength."
  },
  {
    key: "novelty",
    name: "Novelty",
    weight: "15%",
    description: "Whether the item adds information instead of repeating summaries."
  },
  {
    key: "freshness",
    name: "Freshness",
    weight: "10%",
    description: "Recency based on published time, or collected time when publication time is missing."
  },
  {
    key: "source_weight",
    name: "Source weight",
    weight: "5%",
    description: "Registry trust weight from the cleaned public source system."
  }
];

const thresholds = [
  {
    range: "relevance < 0.35",
    outcome: "excluded",
    tone: "risk" as const,
    rationale: "Low AI relevance is excluded before ranking or writing surfaces can treat it as signal."
  },
  {
    range: "0.35 <= relevance < 0.60",
    outcome: "needs_review",
    tone: "caution" as const,
    rationale: "Middle relevance requires analyst review and must not look confirmed."
  },
  {
    range: "relevance >= 0.60 + credibility not low",
    outcome: "included",
    tone: "success" as const,
    rationale: "Higher relevance can be included only when credibility is not low."
  },
  {
    range: "relevance >= 0.60 + low credibility",
    outcome: "needs_review",
    tone: "caution" as const,
    rationale: "A model cannot override weak evidence, low-quality sources, or unclear attribution."
  }
];

const formula =
  "overall = relevance*0.30 + importance*0.20 + credibility*0.20 + novelty*0.15 + freshness*0.10 + source_weight*0.05";

export default function AdminScoringPage() {
  const sourceById = new Map(mockSources.map((source) => [source.id, source]));
  const scoreVisibilityRows = mockRadarItems.map((item) => ({
    item,
    sourceWeight: sourceById.get(item.sourceId)?.weight ?? 0
  }));

  return (
    <div className="space-y-8">
      <section>
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip label="Formula controlled" tone="evidence" />
          <StatusChip label="Model output is helper" tone="caution" />
          <StatusChip label="needs_review is caution" tone="caution" />
        </div>
        <h1 className="mt-4 text-3xl font-semibold text-radar-ink">
          Scoring
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-radar-muted">
          Understanding output is validated and scored, but the model is not the
          final authority. Code thresholds, source credibility, and review states
          control inclusion before retrieval, Q&A, or writing surfaces use items.
        </p>
      </section>

      <section
        aria-label="Scoring overview"
        className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
      >
        <AdminStatusCard
          detail="Weighted sum of six explicit dimensions. No hidden model-only final score."
          label="Formula"
          tone="evidence"
          value="6 inputs"
        />
        <AdminStatusCard
          detail="Middle relevance and low-credibility items remain analyst review work."
          label="Review band"
          tone="caution"
          value="0.35-0.60"
        />
        <AdminStatusCard
          detail="Low relevance is excluded before inclusion or writing suggestions."
          label="Exclude"
          tone="risk"
          value="< 0.35"
        />
        <AdminStatusCard
          detail="Inclusion still requires credibility that is not low."
          label="Include"
          tone="success"
          value=">= 0.60"
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
        <div className="rounded-lg border border-radar-line bg-white p-4 shadow-soft">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-radar-ink">
                Score formula
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-radar-muted">
                Every input is bounded and validated before writing local
                understanding output or planning persistence.
              </p>
            </div>
            <EvidenceBadge detail="weighted" kind="evidence" label="Overall" />
          </div>
          <pre className="mt-4 overflow-x-auto rounded-md border border-radar-line bg-radar-panel px-3 py-3">
            <code className="whitespace-pre text-xs leading-6 text-radar-code">
              {formula}
            </code>
          </pre>
          <div className="mt-4">
            <AdminDataTable
              ariaLabel="Score dimensions and weights"
              columns={dimensionColumns}
              minWidth="760px"
              rowKey={(dimension) => dimension.key}
              rows={dimensions}
            />
          </div>
        </div>

        <div className="rounded-lg border border-radar-line bg-radar-panel p-4">
          <h2 className="text-lg font-semibold text-radar-ink">
            Inclusion thresholds
          </h2>
          <p className="mt-2 text-sm leading-6 text-radar-muted">
            Thresholds are intentionally conservative so weak evidence and
            uncertain model output do not look production-confirmed.
          </p>
          <div className="mt-4">
            <AdminDataTable
              ariaLabel="Scoring inclusion thresholds"
              columns={thresholdColumns}
              minWidth="720px"
              rowKey={(row) => row.range}
              rows={thresholds}
            />
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-radar-line bg-white p-4 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-radar-ink">
              Source weight versus confidence
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-radar-muted">
              Source weight is a numeric registry input. Confidence is an
              evidence/review cue. They are shown separately so a trusted source
              cannot visually erase uncertainty.
            </p>
          </div>
          <StatusChip label="Distinct signals" tone="admin" />
        </div>
        <div className="mt-4">
          <AdminDataTable
            ariaLabel="Score visibility sample rows"
            columns={scoreVisibilityColumns}
            minWidth="920px"
            rowKey={(row) => row.item.id}
            rows={scoreVisibilityRows}
          />
        </div>
      </section>

      <section className="rounded-lg border border-radar-line bg-radar-panel p-4">
        <h2 className="text-lg font-semibold text-radar-ink">
          Authority boundary
        </h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <BoundaryItem
            detail="DeepSeek can classify, summarize, extract entities, and suggest scores only when explicit live mode is requested."
            label="Model helper"
            tone="caution"
          />
          <BoundaryItem
            detail="Validation, formula weights, thresholds, and source-weighted rules decide inclusion."
            label="Code authority"
            tone="evidence"
          />
          <BoundaryItem
            detail="needs_review evidence must remain visually cautious in retrieval, Q&A, writing, and reports."
            label="Review state"
            tone="caution"
          />
        </div>
      </section>
    </div>
  );
}

type Dimension = (typeof dimensions)[number];
type Threshold = (typeof thresholds)[number];
type ScoreVisibilityRow = {
  item: RadarItem;
  sourceWeight: number;
};

const dimensionColumns: AdminDataTableColumn<Dimension>[] = [
  {
    header: "Input",
    render: (dimension) => (
      <EvidenceBadge
        detail={dimension.weight}
        kind={dimension.key === "source_weight" ? "citation" : "evidence"}
        label={dimension.name}
      />
    )
  },
  {
    header: "Audit note",
    render: (dimension) => (
      <p className="max-w-2xl text-sm leading-6 text-radar-muted">
        {dimension.description}
      </p>
    )
  }
];

const thresholdColumns: AdminDataTableColumn<Threshold>[] = [
  {
    header: "Rule",
    render: (row) => <p className="font-mono text-xs text-radar-code">{row.range}</p>
  },
  {
    header: "Outcome",
    render: (row) => <StatusChip label={row.outcome} tone={row.tone} />
  },
  {
    header: "Reason",
    render: (row) => (
      <p className="max-w-xl text-sm leading-6 text-radar-muted">
        {row.rationale}
      </p>
    )
  }
];

const scoreVisibilityColumns: AdminDataTableColumn<ScoreVisibilityRow>[] = [
  {
    header: "Item",
    render: (row) => (
      <div>
        <p className="font-semibold text-radar-ink">{row.item.title}</p>
        <p className="mt-1 text-xs text-radar-muted">{row.item.category}</p>
      </div>
    )
  },
  {
    header: "Source weight",
    render: (row) => (
      <EvidenceBadge
        detail={row.sourceWeight.toFixed(2)}
        kind="citation"
        label="source_weight"
      />
    )
  },
  {
    header: "Confidence",
    render: (row) => (
      <StatusChip
        label={row.item.confidence}
        tone={confidenceTone(row.item.confidence)}
      />
    )
  },
  {
    header: "Credibility",
    render: (row) => (
      <EvidenceBadge
        detail={row.item.credibilityScore.toFixed(2)}
        kind="evidence"
        label="credibility"
      />
    )
  },
  {
    header: "Status",
    render: (row) => (
      <StatusChip
        label={row.item.status}
        tone={row.item.status === "published" ? "success" : "admin"}
      />
    )
  }
];

function confidenceTone(confidence: RadarItem["confidence"]): StatusTone {
  if (confidence === "high") {
    return "success";
  }

  if (confidence === "medium") {
    return "caution";
  }

  return "risk";
}

function BoundaryItem({
  detail,
  label,
  tone
}: {
  detail: string;
  label: string;
  tone: StatusTone;
}) {
  return (
    <div className="rounded-md border border-radar-line bg-white p-3">
      <StatusChip label={label} tone={tone} />
      <p className="mt-3 text-sm leading-6 text-radar-muted">{detail}</p>
    </div>
  );
}
