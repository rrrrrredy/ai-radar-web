import "@/lib/config/load-cli-env";

import { fetchPublicText } from "@/lib/ingestion/config";
import { readCleanedSources } from "@/lib/ingestion/select-sources";
import type { CleanedSource, CrawlMethodFilter } from "@/lib/ingestion/types";
import { getSupabaseServiceClientForWrite } from "@/lib/supabase/service";
import { countBy, isSourceHealthEligible, loadSourceIds } from "@/lib/supabase/persistence";

type CliOptions = {
  write: boolean;
  probe: boolean;
  limit: number;
  method: CrawlMethodFilter;
  sourceId?: string;
};

type HealthCheckResult = {
  source: CleanedSource;
  status: "healthy" | "failed";
  checkedAt: string;
  latencyMs: number;
  httpStatus: number;
  itemCount: number;
  errorMessage?: string;
  metadata: Record<string, unknown>;
};

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const candidates = selectCandidates(readCleanedSources(), options);

  console.log(`Source health mode: ${options.write ? "write" : options.probe ? "probe dry-run" : "selection dry-run"}`);
  console.log(`Eligible candidates selected: ${candidates.length}`);
  console.log(`By crawl method: ${formatCounts(countBy(candidates, (source) => source.crawl_method))}`);

  if (!options.probe && !options.write) {
    console.log("Dry run only. No public endpoints were checked and no Supabase writes were attempted.");
    return;
  }

  const checks = await runChecks(candidates);
  console.log(`Health checks completed: ${checks.length}`);
  console.log(`By health status: ${formatCounts(countBy(checks, (check) => check.status))}`);

  if (!options.write) {
    console.log("Probe dry run only. No Supabase writes were attempted.");
    return;
  }

  const supabase = getSupabaseServiceClientForWrite();
  const sourceIds = await loadSourceIds(supabase, candidates.map((source) => source.id));
  const rows = checks.map((check) => {
    const sourceId = sourceIds.get(check.source.id);
    if (!sourceId) {
      throw new Error(`Import sources before writing health checks. Missing source slug: ${check.source.id}`);
    }

    return {
      source_id: sourceId,
      checked_at: check.checkedAt,
      checked_url: check.source.url,
      crawl_method: check.source.crawl_method,
      check_kind: "public_endpoint",
      status: check.status,
      latency_ms: check.latencyMs,
      duration_ms: check.latencyMs,
      http_status: check.httpStatus,
      item_count: check.itemCount,
      error_message: check.errorMessage ?? null,
      metadata: check.metadata
    };
  });

  const { error } = await supabase.from("source_health_checks").insert(rows);
  if (error) {
    throw new Error(`Unable to insert source health checks: ${error.message}`);
  }

  for (const check of checks) {
    const sourceId = sourceIds.get(check.source.id);
    if (sourceId) {
      const { error: updateError } = await supabase
        .from("sources")
        .update({ last_checked_at: check.checkedAt })
        .eq("id", sourceId);
      if (updateError) {
        throw new Error(`Unable to update source last_checked_at: ${updateError.message}`);
      }
    }
  }

  console.log(`Supabase source health rows inserted: ${rows.length}`);
}

function selectCandidates(sources: CleanedSource[], options: CliOptions) {
  return sources
    .filter(isSourceHealthEligible)
    .filter((source) => (options.method === "all" ? true : source.crawl_method === options.method))
    .filter((source) => (options.sourceId ? source.id === options.sourceId : true))
    .slice(0, options.limit);
}

async function runChecks(sources: CleanedSource[]): Promise<HealthCheckResult[]> {
  const results: HealthCheckResult[] = [];

  for (const source of sources) {
    const started = Date.now();
    const checkedAt = new Date().toISOString();
    const response = await fetchPublicText(source.url ?? "", {
      accept: "text/html,application/rss+xml,application/atom+xml,application/json;q=0.9,*/*;q=0.1",
      maxBytes: 4096
    });
    const latencyMs = Date.now() - started;

    results.push({
      source,
      status: response.ok ? "healthy" : "failed",
      checkedAt,
      latencyMs,
      httpStatus: response.status,
      itemCount: response.ok ? 1 : 0,
      errorMessage: response.errorMessage,
      metadata: {
        status_text: response.statusText,
        final_url: response.url,
        truncated: response.truncated ?? false,
        headers: response.headers
      }
    });
  }

  return results;
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    write: false,
    probe: false,
    limit: 10,
    method: "all"
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    switch (arg) {
      case "--write":
        options.write = true;
        options.probe = true;
        break;
      case "--probe":
        options.probe = true;
        break;
      case "--dry-run":
        options.write = false;
        options.probe = false;
        break;
      case "--limit":
        options.limit = readPositiveNumber(args, index);
        index += 1;
        break;
      case "--method":
        options.method = readMethod(args, index);
        index += 1;
        break;
      case "--source":
        options.sourceId = readStringArg(args, index);
        index += 1;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function readStringArg(args: string[], index: number) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${args[index]}`);
  }
  return value;
}

function readPositiveNumber(args: string[], index: number) {
  const value = Number(readStringArg(args, index));
  if (!Number.isFinite(value) || value < 1) {
    throw new Error(`${args[index]} must be a positive number.`);
  }
  return Math.floor(value);
}

function readMethod(args: string[], index: number): CrawlMethodFilter {
  const value = readStringArg(args, index);
  const allowed = ["rss", "html", "api", "podcast_feed", "youtube_feed", "all"];
  if (!allowed.includes(value)) {
    throw new Error(`--method must be one of: ${allowed.join(", ")}`);
  }
  return value as CrawlMethodFilter;
}

function formatCounts(counts: Record<string, number>) {
  return Object.entries(counts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join(", ");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
