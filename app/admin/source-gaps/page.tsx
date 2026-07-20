import { AdminCommandBlock } from "@/components/admin-command-block";
import { AdminDataTable, type AdminDataTableColumn } from "@/components/admin-data-table";
import { AdminStatusCard } from "@/components/admin-status-card";
import { DataSourceChip } from "@/components/data-source-chip";
import { EvidenceBadge } from "@/components/evidence-badge";
import { StatusChip, type StatusTone } from "@/components/status-chip";
import {
  loadExternalSourceGapWorkbench,
  type ExternalSourceGapAction,
  type ExternalSourceGapCandidate
} from "@/lib/external/source-gap-workbench";
import { formatDate, formatScore } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminSourceGapsPage() {
  const workbench = await loadExternalSourceGapWorkbench({
    limit: 20,
    minAiScore: 0.9
  });
  const actionRows = actionSummaryRows(workbench.actionCounts);

  return (
    <div className="space-y-8">
      <section>
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip label="External Source Gap Workbench" tone="admin" />
          <StatusChip label="operator-only" tone="risk" />
          <StatusChip label="external_unreviewed" tone="caution" />
          <StatusChip label="read-only" tone="success" />
        </div>
        <h1 className="mt-4 text-3xl font-semibold text-radar-ink">
          External source gaps
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-radar-muted">
          Operator workbench for comparing LearnPrompt AI News Radar public
          signals with the current AI Radar public snapshot. It classifies
          missing signals into source repair actions without adding them to
          public radar or entity records.
        </p>
      </section>

      <section
        aria-label="External source gap overview"
        className="grid gap-4 md:grid-cols-2 xl:grid-cols-5"
      >
        <AdminStatusCard
          detail="High-score LearnPrompt signals missing from the current AI Radar public snapshot after freshness and duplicate gates."
          label="Candidates"
          tone={workbench.candidates.length > 0 ? "caution" : "success"}
          value={workbench.candidates.length}
        />
        <AdminStatusCard
          detail={`LearnPrompt generated_at ${workbench.learnPrompt.generatedAt ?? "unknown"}.`}
          label="Freshness"
          tone={workbench.learnPrompt.freshness.isStale ? "risk" : "freshness"}
          value={freshnessValue(workbench.learnPrompt.freshness.ageHours)}
        />
        <AdminStatusCard
          detail="Current AI Radar public snapshot rows used as the matching baseline."
          label="AI Radar"
          tone="evidence"
          value={workbench.aiRadar.radarItemCount}
        />
        <AdminStatusCard
          detail="Distinct source names in the AI Radar public snapshot baseline."
          label="Snapshot sources"
          tone="admin"
          value={workbench.aiRadar.sourceCount}
        />
        <AdminStatusCard
          detail="LearnPrompt source-status ok sites from the public upstream source-health file."
          label="LP ok sites"
          tone="success"
          value={workbench.learnPrompt.sourceHealth.okSites}
        />
      </section>

      <section className="rounded-lg border border-radar-line bg-radar-panel p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-radar-ink">
              Guardrails
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-radar-muted">
              This page is a diagnostic surface. It does not promote external
              signals, create source rows, or call live model providers.
            </p>
          </div>
          <DataSourceChip detail="baseline" source="supabase_radar_items" />
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {workbench.guardrails.map((guardrail) => (
            <div
              className="rounded-md border border-radar-line bg-white p-3 text-sm leading-6 text-radar-muted"
              key={guardrail}
            >
              {guardrail}
            </div>
          ))}
        </div>
      </section>

      {workbench.warnings.length > 0 ? (
        <section className="rounded-lg border border-radar-caution/40 bg-white p-4 shadow-soft">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-radar-ink">
                Diagnostic notes
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-radar-muted">
                These notes explain unavailable inputs or stale-feed gates.
              </p>
            </div>
            <StatusChip
              label={workbench.baselineBlocked ? "baseline blocked" : workbench.staleBlocked ? "stale blocked" : "review"}
              tone={workbench.baselineBlocked || workbench.staleBlocked ? "risk" : "caution"}
            />
          </div>
          <ul className="mt-4 grid gap-2 text-sm leading-6 text-radar-muted">
            {workbench.warnings.map((warning) => (
              <li
                className="rounded-md border border-radar-line bg-radar-panel px-3 py-2"
                key={warning}
              >
                {warning}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="min-w-0 rounded-lg border border-radar-line bg-white p-4 shadow-soft">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-radar-ink">
                Action taxonomy
              </h2>
              <p className="mt-2 text-sm leading-6 text-radar-muted">
                Each missing signal is classified for source repair. These are
                operator labels, not publishing statuses.
              </p>
            </div>
            <StatusChip label="source-repair only" tone="admin" />
          </div>
          <div className="mt-4">
            <AdminDataTable
              ariaLabel="External source gap action summary"
              columns={actionColumns}
              minWidth="620px"
              rowKey={(row) => row.action}
              rows={actionRows}
            />
          </div>
        </div>

        <div className="min-w-0 rounded-lg border border-radar-line bg-radar-panel p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-radar-ink">
                Input status
              </h2>
              <p className="mt-2 text-sm leading-6 text-radar-muted">
                The workbench compares upstream public JSON with our current
                public snapshot. Stale upstream data suppresses normal
                candidates.
              </p>
            </div>
            <StatusChip
              label={workbench.baselineBlocked ? "baseline blocked" : workbench.staleBlocked ? "blocked" : "active"}
              tone={workbench.baselineBlocked || workbench.staleBlocked ? "risk" : "success"}
            />
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <InputStatus
              detail={`${workbench.learnPrompt.latestItemCount} public AI items, ${workbench.learnPrompt.sourceHealth.totalSites} source-status rows.`}
              label="LearnPrompt"
              tone={workbench.learnPrompt.freshness.isStale ? "risk" : "freshness"}
              value={workbench.learnPrompt.generatedAt ?? "unknown"}
            />
            <InputStatus
              detail={`${workbench.aiRadar.radarItemCount} radar rows across ${workbench.aiRadar.sourceCount} snapshot sources.`}
              label="AI Radar snapshot"
              tone="evidence"
              value={workbench.aiRadar.generatedAt ?? "unknown"}
            />
            <InputStatus
              detail="Failed and zero-output upstream sites are source-health context only."
              label="LP source health"
              tone={workbench.learnPrompt.sourceHealth.failedSites > 0 ? "caution" : "success"}
              value={`${workbench.learnPrompt.sourceHealth.failedSites} failed / ${workbench.learnPrompt.sourceHealth.zeroOutputSites} zero`}
            />
            <InputStatus
              detail="Default candidates require fresh upstream data."
              label="Parameters"
              tone="admin"
              value={`limit ${workbench.parameters.limit}, score ${workbench.parameters.minAiScore}`}
            />
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-radar-line bg-white p-4 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-radar-ink">
              Decision readiness
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-radar-muted">
              These counts show whether an operator has enough context to create
              a future source-change request or review task. They are previews
              only; this page still performs no mutations.
            </p>
          </div>
          <StatusChip label="preview only" tone="risk" />
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <InputStatus
            detail="Candidates matched to the cleaned AI Radar source registry by source name or host."
            label="Registry matches"
            tone={workbench.readinessCounts.registryMatches > 0 ? "admin" : "neutral"}
            value={String(workbench.readinessCounts.registryMatches)}
          />
          <InputStatus
            detail="Candidates whose LearnPrompt source-status row is failed or zero-output."
            label="Upstream health issues"
            tone={workbench.readinessCounts.upstreamFailures > 0 ? "caution" : "success"}
            value={String(workbench.readinessCounts.upstreamFailures)}
          />
          <InputStatus
            detail="Registry-matched candidates whose latest local ingestion source result failed."
            label="Local ingestion failures"
            tone={workbench.readinessCounts.localFailures > 0 ? "risk" : "success"}
            value={String(workbench.readinessCounts.localFailures)}
          />
          <InputStatus
            detail="Admin-only source-change or review-task previews generated from current evidence."
            label="Decision previews"
            tone={workbench.readinessCounts.decisionPreviews > 0 ? "evidence" : "neutral"}
            value={String(workbench.readinessCounts.decisionPreviews)}
          />
        </div>
      </section>

      <section className="min-w-0 rounded-lg border border-radar-line bg-white p-4 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-radar-ink">
              Missing external signals
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-radar-muted">
              These rows are public external candidates only. Use the action
              label to decide whether to repair a source, add a source, inspect
              dedupe, refine entity extraction, or ignore until corroborated.
            </p>
          </div>
          <StatusChip label="not AI Radar claims" tone="risk" />
        </div>
        <div className="mt-4">
          {workbench.candidates.length > 0 ? (
            <AdminDataTable
              ariaLabel="External source gap candidates"
              columns={candidateColumns}
              minWidth="1280px"
              rowKey={(candidate) => candidate.id}
              rows={workbench.candidates}
            />
          ) : (
            <div className="rounded-md border border-radar-line bg-radar-panel p-4">
              <StatusChip
                label={workbench.baselineBlocked ? "baseline unavailable" : workbench.staleBlocked ? "stale input blocked" : "no missing candidates"}
                tone={workbench.baselineBlocked || workbench.staleBlocked ? "risk" : "success"}
              />
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <AdminCommandBlock
          command={'npm run external:learnprompt:diff -- --limit 20 --min-ai-score 0.9'}
          detail="Read-only CLI equivalent. It compares public JSON and the current public snapshot without Supabase mutations."
          label="read-only"
          title="Diff command"
          tone="admin"
        />
        <AdminCommandBlock
          command={'set LEARNPROMPT_AI_NEWS_RADAR_DATA_DIR=D:\\Codex\\External\\LearnPrompt-ai-news-radar\\data'}
          detail="Optional local data directory for operator diagnostics. The admin page falls back to public JSON when no local directory is configured."
          label="optional"
          title="Local upstream data"
          tone="caution"
        />
      </section>
    </div>
  );
}

type ActionSummaryRow = {
  action: ExternalSourceGapAction;
  count: number;
  detail: string;
  tone: StatusTone;
};

const actionColumns: AdminDataTableColumn<ActionSummaryRow>[] = [
  {
    header: "Action",
    render: (row) => (
      <StatusChip label={actionLabel(row.action)} tone={row.tone} value={row.count} />
    )
  },
  {
    header: "Use",
    render: (row) => (
      <p className="max-w-xl text-sm leading-6 text-radar-muted">
        {row.detail}
      </p>
    )
  }
];

const candidateColumns: AdminDataTableColumn<ExternalSourceGapCandidate>[] = [
  {
    header: "Signal",
    render: (candidate) => (
      <div className="max-w-md">
        <p className="font-semibold leading-6 text-radar-ink">
          {candidate.title}
        </p>
        <p className="mt-1 text-xs leading-5 text-radar-muted">
          {candidate.externalId}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <StatusChip label={candidate.aiLabel} tone="evidence" />
          <StatusChip label={candidate.category} tone="freshness" />
        </div>
      </div>
    )
  },
  {
    header: "Action",
    render: (candidate) => (
      <div className="max-w-sm">
        <StatusChip
          label={actionLabel(candidate.action)}
          tone={actionTone(candidate.action)}
        />
        <p className="mt-2 text-sm leading-6 text-radar-muted">
          {candidate.actionReason}
        </p>
      </div>
    )
  },
  {
    header: "Source",
    render: (candidate) => (
      <div className="max-w-xs">
        <p className="font-semibold text-radar-ink">{candidate.sourceName}</p>
        <p className="mt-1 text-xs leading-5 text-radar-muted">
          {candidate.sourceTierLabel ?? candidate.sourceTier} · rank {candidate.sourceTierRank}
        </p>
        <p className="mt-1 text-xs leading-5 text-radar-muted">
          site: {candidate.siteId}
        </p>
      </div>
    )
  },
  {
    header: "Context",
    render: (candidate) => (
      <div className="grid max-w-sm gap-2">
        <div className="flex flex-wrap gap-1.5">
          <StatusChip
            label={candidate.registryMatch.matched ? `registry ${candidate.registryMatch.matchType}` : "registry none"}
            tone={candidate.registryMatch.matched ? "admin" : "neutral"}
          />
          {candidate.registryMatch.sourceId ? (
            <StatusChip
              label={candidate.registryMatch.sourceId}
              tone={candidate.registryMatch.sourceHealthEligible ? "success" : "caution"}
            />
          ) : null}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <StatusChip
            label={`LP ${candidate.upstreamHealth.status}`}
            tone={healthTone(candidate.upstreamHealth.status)}
            value={candidate.upstreamHealth.itemCount}
          />
          <StatusChip
            label={`local ${candidate.localIngestionHealth.status}`}
            tone={localHealthTone(candidate.localIngestionHealth.status)}
            value={candidate.localIngestionHealth.itemCount}
          />
        </div>
        {candidate.registryMatch.status ? (
          <p className="text-xs leading-5 text-radar-muted">
            {candidate.registryMatch.status} · {candidate.registryMatch.tier} · {candidate.registryMatch.crawlMethod}
          </p>
        ) : (
          <p className="text-xs leading-5 text-radar-muted">
            No registry match yet; treat add-source preview as intake review only.
          </p>
        )}
      </div>
    )
  },
  {
    header: "Scores",
    render: (candidate) => (
      <div className="grid gap-1.5">
        <EvidenceBadge
          detail={formatScore(candidate.aiScore)}
          kind="evidence"
          label="AI score"
        />
        <EvidenceBadge
          detail={candidate.priority.toFixed(2)}
          kind="freshness"
          label="priority"
        />
        <p className="text-xs leading-5 text-radar-muted">
          {candidate.publishedAt ? formatDate(candidate.publishedAt) : "No timestamp"}
        </p>
      </div>
    )
  },
  {
    header: "Provenance",
    render: (candidate) => (
      <div className="grid gap-1.5">
        <StatusChip label={candidate.provenance.provider} tone="admin" />
        <StatusChip label={candidate.reviewStatus} tone="caution" />
        <StatusChip label={candidate.usage} tone="risk" />
      </div>
    )
  },
  {
    header: "Preview",
    render: (candidate) => (
      <div className="max-w-sm">
        <div className="flex flex-wrap gap-1.5">
          <StatusChip
            label={candidate.decisionPreview.kind.replace(/_/g, " ")}
            tone={candidate.decisionPreview.kind === "source_change_request" ? "admin" : "evidence"}
          />
          {candidate.decisionPreview.requestType ? (
            <StatusChip label={candidate.decisionPreview.requestType} tone="caution" />
          ) : null}
        </div>
        <p className="mt-2 font-semibold leading-6 text-radar-ink">
          {candidate.decisionPreview.title}
        </p>
        <p className="mt-1 text-sm leading-6 text-radar-muted">
          {candidate.decisionPreview.rationale}
        </p>
      </div>
    )
  },
  {
    header: "Signals",
    render: (candidate) => (
      <div className="flex max-w-xs flex-wrap gap-1.5">
        {candidate.signals.length > 0 ? (
          candidate.signals.map((signal) => (
            <StatusChip key={signal} label={signal} tone="neutral" />
          ))
        ) : (
          <StatusChip label="none" tone="neutral" />
        )}
      </div>
    )
  },
  {
    header: "URL",
    render: (candidate) => (
      <a
        className="block max-w-[220px] break-words font-mono text-xs leading-5 text-radar-admin hover:text-radar-evidence"
        href={candidate.url}
        rel="noreferrer"
        target="_blank"
      >
        {hostLabel(candidate.url)}
      </a>
    )
  }
];

function actionSummaryRows(counts: Record<ExternalSourceGapAction, number>): ActionSummaryRow[] {
  return (Object.keys(counts) as ExternalSourceGapAction[]).map((action) => ({
    action,
    count: counts[action],
    detail: actionDetail(action),
    tone: actionTone(action)
  }));
}

function InputStatus({
  detail,
  label,
  tone,
  value
}: {
  detail: string;
  label: string;
  tone: StatusTone;
  value: string;
}) {
  return (
    <div className="rounded-md border border-radar-line bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-radar-ink">{label}</p>
        <StatusChip label={value} tone={tone} />
      </div>
      <p className="mt-2 text-sm leading-6 text-radar-muted">{detail}</p>
    </div>
  );
}

function freshnessValue(ageHours: number | null) {
  return ageHours === null ? "unknown" : `${ageHours}h`;
}

function actionLabel(action: ExternalSourceGapAction) {
  if (action === "add_source") {
    return "source intake review";
  }

  return action.replace(/_/g, " ");
}

function actionTone(action: ExternalSourceGapAction): StatusTone {
  switch (action) {
    case "add_source":
      return "admin";
    case "repair_existing_source":
      return "caution";
    case "dedupe_rule_gap":
      return "freshness";
    case "entity_extraction_gap":
      return "evidence";
    case "ignore_low_trust":
      return "neutral";
    default:
      return "neutral";
  }
}

function healthTone(status: ExternalSourceGapCandidate["upstreamHealth"]["status"]): StatusTone {
  if (status === "ok") return "success";
  if (status === "missing") return "neutral";
  return "risk";
}

function localHealthTone(status: ExternalSourceGapCandidate["localIngestionHealth"]["status"]): StatusTone {
  if (status === "success") return "success";
  if (status === "failed") return "risk";
  if (status === "no_latest_run" || status === "not_matched") return "neutral";
  return "caution";
}

function actionDetail(action: ExternalSourceGapAction) {
  switch (action) {
    case "add_source":
      return "Candidate source or host is absent from the current public snapshot baseline; review as trial source intake before any ingestion or evidence claim.";
    case "repair_existing_source":
      return "Source appears in the current public snapshot baseline but missed this item; inspect crawl freshness, parser coverage, and source-health status.";
    case "dedupe_rule_gap":
      return "Host or source appears covered; inspect canonical URL, title aliasing, and duplicate matching.";
    case "entity_extraction_gap":
      return "Known-source signal is high-trust but broad; inspect entity and category extraction before any source-repair promotion.";
    case "ignore_low_trust":
      return "Keep on watchlist unless corroborated by official or higher-trust sources.";
    default:
      return "Review source-gap classification.";
  }
}

function hostLabel(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}
