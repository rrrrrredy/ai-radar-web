import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const inputFile = path.join(root, "local-input", "AI学习资源.md");
const outputDir = path.join(root, "data", "seed", "sources");
const cleanedOutput = path.join(outputDir, "ai-learning-resources.cleaned.json");
const auditOutput = path.join(outputDir, "ai-learning-resources.audit.md");
const summaryOutput = path.join(outputDir, "source-import-summary.json");
const sourceOrigin = "AI学习资源.md";
const generatedAt = "2026-05-13";

type SourceType =
  | "x_account"
  | "official_blog"
  | "ai_media"
  | "tech_media"
  | "newsletter"
  | "podcast"
  | "youtube"
  | "researcher"
  | "investor"
  | "github"
  | "arxiv"
  | "course"
  | "book"
  | "community"
  | "manual_import"
  | "other";
type SourceCategory =
  | "domestic_media"
  | "overseas_media"
  | "x_account"
  | "book"
  | "podcast"
  | "video_course"
  | "ai_specific"
  | "vc_blog"
  | "vc_partner"
  | "company_blog"
  | "research_blog"
  | "other";
type Tier = "T1" | "T1.5" | "T2" | "T3" | "unreviewed";
type CrawlMethod = "rss" | "html" | "api" | "manual" | "x_api_future" | "podcast_feed" | "youtube_feed" | "no_crawl" | "unknown";
type SourceStatus = "active" | "trial" | "needs_public_url" | "deferred" | "rejected";
type Language = "zh" | "en" | "mixed" | "unknown";
type Region = "china" | "overseas" | "global" | "unknown";

type LinkCandidate = {
  label: string;
  url: string;
};

type RemovedLink = {
  reason: "private_or_internal" | "image" | "local_or_invalid" | "credentialed_query";
  label: string;
};

type ParsedEntry = {
  lineNumber: number;
  section: string;
  kind: "table" | "bullet";
  raw: string;
  name: string;
  inputType: string;
  description: string;
  links: LinkCandidate[];
  removedLinks: RemovedLink[];
  imageLinkCount: number;
  notes: string[];
  xHandleFromCell: string | null;
};

type AuditEntry = {
  lineNumber: number;
  section: string;
  reason: string;
  raw: string;
};

type CleanedSource = {
  id: string;
  name: string;
  name_en: string | null;
  type: SourceType;
  category: SourceCategory;
  description: string;
  url: string | null;
  rss_url: string | null;
  x_handle: string | null;
  github_url: string | null;
  youtube_url: string | null;
  podcast_url: string | null;
  language: Language;
  region: Region;
  tier: Tier;
  weight: number;
  crawl_method: CrawlMethod;
  update_frequency: "hourly" | "daily" | "weekly" | "manual" | "unknown";
  status: SourceStatus;
  tags: string[];
  risk_flags: string[];
  notes: string;
  source_origin: string;
  created_at: string;
  updated_at: string;
};

type ImportSummary = {
  input_file: string;
  generated_at: string;
  total_sources: number;
  by_category: Record<string, number>;
  by_type: Record<string, number>;
  by_tier: Record<string, number>;
  by_status: Record<string, number>;
  by_crawl_method: Record<string, number>;
  private_links_removed: number;
  needs_public_url_count: number;
  skipped_count: number;
  warnings: string[];
};

type ImportResult = {
  parsedEntries: ParsedEntry[];
  auditEntries: AuditEntry[];
  sources: CleanedSource[];
  duplicateNotes: string[];
  privateLinksRemoved: number;
  imageLinksRemoved: number;
};

const privateUrlPatterns = [
  new RegExp("km\\." + "san" + "kuai\\.com", "i"),
  new RegExp("san" + "kuai", "i"),
  new RegExp("mei" + "tuan", "i"),
  /localhost/i,
  /127\.0\.0\.1/i,
  /intranet/i,
  new RegExp("api/file/" + "cdn", "i"),
  new RegExp("content" + "Type=1", "i")
];

const riskyQueryKeys = [
  "access_token",
  "accessToken",
  "auth",
  "bearer",
  "cookie",
  "session",
  "token"
];

const trackingParamPrefixes = [
  "ad_",
  "buvid",
  "force",
  "from_",
  "gxd",
  "gx",
  "ir",
  "mid",
  "plat",
  "rq",
  "rp",
  "share",
  "spm",
  "timestamp",
  "unique",
  "utm_"
];

function assertInputExists() {
  if (!fs.existsSync(inputFile)) {
    throw new Error(`Required input file is missing: ${inputFile}`);
  }
}

function normalizeWhitespace(value: string) {
  return value
    .replace(/\u200b/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s+\n/g, "\n")
    .trim();
}

function stripMarkdownSyntax(value: string) {
  return normalizeWhitespace(
    value
      .replace(/!\[[^\]]*]\([^)]+\)/g, "")
      .replace(/\*\*/g, "")
      .replace(/__/g, "")
      .replace(/<br\s*\/?>/gi, " ")
  );
}

function textWithoutLinks(value: string) {
  return stripMarkdownSyntax(value.replace(/!?\[([^\]]*)]\([^)]+\)/g, "$1"));
}

function hashText(value: string, length = 8) {
  return crypto.createHash("sha1").update(value).digest("hex").slice(0, length);
}

