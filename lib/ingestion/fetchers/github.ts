import { FETCH_CONFIG, fetchPublicText, hourlyFetchCacheKeyParts } from "@/lib/ingestion/config";
import type { FetcherContext, FetcherItem, SelectedSource, SourceFetchResult } from "@/lib/ingestion/types";

type GitHubRepository = {
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  pushed_at: string | null;
  updated_at: string | null;
  owner?: {
    login?: string;
  };
};

type GitHubRelease = {
  id: number;
  name: string | null;
  tag_name: string;
  html_url: string;
  body: string | null;
  published_at: string | null;
  author?: {
    login?: string;
  };
};

export async function fetchGithubSource(source: SelectedSource, context: FetcherContext): Promise<SourceFetchResult> {
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const warnings: string[] = [];
  const repo = parseGitHubRepo(source.github_url ?? source.url);
  const tokenPresent = isGitHubTokenPresent();

  if (!tokenPresent) {
    warnings.push("GITHUB_TOKEN present: no; GitHub API requests are unauthenticated and may hit public rate limits.");
  }

  if (!repo) {
    return result(source, "skipped", startedAt, started, [], "Source is not a GitHub repository URL.", warnings, {
      url: source.github_url ?? source.url,
      github_token_present: tokenPresent
    });
  }

  const repoApiUrl = `https://api.github.com/repos/${repo.owner}/${repo.name}`;
  const repoResponse = await fetchJson<GitHubRepository>(repoApiUrl, source, context, "repo");

  if (!repoResponse.ok || !repoResponse.data) {
    return result(source, "failed", startedAt, started, [], repoResponse.errorMessage ?? "GitHub repository metadata fetch failed.", warnings, {
      api_url: repoApiUrl,
      http_status: repoResponse.status,
      github_token_present: tokenPresent,
      github_rate_limit: githubRateLimitSummary(repoResponse.headers),
      cache_status: repoResponse.cached ? "hit" : context.cache.noCache ? "bypassed" : "miss",
      response_headers: repoResponse.headers
    });
  }

  const releasesUrl = `${repoApiUrl}/releases?per_page=${Math.min(context.maxItemsPerSource, 10)}`;
  const releasesResponse = await fetchJson<GitHubRelease[]>(releasesUrl, source, context, "releases");

  if (!releasesResponse.ok) {
    warnings.push(releasesResponse.errorMessage ?? "GitHub releases fetch failed; repository metadata item was kept.");
  }

  const releases = Array.isArray(releasesResponse.data) ? releasesResponse.data : [];
  const releaseItems = releases.slice(0, context.maxItemsPerSource).map((release) => releaseItem(source, release));
  const items = releaseItems.length > 0 ? releaseItems : [repositoryItem(source, repoResponse.data)];

  return result(source, "success", startedAt, started, items, undefined, warnings, {
    repo: repoResponse.data.full_name,
    repo_api_url: repoApiUrl,
    releases_api_url: releasesUrl,
    repo_http_status: repoResponse.status,
    releases_http_status: releasesResponse.status,
    github_token_present: tokenPresent,
    github_rate_limit: mergeRateLimitSummaries(repoResponse.headers, releasesResponse.headers),
    cache_status: {
      repo: repoResponse.cached ? "hit" : context.cache.noCache ? "bypassed" : "miss",
      releases: releasesResponse.cached ? "hit" : context.cache.noCache ? "bypassed" : "miss"
    },
    response_headers: repoResponse.headers
  });
}

function repositoryItem(source: SelectedSource, repo: GitHubRepository): FetcherItem {
  const title = `${repo.full_name} repository metadata`;
  const summary = repo.description ?? source.description;

  return {
    title,
    url: repo.html_url,
    author: repo.owner?.login,
    publishedAt: repo.pushed_at ?? repo.updated_at ?? undefined,
    excerpt: summary,
    summary,
    rawText: [title, summary].filter(Boolean).join("\n"),
    externalId: `github-repo:${repo.full_name}`,
    metadata: {
      item_kind: "github_repository_metadata",
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      open_issues: repo.open_issues_count
    }
  };
}

function releaseItem(source: SelectedSource, release: GitHubRelease): FetcherItem {
  const title = release.name || release.tag_name || `${source.name} release`;
  const summary = release.body?.slice(0, 1200) ?? "";

  return {
    title,
    url: release.html_url,
    author: release.author?.login,
    publishedAt: release.published_at ?? undefined,
    excerpt: summary,
    summary,
    rawText: [title, summary].filter(Boolean).join("\n"),
    externalId: `github-release:${release.id}`,
    metadata: {
      item_kind: "github_release",
      tag_name: release.tag_name
    }
  };
}

