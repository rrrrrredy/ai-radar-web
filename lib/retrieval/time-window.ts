import type { NormalizedQuery, ResolvedTimeWindow, RetrievalPurpose } from "@/lib/retrieval/types";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function resolveTimeWindow(
  query: NormalizedQuery,
  purpose: RetrievalPurpose,
  now = new Date()
): ResolvedTimeWindow {
  const raw = query.raw_query.toLowerCase();
  const phrase = query.time_phrase_hints[0];

  if (raw.includes("过去24小时") || raw.includes("最近24小时") || raw.includes("last 24 hours")) {
    return windowFromDuration(now, ONE_DAY_MS, phrase ?? "过去24小时", "过去 24 小时");
  }

  if (raw.includes("今天") || raw.includes("today")) {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return {
      start: start.toISOString(),
      end: now.toISOString(),
      explanation: "时间窗口解析为今天：从本地 0 点到当前证据时间。",
      matched_phrase: phrase ?? "今天"
    };
  }

  if (raw.includes("本周") || raw.includes("this week")) {
    const start = startOfWeek(now);
    return {
      start: start.toISOString(),
      end: now.toISOString(),
      explanation: "时间窗口解析为本周：从周一 0 点到当前证据时间。",
      matched_phrase: phrase ?? "本周"
    };
  }

  if (raw.includes("上周") || raw.includes("last week")) {
    const thisWeekStart = startOfWeek(now);
    const lastWeekStart = new Date(thisWeekStart.getTime() - 7 * ONE_DAY_MS);
    const lastWeekEnd = new Date(thisWeekStart.getTime() - 1);
    return {
      start: lastWeekStart.toISOString(),
      end: lastWeekEnd.toISOString(),
      explanation: "时间窗口解析为上周：周一到周日。",
      matched_phrase: phrase ?? "上周"
    };
  }

  if (raw.includes("最近一周")) {
    return windowFromDuration(now, 7 * ONE_DAY_MS, phrase ?? "最近一周", "最近一周");
  }

  if (raw.includes("最近") || raw.includes("recent")) {
    const duration = purpose === "writing_assistant" ? 7 * ONE_DAY_MS : ONE_DAY_MS;
    const label = purpose === "writing_assistant" ? "最近 7 天" : "最近 24 小时";
    return windowFromDuration(now, duration, phrase ?? "最近", label);
  }

  const defaultDuration = purpose === "writing_assistant" ? 7 * ONE_DAY_MS : ONE_DAY_MS;
  const defaultLabel = purpose === "writing_assistant" ? "默认最近 7 天" : "默认最近 24 小时";
  return windowFromDuration(now, defaultDuration, undefined, defaultLabel);
}

function windowFromDuration(
  now: Date,
  durationMs: number,
  matched_phrase: string | undefined,
  label: string
): ResolvedTimeWindow {
  return {
    start: new Date(now.getTime() - durationMs).toISOString(),
    end: now.toISOString(),
    explanation: `时间窗口解析为${label}。`,
    matched_phrase
  };
}

function startOfWeek(now: Date) {
  const start = new Date(now);
  const day = start.getDay();
  const diff = day === 0 ? 6 : day - 1;
  start.setDate(start.getDate() - diff);
  start.setHours(0, 0, 0, 0);
  return start;
}