function slugify(value: string) {
  const ascii = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/\+/g, " plus ")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .toLowerCase();

  if (!ascii) {
    return `source-${hashText(value)}`;
  }

  return ascii.length >= 4 ? ascii : `${ascii}-${hashText(value, 6)}`;
}

function normalizeHeader(value: string) {
  return stripMarkdownSyntax(value).toLowerCase();
}

function splitTableRow(line: string) {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => normalizeWhitespace(cell));
}

function isSeparatorRow(cells: string[]) {
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function alignCells(cells: string[], expectedLength: number) {
  if (cells.length === expectedLength) {
    return cells;
  }

  if (cells.length > expectedLength && expectedLength >= 3) {
    const surplus = cells.length - expectedLength;
    const mergedName = cells.slice(1, 2 + surplus).join("|");
    return [cells[0], mergedName, ...cells.slice(2 + surplus)];
  }

  return [...cells, ...Array.from({ length: Math.max(0, expectedLength - cells.length) }, () => "")];
}

function isLocalPath(value: string) {
  return /^(?:[A-Za-z]:\\|\\\\|file:\/\/|\/Users\/|\/home\/)/.test(value.trim());
}

function isTrackingParam(key: string) {
  const lowered = key.toLowerCase();
  return trackingParamPrefixes.some((prefix) => lowered.startsWith(prefix.toLowerCase()));
}

function isRiskyQueryKey(key: string) {
  const lowered = key.toLowerCase();
  return riskyQueryKeys.some((risk) => lowered.includes(risk.toLowerCase()));
}

function hasPrivatePattern(value: string) {
  return privateUrlPatterns.some((pattern) => pattern.test(value));
}

function sanitizeUrl(rawUrl: string, isImage: boolean): { link: LinkCandidate | null; removed?: RemovedLink } {
  const compactUrl = rawUrl.trim().replace(/^<|>$/g, "").replace(/[),.，。]+$/g, "");

  if (!compactUrl || isLocalPath(compactUrl)) {
    return { link: null, removed: { reason: "local_or_invalid", label: "" } };
  }

  if (isImage) {
    return {
      link: null,
      removed: {
        reason: hasPrivatePattern(compactUrl) ? "private_or_internal" : "image",
        label: ""
      }
    };
  }

  const withScheme = compactUrl.startsWith("www.") ? `https://${compactUrl}` : compactUrl;

  if (!/^https?:\/\//i.test(withScheme)) {
    return { link: null, removed: { reason: "local_or_invalid", label: "" } };
  }

  if (hasPrivatePattern(withScheme) || /\.(?:png|jpe?g|gif|webp|svg)(?:$|[?#])/i.test(withScheme)) {
    return { link: null, removed: { reason: "private_or_internal", label: "" } };
  }

  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return { link: null, removed: { reason: "local_or_invalid", label: "" } };
  }

  if (hasPrivatePattern(parsed.hostname)) {
    return { link: null, removed: { reason: "private_or_internal", label: "" } };
  }

  let removedCredentialedQuery = false;
  const keptParams = new URLSearchParams();
  parsed.searchParams.forEach((value, key) => {
    if (isRiskyQueryKey(key)) {
      removedCredentialedQuery = true;
      return;
    }

    if (!isTrackingParam(key)) {
      keptParams.set(key, value);
    }
  });

  parsed.search = keptParams.toString();
  parsed.hash = "";

  if (["twitter.com", "www.twitter.com", "mobile.twitter.com"].includes(parsed.hostname.toLowerCase())) {
    parsed.hostname = "x.com";
  }

  const normalizedUrl = parsed.toString().replace(/\/$/, parsed.pathname === "/" ? "/" : "");

  if (removedCredentialedQuery && hasPrivatePattern(compactUrl)) {
    return { link: null, removed: { reason: "private_or_internal", label: "" } };
  }

  return {
    link: {
      label: "",
      url: normalizedUrl
    },
    removed: removedCredentialedQuery ? { reason: "credentialed_query", label: "" } : undefined
  };
}

function collectLinks(text: string) {
  const links: LinkCandidate[] = [];
  const removedLinks: RemovedLink[] = [];
  const markdownLinkPattern = /(!)?\[([^\]]*)]\(([^)]+)\)/g;
  const consumedUrls = new Set<string>();
  let imageLinkCount = 0;
  let match: RegExpExecArray | null;

  while ((match = markdownLinkPattern.exec(text)) !== null) {
    const [, imageMarker, label, rawUrl] = match;
    const isImage = imageMarker === "!";
    if (isImage) {
      imageLinkCount += 1;
    }

    const result = sanitizeUrl(rawUrl, isImage);
    consumedUrls.add(rawUrl);

    if (result.link) {
      links.push({
        label: normalizeWhitespace(label),
        url: result.link.url
      });
    }

    if (result.removed) {
      removedLinks.push({
        ...result.removed,
        label: normalizeWhitespace(label)
      });
    }
  }

  const withoutMarkdown = text.replace(markdownLinkPattern, " ");
  const bareUrlPattern = /https?:\/\/[^\s<>)]+/g;
  while ((match = bareUrlPattern.exec(withoutMarkdown)) !== null) {
    const [rawUrl] = match;
    if (consumedUrls.has(rawUrl)) {
      continue;
    }

    const result = sanitizeUrl(rawUrl, false);
    if (result.link) {
      links.push(result.link);
    }
    if (result.removed) {
      removedLinks.push(result.removed);
    }
  }

  return { links: dedupeLinks(links), removedLinks, imageLinkCount };
}

