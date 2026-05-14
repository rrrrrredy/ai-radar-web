import { FETCH_CONFIG, fetchPublicText } from "@/lib/ingestion/config";
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

  if (!repo) {
    return result(source, "skipped", startedAt, started, [], "Source is not a GitHub repository URL.", warnings, {
      url: source.github_url ?? source.url
    });
  }

  const repoApiUrl = `https://api.github.com/repos/${repo.owner}/${repo.name}`;
  const repoResponse = await fetchJson<GitHubRepository>(repoApiUrl);

  if (!repoResponse.ok || !repoResponse.data) {
    return result(source, "failed", startedAt, started, [], repoResponse.errorMessage ?? "GitHub repository metadata fetch failed.", warnings, {
      api_url: repoApiUrl,
      http_status: repoResponse.status,
      response_headers: repoResponse.headers
    });
  }

  const releasesUrl = `${repoApiUrl}/releases?per_page=${Math.min(context.maxItemsPerSource, 10)}`;
  const releasesResponse = await fetchJson<GitHubRelease[]>(releasesUrl);

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

async function fetchJson<T>(url: string) {
  const response = await fetchPublicText(url, {
    accept: "application/vnd.github+json, application/json;q=0.9",
    maxBytes: FETCH_CONFIG.maxApiBytes
  });

  if (!response.ok) {
    const remaining = response.headers["x-ratelimit-remaining"];
    const reset = response.headers["x-ratelimit-reset"];
    const rateLimitSuffix = remaining === "0" ? ` GitHub rate limit reset: ${reset ?? "unknown"}.` : "";

    return {
      ok: false,
      status: response.status,
      headers: response.headers,
      errorMessage: `${response.errorMessage ?? "GitHub API request failed."}${rateLimitSuffix}`
    };
  }

  try {
    return {
      ok: true,
      status: response.status,
      headers: response.headers,
      data: JSON.parse(response.text) as T
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      status: response.status,
      headers: response.headers,
      errorMessage: `GitHub API returned invalid JSON: ${message}`
    };
  }
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
