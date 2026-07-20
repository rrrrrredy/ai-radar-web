import fs from "node:fs/promises";
import path from "node:path";

import {
  fetchLearnPromptDailyBriefSnapshot,
  fetchLearnPromptLatestSnapshot,
  fetchLearnPromptSourceStatusSnapshot,
  fetchLearnPromptStoriesSnapshot,
  normalizeLearnPromptDailyBriefPayload,
  normalizeLearnPromptLatestPayload,
  normalizeLearnPromptSourceStatusPayload,
  normalizeLearnPromptStoriesPayload,
  selectLearnPromptDiffCandidates,
  type LearnPromptDailyBriefSnapshot,
  type LearnPromptLatestSnapshot,
  type LearnPromptSourceStatusSnapshot,
  type LearnPromptStoriesSnapshot
} from "@/lib/external/learnprompt-ai-news-radar";
import { loadPublicRadarSnapshot } from "@/lib/retrieval/load-radar-items";

type CliOptions = {
  allowStale: boolean;
  baseUrl?: string;
  learnPromptDir?: string;
  limit: number;
  minAiScore: number;
  output?: string;
  snapshotFile?: string;
};

type PublicSnapshotItem = {
  title?: string;
  url?: string;
  source_name?: string;
};

type PublicSnapshot = {
  generated_at?: string;
  radar_items?: PublicSnapshotItem[];
  freshness?: {
    latest_timestamp?: string;
  };
};

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const now = new Date();
  const [learnPrompt, snapshot] = await Promise.all([
    loadLearnPromptData(options, now),
    loadCurrentPublicSnapshot(options)
  ]);
  const snapshotItems = Array.isArray(snapshot.radar_items) ? snapshot.radar_items : [];
  const staleBlocked = learnPrompt.latest.freshness.isStale && !options.allowStale;
  const candidates = staleBlocked
    ? []
    : selectLearnPromptDiffCandidates(learnPrompt.latest, snapshotItems, {
        limit: options.limit,
        minAiScore: options.minAiScore
      });
  const diff = renderDiff({
    candidates,
    dailyBrief: learnPrompt.dailyBrief,
    latest: learnPrompt.latest,
    snapshot,
    sourceStatus: learnPrompt.sourceStatus,
    staleBlocked,
    stories: learnPrompt.stories
  });

  if (options.output) {
    const outputPath = path.resolve(options.output);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, diff, "utf8");
    console.log(`LearnPrompt diff written: ${outputPath}`);
    return;
  }

  console.log(diff);
}

async function loadLearnPromptData(options: CliOptions, now: Date): Promise<{
  dailyBrief: LearnPromptDailyBriefSnapshot;
  latest: LearnPromptLatestSnapshot;
  sourceStatus: LearnPromptSourceStatusSnapshot;
  stories: LearnPromptStoriesSnapshot;
}> {
  if (options.learnPromptDir) {
    const inputDir = path.resolve(options.learnPromptDir);
    const [latest, stories, dailyBrief, sourceStatus] = await Promise.all([
      readJson(path.join(inputDir, "latest-24h.json")),
      readJson(path.join(inputDir, "stories-merged.json")),
      readJson(path.join(inputDir, "daily-brief.json")),
      readJson(path.join(inputDir, "source-status.json"))
    ]);

    return {
      dailyBrief: normalizeLearnPromptDailyBriefPayload(dailyBrief, now),
      latest: normalizeLearnPromptLatestPayload(latest, now),
      sourceStatus: normalizeLearnPromptSourceStatusPayload(sourceStatus, now),
      stories: normalizeLearnPromptStoriesPayload(stories, now)
    };
  }

  const [latest, stories, dailyBrief, sourceStatus] = await Promise.all([
    fetchLearnPromptLatestSnapshot({ baseUrl: options.baseUrl, now }),
    fetchLearnPromptStoriesSnapshot({ baseUrl: options.baseUrl, now }),
    fetchLearnPromptDailyBriefSnapshot({ baseUrl: options.baseUrl, now }),
    fetchLearnPromptSourceStatusSnapshot({ baseUrl: options.baseUrl, now })
  ]);

  return {
    dailyBrief,
    latest,
    sourceStatus,
    stories
  };
}

async function loadCurrentPublicSnapshot(options: CliOptions): Promise<PublicSnapshot> {
  if (options.snapshotFile) {
    return readJson(path.resolve(options.snapshotFile)) as Promise<PublicSnapshot>;
  }

  const snapshot = await loadPublicRadarSnapshot({ preferLocal: true });
  return (snapshot ?? {}) as PublicSnapshot;
}

