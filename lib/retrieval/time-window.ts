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
    return windowFromDuration(now, ONE_DAY_MS, phrase ?? "last 24 hours", "过去24小时 / last 24 hours");
  }

  if (raw.includes("今天") || raw.includes("today")) {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return {
      start: start.toISOString(),
      end: now.toISOString(),
      explanation: "Time window resolved to today, from local midnight through now.",
      matched_phrase: phrase ?? "today"
    };
  }

  if (raw.includes("本周") || raw.includes("this week")) {
    const start = startOfWeek(now);
    return {
      start: start.toISOString(),
      end: now.toISOString(),
      explanation: "Time window resolved to this week, from Monday 00:00 local time through now.",
      matched_phrase: phrase ?? "this week"
    };
  }

  if (raw.includes("上周") || raw.includes("last week")) {
    const thisWeekStart = startOfWeek(now);
    const lastWeekStart = new Date(thisWeekStart.getTime() - 7 * ONE_DAY_MS);
    const lastWeekEnd = new Date(thisWeekStart.getTime() - 1);
    return {
      start: lastWeekStart.toISOString(),
      end: lastWeekEnd.toISOString(),
      explanation: "Time window resolved to last week, Monday through Sunday local time.",
      matched_phrase: phrase ?? "last week"
    };
  }

  if (raw.includes("最近一周")) {
    return windowFromDuration(now, 7 * ONE_DAY_MS, phrase ?? "最近一周", "最近一周");
  }

  if (raw.includes("最近") || raw.includes("recent")) {
    const duration = purpose === "writing_assistant" ? 7 * ONE_DAY_MS : ONE_DAY_MS;
    const label = purpose === "writing_assistant" ? "最近7天 / recent 7 days" : "最近24小时 / recent 24 hours";
    return windowFromDuration(now, duration, phrase ?? "recent", label);
  }

  const defaultDuration = purpose === "writing_assistant" ? 7 * ONE_DAY_MS : ONE_DAY_MS;
  const defaultLabel = purpose === "writing_assistant" ? "default last 7 days" : "default last 24 hours";
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
    explanation: `Time window resolved to ${label}.`,
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