async function fetchJson<T>(url: string, source: SelectedSource, context: FetcherContext, label: string) {
  let response = await fetchGitHubText(url, source, context, label);

  for (let attempt = 1; attempt <= 2 && shouldRetryGitHubResponse(response); attempt += 1) {
    await delay(300 * attempt);
    response = await fetchGitHubText(url, source, context, label);
  }

  if (!response.ok) {
    const remaining = response.headers["x-ratelimit-remaining"];
    const reset = response.headers["x-ratelimit-reset"];
    const resetText = reset ? new Date(Number(reset) * 1000).toISOString() : "unknown";
    const rateLimitSuffix = remaining === "0" ? ` GitHub rate limit reset: ${resetText}.` : "";

    return {
      ok: false,
      status: response.status,
      headers: response.headers,
      cached: response.cached,
      errorMessage: sanitizeGitHubLogValue(`${response.errorMessage ?? "GitHub API request failed."}${rateLimitSuffix}`)
    };
  }

  try {
    return {
      ok: true,
      status: response.status,
      headers: response.headers,
      cached: response.cached,
      data: JSON.parse(response.text) as T
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      status: response.status,
      headers: response.headers,
      cached: response.cached,
      errorMessage: sanitizeGitHubLogValue(`GitHub API returned invalid JSON: ${message}`)
    };
  }
}

async function fetchGitHubText(url: string, source: SelectedSource, context: FetcherContext, label: string) {
  return fetchPublicText(url, {
    accept: "application/vnd.github+json, application/json;q=0.9",
    maxBytes: FETCH_CONFIG.maxApiBytes,
    headers: githubRequestHeaders(),
    cache: {
      keyParts: hourlyFetchCacheKeyParts(source.id, url, context.collectedAt, `github-${label}`),
      bypass: context.cache.noCache,
      stats: context.cache.stats
    }
  });
}

function githubRequestHeaders() {
  const token = githubToken();
  return {
    "x-github-api-version": "2022-11-28",
    ...(token ? { authorization: `Bearer ${token}` } : {})
  };
}

export function isGitHubTokenPresent() {
  return Boolean(githubToken());
}

function githubToken() {
  return process.env.GITHUB_TOKEN?.trim() || "";
}

function shouldRetryGitHubResponse(response: { ok: boolean; status: number; headers: Record<string, string>; cached?: boolean }) {
  if (response.ok || response.cached) {
    return false;
  }

  if (response.status === 403 && response.headers["x-ratelimit-remaining"] === "0") {
    return false;
  }

  return response.status === 0 || response.status === 408 || response.status === 429 || response.status >= 500;
}

function githubRateLimitSummary(headers: Record<string, string>) {
  const reset = headers["x-ratelimit-reset"];
  return {
    limit: headers["x-ratelimit-limit"] ?? "unknown",
    remaining: headers["x-ratelimit-remaining"] ?? "unknown",
    used: headers["x-ratelimit-used"] ?? "unknown",
    resource: headers["x-ratelimit-resource"] ?? "unknown",
    reset_at: reset ? new Date(Number(reset) * 1000).toISOString() : "unknown"
  };
}

function mergeRateLimitSummaries(...headerSets: Array<Record<string, string>>) {
  const summaries = headerSets.filter((headers) => Object.keys(headers).length > 0).map(githubRateLimitSummary);
  return summaries.length > 0 ? summaries[summaries.length - 1] : githubRateLimitSummary({});
}

function sanitizeGitHubLogValue(value: string) {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]+/g, "[github-token-redacted]")
    .replace(/\bgithub_pat_[A-Za-z0-9_]+/gi, "[github-token-redacted]");
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseGitHubRepo(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    const parsed = new URL(value);
    if (!["github.com", "www.github.com"].includes(parsed.hostname.toLowerCase())) {
      return null;
    }

    const [owner, name] = parsed.pathname.split("/").filter(Boolean);
    if (!owner || !name) {
      return null;
    }

    return { owner, name: name.replace(/\.git$/i, "") };
  } catch {
    return null;
  }
}

function result(
  source: SelectedSource,
  status: SourceFetchResult["status"],
  startedAt: string,
  started: number,
  items: FetcherItem[],
  errorMessage: string | undefined,
  warnings: string[],
  metadata: Record<string, unknown>
): SourceFetchResult {
  const endedAt = new Date().toISOString();

  return {
    sourceId: source.id,
    sourceName: source.name,
    crawlMethod: source.crawl_method,
    status,
    startedAt,
    endedAt,
    durationMs: Date.now() - started,
    itemCount: items.length,
    items,
    errorMessage,
    warnings,
    metadata
  };
}
