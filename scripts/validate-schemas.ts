import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const privateUrlPatterns = [
  new RegExp("km\\." + "san" + "kuai\\.com", "i"),
  new RegExp("san" + "kuai", "i"),
  new RegExp("mei" + "tuan", "i"),
  /intranet/i,
  /localhost/i,
  /127\.0\.0\.1/i,
  new RegExp("api/file/" + "cdn", "i"),
  new RegExp("content" + "Type=1", "i")
];

const sourceTypes = new Set([
  "x_account",
  "official_blog",
  "ai_media",
  "tech_media",
  "newsletter",
  "podcast",
  "youtube",
  "researcher",
  "investor",
  "github",
  "arxiv",
  "course",
  "book",
  "community",
  "manual_import",
  "other"
]);

const sourceCategories = new Set([
  "domestic_media",
  "overseas_media",
  "x_account",
  "book",
  "podcast",
  "video_course",
  "ai_specific",
  "vc_blog",
  "vc_partner",
  "company_blog",
  "research_blog",
  "other"
]);

const sourceTiers = new Set(["T1", "T1.5", "T2", "T3", "unreviewed"]);
const sourceStatuses = new Set(["active", "trial", "needs_public_url", "deferred", "rejected"]);
const crawlMethods = new Set(["rss", "html", "api", "manual", "x_api_future", "podcast_feed", "youtube_feed", "no_crawl", "unknown"]);
const sourceLanguages = new Set(["zh", "en", "mixed", "unknown"]);
const sourceRegions = new Set(["china", "overseas", "global", "unknown"]);