function renderDiff({
  candidates,
  dailyBrief,
  latest,
  snapshot,
  sourceStatus,
  staleBlocked,
  stories
}: {
  candidates: ReturnType<typeof selectLearnPromptDiffCandidates>;
  dailyBrief: LearnPromptDailyBriefSnapshot;
  latest: LearnPromptLatestSnapshot;
  snapshot: PublicSnapshot;
  sourceStatus: LearnPromptSourceStatusSnapshot;
  staleBlocked: boolean;
  stories: LearnPromptStoriesSnapshot;
}) {
  const candidateHeading = staleBlocked
    ? "## Stale LearnPrompt Source Gap (source-repair only)"
    : "## Missing High-Score Source-Repair Signals";
  const candidateIntro = staleBlocked
    ? "LearnPrompt latest data is stale or has a suspicious future timestamp, so normal missing-signal candidates are suppressed. Re-run with `--allow-stale` only for source-repair diagnostics."
    : candidates.length > 0
      ? "These are high-scoring public LearnPrompt 24h signals that do not match the current AI Radar public snapshot by normalized URL or source-title pair. They are source-repair diagnostics only, not AI Radar evidence or public claims."
      : "No high-score missing external signals found with the current threshold.";
  const lines = [
    "# LearnPrompt AI News Radar Diff",
    "",
    `Generated at: ${new Date().toISOString()}`,
    "",
    "## Inputs",
    "",
    `- AI Radar public snapshot generated_at: ${snapshot.generated_at ?? "unknown"}`,
    `- AI Radar public radar items: ${snapshot.radar_items?.length ?? 0}`,
    `- LearnPrompt latest generated_at: ${latest.generated_at ?? "unknown"}${freshnessLabel(latest.freshness)}`,
    `- LearnPrompt latest AI items: ${latest.items.length}`,
    `- LearnPrompt stories: ${stories.stories.length}${freshnessLabel(stories.freshness)}`,
    `- LearnPrompt daily brief items: ${dailyBrief.items.length}${freshnessLabel(dailyBrief.freshness)}`,
    `- LearnPrompt source health: ${sourceStatus.successful_sites} ok / ${sourceStatus.failed_sites} failed / ${sourceStatus.zero_item_sites} zero-output`,
    "",
    candidateHeading,
    "",
    candidateIntro,
    ""
  ];

  for (const [index, candidate] of candidates.entries()) {
    lines.push(
      `${index + 1}. **${markdownText(candidate.item.title)}**`,
      `   - Source: ${markdownText(candidate.item.source)} (${markdownText(candidate.item.source_tier_label ?? candidate.item.source_tier)}, rank ${candidate.item.source_tier_rank})`,
      `   - AI score: ${candidate.item.ai_score.toFixed(2)} | Label: ${markdownText(candidate.item.ai_label)} | Priority: ${candidate.priority.toFixed(2)}`,
      `   - Reason: ${markdownText(candidate.reason)}`,
      `   - Provenance: provider=${candidate.provenance.provider}, review_status=${candidate.provenance.review_status}, usage=${candidate.provenance.usage}`,
      `   - URL: <${candidate.item.url}>`,
      `   - Diagnostic category hint: ${candidate.mappedItem.categories.map(markdownText).join(", ")}`,
      ""
    );
  }

  lines.push(
    "## Guardrails",
    "",
    "- This diff is read-only and performs no Supabase writes.",
    "- External signals remain `external_unreviewed` and `source_repair_only`; they must not become public AI Radar evidence through this diff.",
    "- LearnPrompt daily-brief and story data must not be treated as AI Radar evidence or public entity evidence.",
    "- If LearnPrompt freshness is stale, use this diff only for source repair, not for today-facing copy.",
    ""
  );

  return lines.join("\n");
}

function freshnessLabel(freshness: { ageHours: number | null; isStale: boolean; maxAgeHours: number }) {
  const age = freshness.ageHours === null ? "unknown age" : `${freshness.ageHours}h old`;
  return freshness.isStale ? ` (STALE, ${age}, max ${freshness.maxAgeHours}h)` : ` (${age})`;
}

async function readJson(file: string) {
  return JSON.parse(await fs.readFile(file, "utf8")) as unknown;
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    allowStale: false,
    baseUrl: process.env.LEARNPROMPT_AI_NEWS_RADAR_BASE_URL || undefined,
    limit: 30,
    minAiScore: 0.85
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === "--base-url" && next) {
      options.baseUrl = next;
      index += 1;
    } else if (arg === "--allow-stale") {
      options.allowStale = true;
    } else if (arg === "--learnprompt-dir" && next) {
      options.learnPromptDir = next;
      index += 1;
    } else if (arg === "--snapshot-file" && next) {
      options.snapshotFile = next;
      index += 1;
    } else if (arg === "--limit" && next) {
      options.limit = positiveInteger(next, "--limit");
      index += 1;
    } else if (arg === "--min-ai-score" && next) {
      options.minAiScore = boundedScore(next, "--min-ai-score");
      index += 1;
    } else if (arg === "--output" && next) {
      options.output = next;
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}`);
    }
  }

  return options;
}

function positiveInteger(value: string, label: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return parsed;
}

function boundedScore(value: string, label: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error(`${label} must be between 0 and 1.`);
  }
  return parsed;
}

function printHelp() {
  console.log(`Usage: npm run external:learnprompt:diff -- [options]

Options:
  --base-url <url>            LearnPrompt data base URL. Defaults to LEARNPROMPT_AI_NEWS_RADAR_BASE_URL or the public GitHub Pages data URL.
  --allow-stale               Emit candidates even when LearnPrompt latest data is stale.
  --learnprompt-dir <path>    Read LearnPrompt JSON from a local data directory.
  --snapshot-file <path>      Read AI Radar public snapshot from a specific file.
  --limit <n>                 Max missing signals to print. Default: 30.
  --min-ai-score <0..1>       Minimum LearnPrompt AI score. Default: 0.85.
  --output <path>             Write the Markdown diff to a file.
`);
}

function markdownText(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/([\\`*_{}\[\]()#+\-.!|>])/g, "\\$1");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