function dedupeLinks(links: LinkCandidate[]) {
  const seen = new Set<string>();
  const deduped: LinkCandidate[] = [];
  for (const link of links) {
    const key = link.url.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(link);
    }
  }
  return deduped;
}

function headingText(line: string) {
  const match = line.match(/^(#{1,6})\s+(.+)$/);
  if (!match) {
    return null;
  }
  return {
    level: match[1].length,
    text: stripMarkdownSyntax(match[2]).replace(/^[一二三四五六七八九十0-9.、\s]+/, "")
  };
}

function sectionForHeading(text: string, counts: Map<string, number>) {
  const normalized = normalizeWhitespace(text);
  const count = (counts.get(normalized) ?? 0) + 1;
  counts.set(normalized, count);
  return count > 1 ? `${normalized} (${count})` : normalized;
}

function parseTable(
  tableLines: Array<{ line: string; lineNumber: number }>,
  section: string,
  auditEntries: AuditEntry[]
) {
  const entries: ParsedEntry[] = [];
  const rows = tableLines.map((row) => ({
    ...row,
    cells: splitTableRow(row.line)
  }));
  const headerRow = rows.find((row) => !isSeparatorRow(row.cells));

  if (!headerRow) {
    return entries;
  }

  const headers = headerRow.cells.map(normalizeHeader);
  const dataRows = rows.filter((row) => row.lineNumber !== headerRow.lineNumber && !isSeparatorRow(row.cells));

  for (const row of dataRows) {
    const cells = alignCells(row.cells, headers.length);
    const data = new Map<string, string>();
    headers.forEach((header, index) => data.set(header, cells[index] ?? ""));

    const twitterCell = findCell(data, ["twitter账号", "twitter", "x账号"]);
    const displayNameCell = findCell(data, ["姓名"]);
    const commonNameCell = findCell(data, ["自媒体", "名字", "书名"]);
    const nameCell = twitterCell ? displayNameCell || twitterCell : commonNameCell;
    const rawName = textWithoutLinks(nameCell);

    if (!rawName) {
      auditEntries.push({
        lineNumber: row.lineNumber,
        section,
        reason: "Missing parseable source name",
        raw: row.line
      });
      continue;
    }

    const inputType = textWithoutLinks(findCell(data, ["类别"]));
    const description = textWithoutLinks(findCell(data, ["简介"]));
    const representative = textWithoutLinks(findCell(data, ["代表节目"]));
    const allCellText = cells.join(" ");
    const linkResult = collectLinks(allCellText);

    entries.push({
      lineNumber: row.lineNumber,
      section,
      kind: "table",
      raw: row.line,
      name: rawName,
      inputType,
      description,
      links: linkResult.links,
      removedLinks: linkResult.removedLinks,
      imageLinkCount: linkResult.imageLinkCount,
      notes: representative ? [`Representative item: ${representative}`] : [],
      xHandleFromCell: twitterCell ? normalizeXHandle(twitterCell) : null
    });
  }

  return entries;
}

function findCell(data: Map<string, string>, candidates: string[]) {
  for (const candidate of candidates) {
    for (const [header, value] of data.entries()) {
      if (header.includes(candidate.toLowerCase())) {
        return value;
      }
    }
  }
  return "";
}

function parseBullet(line: string, lineNumber: number, section: string) {
  const match = line.match(/^\s*[-*]\s+(.+)$/);
  if (!match) {
    return null;
  }

  const body = match[1];
  const firstLink = body.match(/\[([^\]]+)]\(([^)]+)\)/);
  if (!firstLink) {
    return null;
  }

  const linkResult = collectLinks(body);
  const name = textWithoutLinks(firstLink[1]);
  const descriptionMatch = body.match(/\)\s*[-–—]?\s*(.*)$/);
  const description = descriptionMatch ? textWithoutLinks(descriptionMatch[1]).replace(/^\(|\)$/g, "") : "";

  return {
    lineNumber,
    section,
    kind: "bullet" as const,
    raw: line,
    name,
    inputType: "",
    description,
    links: linkResult.links,
    removedLinks: linkResult.removedLinks,
    imageLinkCount: linkResult.imageLinkCount,
    notes: [] as string[],
    xHandleFromCell: null
  };
}

function parseMarkdown(markdown: string) {
  const lines = markdown.split(/\r?\n/);
  const parsedEntries: ParsedEntry[] = [];
  const auditEntries: AuditEntry[] = [];
  const headingCounts = new Map<string, number>();
  let currentSection = "root";
  let tableLines: Array<{ line: string; lineNumber: number }> = [];

  const flushTable = () => {
    if (tableLines.length > 0) {
      parsedEntries.push(...parseTable(tableLines, currentSection, auditEntries));
      tableLines = [];
    }
  };

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const heading = headingText(line);
    if (heading && heading.level >= 3) {
      flushTable();
      currentSection = sectionForHeading(heading.text, headingCounts);
      return;
    }

    if (line.trim().startsWith("|")) {
      tableLines.push({ line, lineNumber });
      return;
    }

    flushTable();
    const bullet = parseBullet(line, lineNumber, currentSection);
    if (bullet) {
      parsedEntries.push(bullet);
    }
  });

  flushTable();

  return { parsedEntries, auditEntries };
}

