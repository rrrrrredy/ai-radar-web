import Link from "next/link";

import { DataSourceChip } from "@/components/data-source-chip";
import { EvidenceBadge } from "@/components/evidence-badge";
import { StatusChip } from "@/components/status-chip";
import { mockEntities, mockRadarItems, mockSources } from "@/lib/radar/mock-data";
import { calculateCompositeScore, getSignalLabel, sortRadarItems } from "@/lib/radar/scoring";
import type { ConfidenceLevel, RadarItemStatus } from "@/lib/radar/types";

const workflowSteps = [
  {
    label: "01",
    title: "Source registry",
    body: "Cleaned public sources carry tiers, risk flags, crawl methods, and review notes before ingestion.",
    status: "Public sources",
    tone: "evidence"
  },
  {
    label: "02",
    title: "Ingestion",
    body: "Local runners collect limited public metadata and raw items into ignored local artifacts.",
    status: "Local runner",
    tone: "freshness"
  },
  {
    label: "03",
    title: "Understanding",
    body: "Mock mode is deterministic by default. Live DeepSeek requires an explicit opt-in path.",
    status: "Mock default",
    tone: "caution"
  },
  {
    label: "04",
    title: "Supabase retrieval",
    body: "Ask and Write can read the public-safe Supabase view when enabled, then fall back to local and mock data.",
    status: "Read-only path",
    tone: "success"
  },
  {
    label: "05",
    title: "Ask / Write",
    body: "Responses are bound to retrieved radar items, visible citations, caveats, and missing evidence.",
    status: "Cites sources",
    tone: "evidence"
  }
] as const;

const operations = [
  {
    label: "Supabase writes",
    value: "gated",
    tone: "risk",
    detail: "Write scripts require --write and ENABLE_SUPABASE_WRITES=true."
  },
  {
    label: "Live DeepSeek",
    value: "opt-in",
    tone: "caution",
    detail: "Validation and default app flows stay mock/local."
  },
  {
    label: "Scheduled jobs",
    value: "not enabled",
    tone: "admin",
    detail: "Ingestion and persistence remain manual or dry-run-first."
  },
  {
    label: "Generated data",
    value: "ignored",
    tone: "neutral",
    detail: "Local ingestion and understanding outputs are not committed."
  }
] as const;

const statusToneByStatus: Record<RadarItemStatus, "neutral" | "evidence" | "caution" | "success"> = {
  archived: "neutral",
  draft: "caution",
  published: "success",
  reviewed: "evidence"
};

const confidenceToneByLevel: Record<ConfidenceLevel, "caution" | "risk" | "success"> = {
  high: "success",
  low: "risk",
  medium: "caution"
};

