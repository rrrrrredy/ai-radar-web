import type { NormalizedQuery, ResolvedTimeWindow, RetrievalPurpose } from "@/lib/retrieval/types";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function resolveTimeWindow(
  query: NormalizedQuery,
  _purpose: RetrievalPurpose,
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

  if (raw.includes("行业精选") || raw.includes("精选") || raw.includes("重点事件") || raw.includes("important events")) {
    return windowFromDuration(now, 7 * ONE_DAY_MS, phrase ?? "行业精选", "最近 7 天的行业精选证据");
  }

  if (raw.includes("最近") || raw.includes("recent")) {
    return windowFromDuration(now, ONE_DAY_MS, phrase ?? "最近", "最近 24 小时");
  }

  return windowFromDuration(now, ONE_DAY_MS, undefined, "默认最近 24 小时");
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