function sectionContext(section: string): {
  category: SourceCategory;
  defaultType: SourceType;
  language: Language;
  region: Region;
} {
  const normalized = section.toLowerCase();

  if (normalized.includes("推特")) {
    return { category: "x_account", defaultType: "x_account", language: "mixed", region: "global" };
  }
  if (normalized.includes("书籍")) {
    return { category: "book", defaultType: "book", language: "mixed", region: "global" };
  }
  if (normalized.includes("youtube")) {
    return { category: "video_course", defaultType: "youtube", language: "mixed", region: "global" };
  }
  if (normalized.includes("视频")) {
    return { category: "video_course", defaultType: "course", language: "mixed", region: "global" };
  }
  if (normalized.includes("播客") || normalized.includes("科技热点评论")) {
    return { category: "podcast", defaultType: "podcast", language: "mixed", region: "global" };
  }
  if (normalized.includes("vc官方博客")) {
    return { category: "vc_blog", defaultType: "investor", language: "en", region: "overseas" };
  }
  if (normalized.includes("vc合伙人")) {
    return { category: "vc_partner", defaultType: "investor", language: "en", region: "overseas" };
  }
  if (normalized.includes("ai-specific") && normalized.includes("(2)")) {
    return { category: "podcast", defaultType: "podcast", language: "en", region: "overseas" };
  }
  if (normalized.includes("ai-specific")) {
    return { category: "ai_specific", defaultType: "newsletter", language: "en", region: "overseas" };
  }
  if (normalized.includes("海外博客") || normalized.includes("海外媒体")) {
    return { category: "overseas_media", defaultType: "tech_media", language: "en", region: "overseas" };
  }
  if (normalized.includes("国内自媒体")) {
    return { category: "domestic_media", defaultType: "ai_media", language: "zh", region: "china" };
  }
  if (normalized.includes("公司播客")) {
    return { category: "podcast", defaultType: "podcast", language: "en", region: "overseas" };
  }

  return { category: "other", defaultType: "other", language: "unknown", region: "unknown" };
}

function inferType(entry: ParsedEntry, primaryUrl: string | null, contextType: SourceType): SourceType {
  const text = `${entry.section} ${entry.name} ${entry.inputType} ${entry.description} ${primaryUrl ?? ""}`.toLowerCase();

  if (contextType === "book") {
    return "book";
  }
  if (contextType === "course") {
    return "course";
  }
  if (entry.xHandleFromCell || extractXHandle(entry.links) || contextType === "x_account") {
    return "x_account";
  }
  if (text.includes("github.com")) {
    return "github";
  }
  if (text.includes("arxiv.org")) {
    return "arxiv";
  }
  if (text.includes("youtube.com") || text.includes("youtu.be")) {
    return entry.section.toLowerCase().includes("播客") ? "podcast" : "youtube";
  }
  if (text.includes("podcast") || text.includes("播客") || contextType === "podcast") {
    return "podcast";
  }
  if (text.includes("newsletter") || text.includes("substack")) {
    return "newsletter";
  }
  if (text.includes("教授") || text.includes("researcher") || text.includes("scientist") || text.includes("博士")) {
    return "researcher";
  }
  if (text.includes("vc") || text.includes("venture") || text.includes("投资")) {
    return "investor";
  }
  if (text.includes("ai媒体") || text.includes("ai media")) {
    return "ai_media";
  }
  if (text.includes("科技媒体") || text.includes("tech media") || text.includes("媒体")) {
    return "tech_media";
  }
  if (text.includes("官方") || text.includes("official")) {
    return "official_blog";
  }

  return contextType;
}

function inferCategory(entry: ParsedEntry, sourceType: SourceType, contextCategory: SourceCategory): SourceCategory {
  const text = `${entry.section} ${entry.inputType} ${entry.description}`.toLowerCase();

  if (sourceType === "x_account") {
    return "x_account";
  }
  if (sourceType === "book") {
    return "book";
  }
  if (sourceType === "podcast") {
    return "podcast";
  }
  if (sourceType === "youtube" || sourceType === "course") {
    return "video_course";
  }
  if (text.includes("research") || text.includes("论文") || text.includes("技术博客")) {
    return contextCategory === "overseas_media" ? "research_blog" : contextCategory;
  }

  return contextCategory;
}

function extractXHandle(links: LinkCandidate[]) {
  for (const link of links) {
    const handle = normalizeXHandle(link.url);
    if (handle) {
      return handle;
    }
  }
  return null;
}

function normalizeXHandle(value: string) {
  const handleMatch = value.match(/@([A-Za-z0-9_]{1,32})/);
  if (handleMatch) {
    return `@${handleMatch[1]}`;
  }

  const urlMatch = value.match(/(?:x\.com|twitter\.com)\/([A-Za-z0-9_]{1,32})/i);
  if (urlMatch) {
    return `@${urlMatch[1]}`;
  }

  return null;
}

function findFirstLink(links: LinkCandidate[], predicate: (link: LinkCandidate) => boolean) {
  return links.find(predicate)?.url ?? null;
}