export default function HomePage() {
  const rankedItems = sortRadarItems(mockRadarItems);
  const trackingLanes = [
    {
      label: "Models",
      value: mockEntities.find((entity) => entity.type === "model")?.name ?? "Awaiting evidence"
    },
    {
      label: "Products",
      value: mockEntities.find((entity) => entity.type === "product")?.name ?? "Awaiting evidence"
    },
    {
      label: "Companies",
      value: mockEntities.find((entity) => entity.type === "company")?.name ?? "Awaiting evidence"
    },
    {
      label: "Papers / people",
      value: "Supported entity types; no reviewed sample on the homepage yet"
    }
  ];

  return (
    <div className="space-y-12">
      <section className="grid gap-8 border-b border-radar-line pb-10 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          <h1 className="max-w-4xl text-4xl font-semibold leading-tight tracking-normal text-radar-ink sm:text-5xl">
            AI Industry Radar
          </h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-radar-muted">
            Evidence-first AI industry intelligence for answering what changed,
            which events are real hotspots, and which entities deserve attention.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              className="rounded-md bg-radar-ink px-4 py-2 text-sm font-semibold text-white hover:bg-black"
              href="/radar"
            >
              Open radar
            </Link>
            <Link
              className="rounded-md border border-radar-line px-4 py-2 text-sm font-semibold text-radar-ink hover:border-radar-evidence hover:text-radar-evidence"
              href="/ask"
            >
              Ask with evidence
            </Link>
          </div>
          <dl className="mt-8 grid gap-3 sm:grid-cols-3">
            <QuestionBlock
              label="Today"
              value="What changed in AI, and how fresh is the evidence?"
            />
            <QuestionBlock
              label="Hotspots"
              value="Which signals have enough source quality to track?"
            />
            <QuestionBlock
              label="Entities"
              value="Which models, products, companies, papers, and people matter now?"
            />
          </dl>
        </div>

        <aside
          aria-label="Product contract and data status"
          className="border-l border-radar-line pl-6 max-lg:border-l-0 max-lg:border-t max-lg:pl-0 max-lg:pt-6"
        >
          <h2 className="text-sm font-semibold uppercase tracking-normal text-radar-muted">
            Product contract
          </h2>
          <div className="mt-4 flex flex-wrap gap-2">
            <DataSourceChip
              ariaLabel="Homepage preview data source is mock data"
              detail="home preview"
              source="mock_data"
            />
            <StatusChip label="Public information only" tone="evidence" />
            <EvidenceBadge detail="timestamps shown" kind="freshness" label="Freshness" />
            <EvidenceBadge detail="visible caveats" kind="uncertainty" label="Uncertainty" />
            <StatusChip label="Live DeepSeek" tone="caution" value="opt-in" />
            <StatusChip label="Writes / jobs" tone="risk" value="gated" />
          </div>
          <p className="mt-5 text-sm leading-6 text-radar-muted">
            The homepage preview is synthetic. Ask and Write disclose their route-level
            data source: Supabase public retrieval when enabled, local understanding
            output when present, or mock fallback when neither is available.
          </p>
        </aside>
      </section>

      <section className="space-y-4">
        <div className="max-w-3xl">
          <h2 className="text-2xl font-semibold text-radar-ink">Intelligence workflow</h2>
          <p className="mt-2 text-sm leading-6 text-radar-muted">
            The current product path is registry to ingestion to understanding to
            retrieval-backed Ask and Write. It does not claim autonomous production
            monitoring or ungated writes.
          </p>
        </div>
        <ol className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {workflowSteps.map((step) => (
            <li
              className="rounded-lg border border-radar-line bg-white p-4 shadow-soft"
              key={step.title}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-xs font-semibold text-radar-muted">
                  {step.label}
                </span>
                <StatusChip label={step.status} tone={step.tone} />
              </div>
              <h3 className="mt-4 text-base font-semibold text-radar-ink">{step.title}</h3>
              <p className="mt-2 text-sm leading-6 text-radar-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold text-radar-ink">Today / Radar preview</h2>
              <p className="mt-2 text-sm leading-6 text-radar-muted">
                Synthetic rows show how a desk item keeps source, freshness, status,
                confidence, and citation hints beside the summary.
              </p>
            </div>
            <Link className="text-sm font-semibold text-radar-evidence" href="/radar">
              Open full radar
            </Link>
          </div>

          <div className="divide-y divide-radar-line rounded-lg border border-radar-line bg-white">
            {rankedItems.map((item) => {
              const source = mockSources.find((candidate) => candidate.id === item.sourceId);
              const compositeScore = calculateCompositeScore(item);

              return (
                <article
                  className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_260px]"
                  key={item.id}
                >
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <StatusChip
                        label={getSignalLabel(compositeScore)}
                        tone="evidence"
                        value={`${Math.round(compositeScore * 100)}%`}
                      />
                      <StatusChip label={item.category} tone="neutral" />
                    </div>
                    <h3 className="mt-4 text-lg font-semibold leading-7 text-radar-ink">
                      {item.title}
                    </h3>
                    <p className="mt-3 text-sm leading-6 text-radar-muted">{item.summaryEn}</p>
                    <p className="mt-2 text-sm leading-6 text-radar-muted">{item.summaryZh}</p>
                    {getReviewCaveat(item.status, item.confidence) ? (
                      <p className="mt-3 text-sm font-medium text-radar-caution">
                        {getReviewCaveat(item.status, item.confidence)}
                      </p>
                    ) : null}
                  </div>

                  <aside
                    aria-label={`Evidence metadata for ${item.title}`}
                    className="space-y-3 rounded-md bg-radar-panel p-4"
                  >
                    <div className="flex flex-wrap gap-2">
                      <EvidenceBadge
                        detail={source?.name ?? "Unknown source"}
                        kind="citation"
                        label="Source"
                      />
                      <EvidenceBadge
                        detail={formatUtcDate(item.updatedAt)}
                        kind="freshness"
                        label="Updated"
                      />
                      <StatusChip
                        label={`Status: ${item.status}`}
                        tone={statusToneByStatus[item.status]}
                      />
                      <StatusChip
                        label={`Confidence: ${item.confidence}`}
                        tone={confidenceToneByLevel[item.confidence]}
                      />
                    </div>
                    <p className="text-xs leading-5 text-radar-muted">
                      Time window: {formatUtcDate(item.createdAt)} to{" "}
                      {formatUtcDate(item.updatedAt)}.
                    </p>
                    <p className="text-xs leading-5 text-radar-muted">
                      Evidence hint: {source ? `tier ${source.tier} ${source.type}` : "source missing"}.
                      {source?.lastCheckedAt ? ` Checked ${formatUtcDate(source.lastCheckedAt)}.` : ""}
                    </p>
                    {source?.url ? (
                      <a
                        className="text-xs font-semibold text-radar-evidence hover:text-radar-ink"
                        href={source.url}
                        rel="noreferrer"
                        target="_blank"
                      >
                        View source citation
                      </a>
                    ) : null}
                  </aside>
                </article>
              );
            })}
          </div>
        </div>

        <aside className="space-y-4">
          <div>
            <h2 className="text-2xl font-semibold text-radar-ink">Tracking lens</h2>
            <p className="mt-2 text-sm leading-6 text-radar-muted">
              Entity tracking keeps models, products, companies, papers, and people
              visible as evidence accumulates.
            </p>
          </div>
          <div className="space-y-3">
            {trackingLanes.map((lane) => (
              <div className="rounded-lg border border-radar-line bg-white p-4" key={lane.label}>
                <p className="text-xs font-semibold uppercase tracking-normal text-radar-muted">
                  {lane.label}
                </p>
                <p className="mt-2 text-sm font-semibold leading-6 text-radar-ink">{lane.value}</p>
              </div>
            ))}
          </div>
          <Link
            className="inline-flex rounded-md border border-radar-line px-4 py-2 text-sm font-semibold text-radar-ink hover:border-radar-evidence hover:text-radar-evidence"
            href="/entities"
          >
            Open entities
          </Link>
        </aside>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <EntryPoint
          badges={
            <>
              <DataSourceChip detail="Supabase/local/mock" source="mock_data" />
              <EvidenceBadge detail="returned with answer" kind="citation" label="Citations" />
            </>
          }
          body="Ask questions against retrieved radar items. The response anatomy keeps time window, facts, inference, uncertainty, and citations visible."
          href="/ask"
          linkLabel="Ask Radar"
          title="Ask Radar"
        />
        <EntryPoint
          badges={
            <>
              <EvidenceBadge detail="topic seeds" kind="evidence" label="Evidence" />
              <EvidenceBadge detail="counterpoints shown" kind="uncertainty" label="Caveats" />
            </>
          }
          body="Generate topic candidates and industry-observation seeds from retrieved evidence, with caveats and missing evidence called out."
          href="/write"
          linkLabel="Open Write"
          title="Write"
        />
      </section>

      <section className="rounded-lg border border-radar-line bg-radar-panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-2xl">
            <h2 className="text-xl font-semibold text-radar-ink">Admin / operations boundary</h2>
            <p className="mt-2 text-sm leading-6 text-radar-muted">
              Operational controls stay explicit: dry-run-first writes, feature-gated
              Supabase persistence, opt-in live model calls, and scheduled dry-runs only.
            </p>
          </div>
          <Link
            className="rounded-md border border-radar-admin/30 px-4 py-2 text-sm font-semibold text-radar-admin hover:bg-white"
            href="/admin"
          >
            Open Admin
          </Link>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {operations.map((operation) => (
            <div className="rounded-md border border-radar-line bg-white p-4" key={operation.label}>
              <StatusChip
                label={operation.label}
                tone={operation.tone}
                value={operation.value}
              />
              <p className="mt-3 text-sm leading-6 text-radar-muted">{operation.detail}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function QuestionBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-l border-radar-line pl-4">
      <dt className="text-xs font-semibold uppercase tracking-normal text-radar-muted">{label}</dt>
      <dd className="mt-2 text-sm leading-6 text-radar-ink">{value}</dd>
    </div>
  );
}

function EntryPoint({
  badges,
  body,
  href,
  linkLabel,
  title
}: {
  badges: React.ReactNode;
  body: string;
  href: string;
  linkLabel: string;
  title: string;
}) {
  return (
    <article className="rounded-lg border border-radar-line bg-white p-5 shadow-soft">
      <div className="flex flex-wrap gap-2">{badges}</div>
      <h2 className="mt-4 text-xl font-semibold text-radar-ink">{title}</h2>
      <p className="mt-3 text-sm leading-6 text-radar-muted">{body}</p>
      <Link
        className="mt-5 inline-flex rounded-md bg-radar-ink px-4 py-2 text-sm font-semibold text-white hover:bg-black"
        href={href}
      >
        {linkLabel}
      </Link>
    </article>
  );
}

function formatUtcDate(value: string) {
  return `${new Intl.DateTimeFormat("en", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    timeZone: "UTC",
    year: "numeric"
  }).format(new Date(value))} UTC`;
}

function getReviewCaveat(status: RadarItemStatus, confidence: ConfidenceLevel) {
  if (status === "draft") {
    return "Needs review before it should be treated as confirmed.";
  }

  if (confidence === "low") {
    return "Low confidence: keep this as a watch item until stronger evidence appears.";
  }

  return "";
}
