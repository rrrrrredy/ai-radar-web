import "@/lib/config/load-cli-env";

import { loadRadarFeed } from "@/lib/radar/feed";
import { generateReportDraft } from "@/lib/reports/generate-live-report";
import type { ReportLanguage, ReportPreviewType } from "@/lib/reports/types";

type CliOptions = {
  audience?: string;
  language: ReportLanguage;
  live: boolean;
  type: ReportPreviewType;
};

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const feed = await loadRadarFeed();
  const report = await generateReportDraft(feed, options.type, {
    audience: options.audience,
    language: options.language,
    live: options.live
  });

  console.log("Report generation dry-run");
  console.log(`Type: ${report.report_type}`);
  console.log(`Mode: ${report.mode}`);
  console.log(`Status: ${report.status}`);
  console.log(`Data source: ${report.data_source}`);
  console.log(`Time window: ${report.time_window.start} to ${report.time_window.end}`);
  console.log(`Retrieved items: ${report.retrieved_item_count}`);
  console.log(`Usable items: ${report.usable_item_count}`);
  console.log(`Citations: ${report.citations.length}`);
  console.log(`Caveats: ${report.caveats.length}`);
  console.log(`Missing evidence: ${report.missing_evidence.length}`);
  console.log(`Live requested: ${options.live ? "yes" : "no"}`);
  console.log(`Live DeepSeek used: ${report.model_metadata.mode === "live_deepseek" ? "yes" : "no"}`);
  console.log(`API calls: ${report.model_metadata.api_call_count}`);
  if (report.model_metadata.error) {
    console.log(`Live fallback reason: ${sanitizeLogValue(report.model_metadata.error)}`);
  }
  console.log(`Markdown bytes: ${Buffer.byteLength(report.markdown, "utf8")}`);
  console.log(`Title: ${report.title}`);
  console.log(`Summary: ${report.one_sentence_summary}`);

  if (report.caveats.length > 0) {
    console.log("Caveats:");
    for (const caveat of report.caveats.slice(0, 6)) {
      console.log(`- ${sanitizeLogValue(caveat)}`);
    }
  }
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    language: "zh",
    live: false,
    type: "daily"
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    switch (arg) {
      case "--type":
        options.type = reportType(readArg(args, index));
        index += 1;
        break;
      case "--live":
        options.live = true;
        break;
      case "--mode":
        options.live = readArg(args, index) === "live";
        index += 1;
        break;
      case "--language":
        options.language = language(readArg(args, index));
        index += 1;
        break;
      case "--audience":
        options.audience = readArg(args, index).slice(0, 120);
        index += 1;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function readArg(args: string[], index: number) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${args[index]} requires a value.`);
  }

  return value;
}

function reportType(value: string): ReportPreviewType {
  if (value === "daily" || value === "weekly") {
    return value;
  }

  throw new Error("--type must be daily or weekly.");
}

function language(value: string): ReportLanguage {
  if (value === "zh" || value === "en" || value === "mixed") {
    return value;
  }

  throw new Error("--language must be zh, en, or mixed.");
}

function sanitizeLogValue(value: string) {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/\bsk-(?:proj-)?[A-Za-z0-9_-]{8,}/gi, "sk-[redacted]")
    .replace(/\b(DEEPSEEK_API_KEY|SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_SUPABASE_ANON_KEY)\s*=\s*[^\s]+/gi, "$1=[redacted]")
    .replace(/\b(authorization|api[-_]?key|token|cookie)\b\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
    .slice(0, 600);
}

main().catch((error) => {
  console.error(sanitizeLogValue(error instanceof Error ? error.message : String(error)));
  process.exit(1);
});