function classifyLinks(entry: ParsedEntry, sourceType: SourceType) {
  const xHandle = entry.xHandleFromCell ?? extractXHandle(entry.links);
  const xUrl = xHandle ? `https://x.com/${xHandle.slice(1)}` : null;
  const rssUrl = findFirstLink(entry.links, (link) => isExplicitRssLink(link));
  const githubUrl = findFirstLink(entry.links, (link) => link.url.includes("github.com"));
  const youtubeUrl = findFirstLink(entry.links, (link) => /youtube\.com|youtu\.be/i.test(link.url));
  const podcastUrl = findFirstLink(entry.links, (link) =>
    /podcasts\.apple\.com|open\.spotify\.com|xiaoyuzhoufm\.com|podcasts\.google\.com|joincolossus\.com|thetwentyminutevc\.com/i.test(
      link.url
    )
  );

  let primaryUrl = xUrl ?? entry.links[0]?.url ?? null;
  if (sourceType === "podcast") {
    primaryUrl = findFirstLink(entry.links, (link) => /homepage|主页|网站|podcast|播客/i.test(link.label)) ?? primaryUrl;
  }
  if (sourceType === "youtube") {
    primaryUrl = youtubeUrl ?? primaryUrl;
  }
  if (sourceType === "github") {
    primaryUrl = githubUrl ?? primaryUrl;
  }

  return {
    primaryUrl,
    rssUrl,
    xHandle,
    githubUrl,
    youtubeUrl,
    podcastUrl
  };
}

