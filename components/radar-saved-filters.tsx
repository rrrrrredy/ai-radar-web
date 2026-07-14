"use client";

import { useEffect, useMemo, useState } from "react";

import { StatusChip } from "@/components/status-chip";

type SavedFilter = {
  createdAt: string;
  id: string;
  name: string;
  queryString: string;
};

const STORAGE_KEY = "ai-radar.saved-filters.v1";
const MAX_FILTERS = 8;

export function RadarSavedFilters({
  currentSearch,
  defaultName
}: {
  currentSearch: string;
  defaultName: string;
}) {
  const normalizedCurrentSearch = normalizeQueryString(currentSearch);
  const [filters, setFilters] = useState<SavedFilter[]>([]);
  const [name, setName] = useState(defaultName);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setFilters(readSavedFilters());
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    setName(defaultName);
  }, [defaultName]);

  const alreadySaved = useMemo(
    () => filters.some((filter) => filter.queryString === normalizedCurrentSearch),
    [filters, normalizedCurrentSearch]
  );

  function saveCurrentFilter() {
    const nextName = name.trim() || defaultName;
    const nextFilter: SavedFilter = {
      createdAt: new Date().toISOString(),
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: nextName.slice(0, 40),
      queryString: normalizedCurrentSearch
    };
    const nextFilters = [
      nextFilter,
      ...filters.filter((filter) => filter.queryString !== normalizedCurrentSearch)
    ].slice(0, MAX_FILTERS);

    setFilters(nextFilters);
    writeSavedFilters(nextFilters);
  }

  function deleteFilter(id: string) {
    const nextFilters = filters.filter((filter) => filter.id !== id);
    setFilters(nextFilters);
    writeSavedFilters(nextFilters);
  }

  function clearFilters() {
    setFilters([]);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Local browser preferences are best-effort only.
    }
  }

  return (
    <section className="rounded-lg border border-radar-line bg-radar-panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-radar-ink">保存视图</h2>
            <StatusChip label="本地" tone="neutral" value={filters.length} />
          </div>
          <p className="mt-1 text-sm leading-6 text-radar-muted">
            筛选视图只保存在当前浏览器，不会写入数据库或公开快照。
          </p>
        </div>
        {filters.length > 0 ? (
          <button
            className="rounded-md border border-radar-line bg-white px-3 py-2 text-sm font-semibold text-radar-ink hover:border-radar-risk hover:text-radar-risk"
            onClick={clearFilters}
            type="button"
          >
            清空
          </button>
        ) : null}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
        <label className="block" htmlFor="saved-filter-name">
          <span className="text-xs font-semibold uppercase tracking-normal text-radar-muted">
            视图名称
          </span>
          <input
            className="mt-2 w-full rounded-md border border-radar-line bg-white px-3 py-2 text-sm text-radar-ink outline-none focus:border-radar-evidence"
            id="saved-filter-name"
            maxLength={40}
            onChange={(event) => setName(event.target.value)}
            value={name}
          />
        </label>
        <button
          className="self-end rounded-md bg-radar-ink px-4 py-2 text-sm font-semibold text-white hover:bg-black"
          onClick={saveCurrentFilter}
          type="button"
        >
          {alreadySaved ? "更新当前视图" : "保存当前视图"}
        </button>
      </div>

      <div className="mt-4 grid gap-2">
        {!isLoaded ? (
          <p className="text-sm leading-6 text-radar-muted">正在读取本地视图。</p>
        ) : filters.length > 0 ? (
          filters.map((filter) => (
            <div
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-radar-line bg-white px-3 py-2"
              key={filter.id}
            >
              <a
                className="text-sm font-semibold text-radar-ink hover:text-radar-evidence"
                href={`/radar${filter.queryString}`}
              >
                {filter.name}
              </a>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-radar-muted">{formatDate(filter.createdAt)}</span>
                <button
                  className="rounded-md border border-radar-line px-2 py-1 text-xs font-semibold text-radar-muted hover:border-radar-risk hover:text-radar-risk"
                  onClick={() => deleteFilter(filter.id)}
                  type="button"
                >
                  删除
                </button>
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm leading-6 text-radar-muted">尚未保存筛选视图。</p>
        )}
      </div>
    </section>
  );
}

function readSavedFilters() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isSavedFilter).slice(0, MAX_FILTERS);
  } catch {
    return [];
  }
}

function writeSavedFilters(filters: SavedFilter[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(filters.slice(0, MAX_FILTERS)));
  } catch {
    // Local browser preferences are best-effort only.
  }
}

function isSavedFilter(value: unknown): value is SavedFilter {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<SavedFilter>;
  return (
    typeof candidate.createdAt === "string" &&
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.queryString === "string" &&
    candidate.queryString.length <= 500
  );
}

function normalizeQueryString(value: string) {
  if (!value) {
    return "";
  }

  const prefixed = value.startsWith("?") ? value : `?${value}`;
  const params = new URLSearchParams(prefixed);
  const normalized = params.toString();
  return normalized ? `?${normalized}` : "";
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "未知时间";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
    year: "numeric"
  }).format(date);
}
