export type EvidenceFreshnessStatus = {
  ageDays: number | null;
  isStale: boolean;
  latestLabel: string;
  warning: string | null;
};

const staleThresholdDays = 2;

export function evidenceFreshnessStatus(
  latestTimestamp: string | null | undefined,
  now: Date = new Date()
): EvidenceFreshnessStatus {
  const latest = parseDate(latestTimestamp);
  if (!latest) {
    return {
      ageDays: null,
      isStale: true,
      latestLabel: "待补证据",
      warning: "当前公开内容没有可验证的发布时间；请只把页面当作历史证据索引。"
    };
  }

  const ageDays = Math.max(0, Math.floor((now.getTime() - latest.getTime()) / (24 * 60 * 60 * 1000)));
  const latestLabel = formatChineseTimestamp(latest);
  const isStale = ageDays > staleThresholdDays;

  return {
    ageDays,
    isStale,
    latestLabel,
    warning: isStale
      ? `当前公开内容发布时间最新到 ${latestLabel}，距今约 ${ageDays} 天；本页不能代表今日实时 AI 行业覆盖。`
      : null
  };
}

export function formatChineseTimestamp(date: Date) {
  return `${new Intl.DateTimeFormat("zh-CN", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    timeZone: "UTC",
    year: "numeric"
  }).format(date)} UTC`;
}

function parseDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