function isExplicitRssLink(link: LinkCandidate) {
  if (/\brss\b/i.test(link.label)) {
    return true;
  }

  try {
    const parsed = new URL(link.url);
    if (parsed.hostname.includes("podcasts.google.com")) {
      return false;
    }
    return /\/feed\/podcast\/?$|\/rss\/?$|\/feed\/?$/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

function inferLanguage(entry: ParsedEntry, contextLanguage: Language) {
  if (contextLanguage !== "unknown") {
    return contextLanguage;
  }

  const text = `${entry.name} ${entry.description}`;
  const hasZh = /[\u3400-\u9fff]/.test(text);
  const hasEn = /[A-Za-z]/.test(text);
  if (hasZh && hasEn) {
    return "mixed";
  }
  if (hasZh) {
    return "zh";
  }
  if (hasEn) {
    return "en";
  }
  return "unknown";
}

function inferTier(sourceType: SourceType, category: SourceCategory, entry: ParsedEntry, url: string | null): Tier {
  const text = `${entry.name} ${entry.inputType} ${entry.description}`.toLowerCase();

  if (!url) {
    return "unreviewed";
  }
  if (sourceType === "github" || sourceType === "arxiv" || sourceType === "official_blog") {
    return "T1";
  }
  if (sourceType === "researcher" && /openai|anthropic|deepmind|meta|nvidia|microsoft|professor|教授|scientist|researcher|founder|ceo/.test(text)) {
    return "T1.5";
  }
  if (sourceType === "x_account") {
    if (/爆料|leak|rumor|apples/.test(text)) {
      return "T3";
    }
    if (/openai|anthropic|deepmind|meta|nvidia|microsoft|researcher|scientist|professor|教授|ceo|founder|记者|reporter/.test(text)) {
      return "T1.5";
    }
    return "T2";
  }
  if (category === "ai_specific" || sourceType === "ai_media" || sourceType === "newsletter") {
    return "T1.5";
  }
  if (sourceType === "podcast") {
    return /访谈|interview|对谈/.test(text) ? "T1.5" : "T2";
  }
  if (sourceType === "book" || sourceType === "course" || sourceType === "youtube") {
    return "T2";
  }
  if (sourceType === "investor" || category === "vc_blog" || category === "vc_partner") {
    return "T2";
  }
  if (sourceType === "tech_media") {
    return "T2";
  }

  return "unreviewed";
}

function inferWeight(tier: Tier, sourceType: SourceType, hasUrl: boolean) {
  const baseWeights: Record<Tier, number> = {
    T1: 0.9,
    "T1.5": 0.78,
    T2: 0.58,
    T3: 0.25,
    unreviewed: 0.4
  };
  let weight = baseWeights[tier];
  if (sourceType === "book" || sourceType === "course") {
    weight -= 0.08;
  }
  if (!hasUrl) {
    weight -= 0.1;
  }
  return Math.max(0, Math.min(1, Number(weight.toFixed(2))));
}

function isYoutubeChannelUrl(url: string | null) {
  if (!url) {
    return false;
  }

  try {
    const parsed = new URL(url);
    const pathParts = parsed.pathname.split("/").filter(Boolean);
    if (!parsed.hostname.includes("youtube.com")) {
      return false;
    }
    if (pathParts[0]?.startsWith("@")) {
      return pathParts.length === 1 || pathParts[1] === "videos";
    }
    return ["c", "channel", "user"].includes(pathParts[0] ?? "") && pathParts.length <= 2;
  } catch {
    return false;
  }
}

function inferCrawlMethod(sourceType: SourceType, url: string | null, rssUrl: string | null, youtubeUrl: string | null): CrawlMethod {
  if (!url) {
    return "unknown";
  }
  if (sourceType === "x_account") {
    return "x_api_future";
  }
  if (sourceType === "podcast") {
    return rssUrl ? "podcast_feed" : "manual";
  }
  if (sourceType === "youtube") {
    return isYoutubeChannelUrl(youtubeUrl ?? url) ? "youtube_feed" : "manual";
  }
  if (sourceType === "book") {
    return "no_crawl";
  }
  if (sourceType === "course") {
    return "manual";
  }
  if (sourceType === "github") {
    return "api";
  }
  if (rssUrl) {
    return "rss";
  }
  if (isLowCrawlabilityPlatform(url)) {
    return "manual";
  }
  return "html";
}

function isLowCrawlabilityPlatform(url: string | null) {
  if (!url) {
    return false;
  }

  try {
    const parsed = new URL(url);
    return [
      "bilibili.com",
      "coursera.org",
      "item.jd.com",
      "m.jd.com",
      "open.spotify.com",
      "podcasts.apple.com",
      "podcasts.google.com",
      "weibo.com",
      "xiaoyuzhoufm.com",
      "zhihu.com"
    ].some((domain) => parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

function inferStatus(sourceType: SourceType, url: string | null, crawlMethod: CrawlMethod): SourceStatus {
  if (!url) {
    return "needs_public_url";
  }
  if (sourceType === "book" || sourceType === "course") {
    return "deferred";
  }
  if (crawlMethod === "manual" || crawlMethod === "x_api_future") {
    return "trial";
  }
  return "active";
}

function inferUpdateFrequency(sourceType: SourceType, crawlMethod: CrawlMethod) {
  if (sourceType === "book" || sourceType === "course" || crawlMethod === "no_crawl") {
    return "manual" as const;
  }
  if (sourceType === "x_account") {
    return "daily" as const;
  }
  if (sourceType === "podcast" || sourceType === "youtube" || sourceType === "newsletter") {
    return "weekly" as const;
  }
  if (crawlMethod === "unknown") {
    return "unknown" as const;
  }
  return "daily" as const;
}

function inferRiskFlags(entry: ParsedEntry, source: Pick<CleanedSource, "type" | "category" | "url" | "rss_url" | "tier" | "crawl_method">) {
  const flags = new Set<string>();
  const text = `${entry.name} ${entry.inputType} ${entry.description}`.toLowerCase();

  if (!source.url) {
    flags.add("needs_public_url");
  }
  if (entry.removedLinks.some((link) => link.reason === "private_or_internal" || link.reason === "credentialed_query")) {
    flags.add("private_url_removed");
  }
  if (entry.imageLinkCount > 0 && entry.links.length === 0) {
    flags.add("image_only_contact_removed");
  }
  if (
    source.url &&
    !source.rss_url &&
    ["official_blog", "ai_media", "tech_media", "newsletter", "investor", "researcher"].includes(source.type)
  ) {
    flags.add("rss_missing");
  }
  if (source.type === "x_account") {
    flags.add("x_api_required_or_manual");
  }
  if (source.type === "book" || source.type === "course") {
    flags.add("non_news_reference");
  }
  if (/爆料|leak|rumor|八卦/.test(text)) {
    flags.add("rumor_risk");
  }
  if (/标题党|标题夸张|bait/.test(text)) {
    flags.add("title_bait_risk");
  }
  if (/商务合作|投资业务|vc|venture|fund|capital|投资人|投资机构/.test(text)) {
    flags.add("commercial_conflict_possible");
  }
  if (/付费|paywall|subscription|subscriber/.test(text)) {
    flags.add("paywall_possible");
  }
  if (source.crawl_method === "manual" || source.crawl_method === "unknown" || !source.url) {
    flags.add("low_crawlability");
  }
  if (source.tier === "unreviewed" || !source.url || entry.removedLinks.length > 0) {
    flags.add("manual_review_required");
  }

  return Array.from(flags).sort();
}

function inferTags(entry: ParsedEntry, sourceType: SourceType, category: SourceCategory) {
  const tags = new Set<string>([category.replace(/_/g, "-"), sourceType.replace(/_/g, "-")]);
  const text = `${entry.section} ${entry.inputType} ${entry.description}`.toLowerCase();
  const tagRules: Array<[RegExp, string]> = [
    [/技术|technical|research|论文|paper|mlsys|machine learning/, "technical"],
    [/产品|product|plg|growth/, "product"],
    [/访谈|interview|podcast|对谈/, "interview"],
    [/投资|vc|venture|capital|startup|创业/, "venture"],
    [/政策|policy|regulation/, "policy"],
    [/半导体|semiconductor|芯片|compute|nvidia/, "infrastructure"],
    [/agent|智能体|代理/, "agents"],
    [/课程|course|lecture|视频|youtube|bilibili/, "learning"],
    [/newsletter|substack/, "newsletter"],
    [/开源|open-source|github/, "open-source"]
  ];

  for (const [pattern, tag] of tagRules) {
    if (pattern.test(text)) {
      tags.add(tag);
    }
  }

  return Array.from(tags).sort();
}

function notesForEntry(entry: ParsedEntry, links: LinkCandidate[]) {
  const notes = [...entry.notes];
  const extraLinks = links.slice(1, 6);
  if (extraLinks.length > 0) {
    notes.push(
      `Additional public links: ${extraLinks
        .map((link) => `${link.label || "link"} ${link.url}`)
        .join("; ")}`
    );
  }
  if (entry.removedLinks.length > 0) {
    notes.push("Private, credentialed, local, or image-only links were removed during import.");
  }
  return notes.join(" ");
}

function buildSource(entry: ParsedEntry) {
  const context = sectionContext(entry.section);
  const initialLinks = classifyLinks(entry, context.defaultType);
  const sourceType = inferType(entry, initialLinks.primaryUrl, context.defaultType);
  const links = classifyLinks(entry, sourceType);
  const category = inferCategory(entry, sourceType, context.category);
  const language = inferLanguage(entry, context.language);
  const tier = inferTier(sourceType, category, entry, links.primaryUrl);
  const crawlMethod = inferCrawlMethod(sourceType, links.primaryUrl, links.rssUrl, links.youtubeUrl);
  const status = inferStatus(sourceType, links.primaryUrl, crawlMethod);
  const sourceWithoutFlags = {
    type: sourceType,
    category,
    url: links.primaryUrl,
    rss_url: links.rssUrl,
    tier,
    crawl_method: crawlMethod
  };

  const source: CleanedSource = {
    id: "",
    name: entry.name,
    name_en: null,
    type: sourceType,
    category,
    description: entry.description,
    url: links.primaryUrl,
    rss_url: links.rssUrl,
    x_handle: links.xHandle,
    github_url: links.githubUrl,
    youtube_url: links.youtubeUrl,
    podcast_url: links.podcastUrl,
    language,
    region: context.region,
    tier,
    weight: inferWeight(tier, sourceType, Boolean(links.primaryUrl)),
    crawl_method: crawlMethod,
    update_frequency: inferUpdateFrequency(sourceType, crawlMethod),
    status,
    tags: inferTags(entry, sourceType, category),
    risk_flags: inferRiskFlags(entry, sourceWithoutFlags),
    notes: notesForEntry(entry, entry.links),
    source_origin: sourceOrigin,
    created_at: generatedAt,
    updated_at: generatedAt
  };

  return source;
}

function dedupeSources(entries: ParsedEntry[]) {
  const sourceByKey = new Map<string, CleanedSource>();
  const entryByKey = new Map<CleanedSource, ParsedEntry>();
  const duplicateNotes: string[] = [];

  for (const entry of entries) {
    const source = buildSource(entry);
    const keys = dedupeKeys(source);
    const existing = keys.map((key) => sourceByKey.get(key)).find(Boolean);

    if (!existing) {
      keys.forEach((key) => sourceByKey.set(key, source));
      entryByKey.set(source, entry);
      continue;
    }

    mergeSource(existing, source, entry);
    keys.forEach((key) => sourceByKey.set(key, existing));

    duplicateNotes.push(`${source.name}: merged line ${entry.lineNumber} into line ${entryByKey.get(existing)?.lineNumber ?? "unknown"}.`);
  }

  const sources = Array.from(new Set(sourceByKey.values()));
  assignStableIds(sources);
  return { sources, duplicateNotes };
}

function mergeSource(existing: CleanedSource, incoming: CleanedSource, entry: ParsedEntry) {
  existing.tags = Array.from(new Set([...existing.tags, ...incoming.tags])).sort();
  existing.risk_flags = Array.from(new Set([...existing.risk_flags, ...incoming.risk_flags, "duplicate_possible"])).sort();
  existing.notes = normalizeWhitespace(
    `${existing.notes} Duplicate candidate merged from section "${entry.section}" at line ${entry.lineNumber}. ${incoming.notes}`
  );

  if (!existing.description && incoming.description) {
    existing.description = incoming.description;
  }
  if (!existing.url && incoming.url) {
    existing.url = incoming.url;
  }
  if (!existing.rss_url && incoming.rss_url) {
    existing.rss_url = incoming.rss_url;
  }
  if (!existing.github_url && incoming.github_url) {
    existing.github_url = incoming.github_url;
  }
  if (!existing.youtube_url && incoming.youtube_url) {
    existing.youtube_url = incoming.youtube_url;
  }
  if (!existing.podcast_url && incoming.podcast_url) {
    existing.podcast_url = incoming.podcast_url;
  }
  if (existing.crawl_method === "manual" && incoming.crawl_method !== "manual") {
    existing.crawl_method = incoming.crawl_method;
  }
  if (existing.status === "needs_public_url" && incoming.status !== "needs_public_url") {
    existing.status = incoming.status;
  }
}

function dedupeKeys(source: CleanedSource) {
  const keys = new Set<string>();
  if (source.x_handle) {
    keys.add(`x:${source.x_handle.toLowerCase()}`);
  }
  if (source.url) {
    keys.add(`url:${canonicalUrlKey(source.url)}`);
  }
  keys.add(`name:${normalizeNameKey(source.name)}|${source.type}|${source.category}`);
  return Array.from(keys);
}

function canonicalUrlKey(url: string) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const pathname = parsed.pathname.replace(/\/$/, "");
    return `${host}${pathname}${parsed.search}`.toLowerCase();
  } catch {
    return url.toLowerCase().replace(/\/$/, "");
  }
}

function normalizeNameKey(name: string) {
  return normalizeWhitespace(name).toLowerCase();
}

function assignStableIds(sources: CleanedSource[]) {
  const used = new Set<string>();
  for (const source of sources) {
    const base = source.x_handle ? `x-${source.x_handle.slice(1).toLowerCase()}` : slugify(source.name);
    let id = base;
    if (used.has(id)) {
      id = `${base}-${hashText(dedupeKeys(source).join("|"), 6)}`;
    }
    used.add(id);
    source.id = id;
  }
}

function countBy<T extends string>(values: T[]) {
  return values.reduce<Record<string, number>>((accumulator, value) => {
    accumulator[value] = (accumulator[value] ?? 0) + 1;
    return accumulator;
  }, {});
}

function buildSummary(result: ImportResult): ImportSummary {
  const warnings: string[] = [];

  if (result.auditEntries.length > 0) {
    warnings.push(`${result.auditEntries.length} table rows or lines need manual parser review.`);
  }
  if (result.duplicateNotes.length > 0) {
    warnings.push(`${result.duplicateNotes.length} duplicate candidates were merged.`);
  }
  if (result.sources.some((source) => source.status === "needs_public_url")) {
    warnings.push("Some valuable sources still need manually supplied public homepages before ingestion.");
  }

  return {
    input_file: path.relative(root, inputFile).replace(/\\/g, "/"),
    generated_at: generatedAt,
    total_sources: result.sources.length,
    by_category: countBy(result.sources.map((source) => source.category)),
    by_type: countBy(result.sources.map((source) => source.type)),
    by_tier: countBy(result.sources.map((source) => source.tier)),
    by_status: countBy(result.sources.map((source) => source.status)),
    by_crawl_method: countBy(result.sources.map((source) => source.crawl_method)),
    private_links_removed: result.privateLinksRemoved,
    needs_public_url_count: result.sources.filter((source) => source.status === "needs_public_url").length,
    skipped_count: result.auditEntries.length,
    warnings
  };
}

function markdownTableFromCounts(counts: Record<string, number>) {
  return Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `| ${key} | ${value} |`)
    .join("\n");
}

function buildAuditMarkdown(result: ImportResult, summary: ImportSummary) {
  const highPriority = result.sources
    .filter((source) => source.status === "needs_public_url")
    .slice(0, 30)
    .map((source) => `- ${source.name} (${source.category}, ${source.type}) - ${source.description || "No description"}`)
    .join("\n");

  const ingestionCandidates = result.sources
    .filter((source) =>
      Boolean(source.url) &&
      ["rss", "html", "api", "podcast_feed", "youtube_feed"].includes(source.crawl_method) &&
      source.status === "active"
    )
    .slice(0, 30)
    .map((source) => `- ${source.name} - ${source.url} (${source.crawl_method}, ${source.tier})`)
    .join("\n");

  const auditRows = result.auditEntries
    .slice(0, 40)
    .map((entry) => `- Line ${entry.lineNumber}, ${entry.section}: ${entry.reason}`)
    .join("\n");

  const duplicateRows = result.duplicateNotes.slice(0, 40).map((note) => `- ${note}`).join("\n");

  return `# AI Learning Resources Import Audit

Generated: ${generatedAt}

## Counts

- Total rows/entries parsed: ${result.parsedEntries.length}
- Total cleaned sources: ${summary.total_sources}
- Total skipped or audit-only rows: ${summary.skipped_count}
- Total private/internal/credentialed/image links removed: ${summary.private_links_removed}
- Total image links removed: ${result.imageLinksRemoved}
- Total requiring public URL: ${summary.needs_public_url_count}

## By Category

| Category | Count |
| --- | ---: |
${markdownTableFromCounts(summary.by_category)}

## By Type

| Type | Count |
| --- | ---: |
${markdownTableFromCounts(summary.by_type)}

## By Tier

| Tier | Count |
| --- | ---: |
${markdownTableFromCounts(summary.by_tier)}

## By Crawl Method

| Crawl method | Count |
| --- | ---: |
${markdownTableFromCounts(summary.by_crawl_method)}

## Deduplication Notes

${duplicateRows || "- No duplicate candidates were merged."}

## Parsing Limitations

- Markdown tables with unescaped cell separators are repaired only when the expected column count is clear.
- QR/image-only contact cells are intentionally removed and converted into manual URL-completion work.
- RSS feeds are recorded only when the input explicitly contains a public feed link.
- Platform pages that require future APIs or manual handling are kept but not treated as ready ingestion feeds.

## High-priority manual URL completion

${highPriority || "- None."}

## Likely first ingestion candidates

${ingestionCandidates || "- None."}

## Audit-only Rows

${auditRows || "- None."}
`;
}

function importResources() {
  assertInputExists();
  const markdown = fs.readFileSync(inputFile, "utf8");
  const parsed = parseMarkdown(markdown);
  const deduped = dedupeSources(parsed.parsedEntries);
  const privateLinksRemoved = parsed.parsedEntries.reduce(
    (count, entry) =>
      count + entry.removedLinks.filter((link) => link.reason !== "local_or_invalid").length,
    0
  );
  const imageLinksRemoved = parsed.parsedEntries.reduce((count, entry) => count + entry.imageLinkCount, 0);

  return {
    parsedEntries: parsed.parsedEntries,
    auditEntries: parsed.auditEntries,
    sources: deduped.sources,
    duplicateNotes: deduped.duplicateNotes,
    privateLinksRemoved,
    imageLinksRemoved
  };
}

function writeOutputs(result: ImportResult) {
  fs.mkdirSync(outputDir, { recursive: true });
  const summary = buildSummary(result);
  fs.writeFileSync(cleanedOutput, `${JSON.stringify(result.sources, null, 2)}\n`);
  fs.writeFileSync(summaryOutput, `${JSON.stringify(summary, null, 2)}\n`);
  fs.writeFileSync(auditOutput, buildAuditMarkdown(result, summary));
  return summary;
}

function main() {
  const result = importResources();
  const summary = writeOutputs(result);
  console.log(`Imported ${summary.total_sources} cleaned sources from ${summary.input_file}.`);
  console.log(`${summary.private_links_removed} private/internal/credentialed/image links removed.`);
  console.log(`${summary.needs_public_url_count} sources require public URL completion.`);
}

main();