function walk(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

function readJson(filePath: string): Record<string, unknown> | Array<Record<string, unknown>> {
  const text = fs.readFileSync(filePath, "utf8");
  try {
    return JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${path.relative(root, filePath)} is not valid JSON: ${message}`);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertString(value: unknown, message: string): asserts value is string {
  assert(typeof value === "string", message);
}

function assertStringArray(value: unknown, message: string): asserts value is string[] {
  assert(Array.isArray(value), message);
  for (const item of value) {
    assert(typeof item === "string", message);
  }
}

function assertEnum(value: unknown, values: Set<string>, message: string): asserts value is string {
  assertString(value, message);
  assert(values.has(value), message);
}

function assertPublicUrl(value: unknown, sourceId: string, field: string, nullable: boolean) {
  if (nullable && value === null) {
    return;
  }

  assertString(value, `${sourceId}.${field} must be a string${nullable ? " or null" : ""}`);
  assert(/^https?:\/\//.test(value), `${sourceId}.${field} must use a public HTTP(S) URL`);

  for (const pattern of privateUrlPatterns) {
    assert(!pattern.test(value), `${sourceId}.${field} contains a private or local URL`);
  }
}

function validateSchemas() {
  const schemaDir = path.join(root, "data", "schemas");
  const schemaFiles = walk(schemaDir).filter((file) => file.endsWith(".json"));

  for (const file of schemaFiles) {
    const schema = readJson(file);
    const name = path.relative(root, file);
    assert(!Array.isArray(schema), `${name} must be a JSON object`);
    assert(schema.$schema, `${name} must declare $schema`);
    assert(schema.title, `${name} must declare title`);
    assert(schema.type, `${name} must declare type`);
  }

  return schemaFiles.length;
}

function validateSeedData() {
  const seedDir = path.join(root, "data", "seed");
  const seedFiles = walk(seedDir).filter((file) => file.endsWith(".json"));

  for (const file of seedFiles) {
    readJson(file);
  }

  const sources = readJson(path.join(seedDir, "sources.example.json"));
  assert(Array.isArray(sources), "sources.example.json must be an array");

  for (const source of sources) {
    assert(source.id && source.name && source.url && source.type, `source is missing required fields: ${JSON.stringify(source)}`);
    assert(typeof source.url === "string", `${source.id} URL must be a string`);
    assert(/^https:\/\//.test(source.url), `${source.id} must use a public https URL`);
    for (const pattern of privateUrlPatterns) {
      assert(!pattern.test(source.url), `${source.id} contains a private or local URL`);
    }
  }

  const taxonomy = readJson(path.join(seedDir, "source-taxonomy.json"));
  assert(!Array.isArray(taxonomy), "source-taxonomy.json must be an object");
  assert(Array.isArray(taxonomy.categories), "source-taxonomy.json must contain categories array");
  assert(taxonomy.categories.length >= 18, "source taxonomy should include all requested categories");

  const cleanedSourcesPath = path.join(seedDir, "sources", "ai-learning-resources.cleaned.json");
  if (fs.existsSync(cleanedSourcesPath)) {
    validateCleanedSourceRegistry(readJson(cleanedSourcesPath));
  }

  const importSummaryPath = path.join(seedDir, "sources", "source-import-summary.json");
  if (fs.existsSync(importSummaryPath)) {
    validateImportSummary(readJson(importSummaryPath), cleanedSourcesPath);
  }

  return seedFiles.length;
}

function validateCleanedSourceRegistry(value: Record<string, unknown> | Array<Record<string, unknown>>) {
  assert(Array.isArray(value), "ai-learning-resources.cleaned.json must be an array");
  assert(value.length > 0, "cleaned source registry must contain at least one source");

  const ids = new Set<string>();

  for (const source of value) {
    assert(isRecord(source), "each cleaned source must be an object");
    assertString(source.id, "cleaned source is missing id");
    assert(/^[a-z0-9][a-z0-9_-]*$/.test(source.id), `${source.id} must be a stable slug id`);
    assert(!ids.has(source.id), `${source.id} is duplicated`);
    ids.add(source.id);

    assertString(source.name, `${source.id}.name must be a string`);
    assertEnum(source.type, sourceTypes, `${source.id}.type is invalid`);
    assertEnum(source.category, sourceCategories, `${source.id}.category is invalid`);
    assertEnum(source.language, sourceLanguages, `${source.id}.language is invalid`);
    assertEnum(source.region, sourceRegions, `${source.id}.region is invalid`);
    assertEnum(source.tier, sourceTiers, `${source.id}.tier is invalid`);
    assertEnum(source.status, sourceStatuses, `${source.id}.status is invalid`);
    assertEnum(source.crawl_method, crawlMethods, `${source.id}.crawl_method is invalid`);
    assert(typeof source.weight === "number" && source.weight >= 0 && source.weight <= 1, `${source.id}.weight must be between 0 and 1`);
    assertStringArray(source.tags, `${source.id}.tags must be a string array`);
    assertStringArray(source.risk_flags, `${source.id}.risk_flags must be a string array`);
    assert(source.source_origin === "AI学习资源.md", `${source.id}.source_origin must record the local source file`);

    assertPublicUrl(source.url, source.id, "url", true);
    assertPublicUrl(source.rss_url, source.id, "rss_url", true);
    assertPublicUrl(source.github_url, source.id, "github_url", true);
    assertPublicUrl(source.youtube_url, source.id, "youtube_url", true);
    assertPublicUrl(source.podcast_url, source.id, "podcast_url", true);

    if (source.status === "needs_public_url") {
      assert(source.url === null, `${source.id} with needs_public_url status must have null url`);
      assert(source.risk_flags.includes("needs_public_url"), `${source.id} must include needs_public_url risk flag`);
    }

    if (source.type === "x_account") {
      assertString(source.x_handle, `${source.id}.x_handle must be set for X accounts`);
      assert(source.crawl_method === "x_api_future", `${source.id} X account must use x_api_future crawl method`);
    }
  }
}

function validateImportSummary(value: Record<string, unknown> | Array<Record<string, unknown>>, cleanedSourcesPath: string) {
  assert(isRecord(value), "source-import-summary.json must be an object");
  assertString(value.input_file, "source import summary must include input_file");
  assertString(value.generated_at, "source import summary must include generated_at");
  assert(typeof value.total_sources === "number", "source import summary must include total_sources");
  assert(typeof value.private_links_removed === "number", "source import summary must include private_links_removed");
  assert(typeof value.needs_public_url_count === "number", "source import summary must include needs_public_url_count");
  assert(typeof value.skipped_count === "number", "source import summary must include skipped_count");
  assertStringArray(value.warnings, "source import summary warnings must be a string array");

  if (fs.existsSync(cleanedSourcesPath)) {
    const cleanedSources = readJson(cleanedSourcesPath);
    assert(Array.isArray(cleanedSources), "cleaned source registry must be an array");
    assert(value.total_sources === cleanedSources.length, "source import summary total_sources must match cleaned registry length");
  }
}

function main() {
  const schemaCount = validateSchemas();
  const seedCount = validateSeedData();
  console.log(`Validated ${schemaCount} schema files and ${seedCount} seed data files.`);
}

main();
