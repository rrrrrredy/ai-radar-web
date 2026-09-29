export type PublicFeedArticle = {
  id: string;
  title: string;
  title_zh?: string | null;
  url: string;
  source_name: string;
  published_at: string | null;
  processed_at?: string | null;
  overall_score?: number | null;
  source_tier?: string | null;
  [key: string]: unknown;
};

// Kept self-contained so the same tested policy can be embedded in the Pages worker.
export function selectPublicFeed(rows: PublicFeedArticle[], limit: number, now = Date.now()) {
  const day = 86_400_000;
  function urlKey(value: string) {
    try {
      const url = new URL(value);
      url.hash = "";
      for (const key of [...url.searchParams.keys()]) {
        if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
      }
      return url.toString().replace(/\/$/, "");
    } catch { return value; }
  }
  function words(value: string) {
    return value.toLowerCase().replace(/[^\p{L}\p{N}.]+/gu, " ").trim().split(/\s+/)
      .filter((word) => word.length > 2 && !/^(the|and|for|with|from|that|this|into|its|our|your|new|introducing|introduces|launches|announces|released|releases)$/.test(word));
  }
  function kind(value: string) {
    if (/\b(how to|guide|tutorial)\b|教程|指南/i.test(value)) return "guide";
    if (/\b(review|test|benchmark|evaluation)\b|评测|测试/i.test(value)) return "review";
    if (/\b(opinion|why|could|might)\b|观点|评论/i.test(value)) return "opinion";
    return "news";
  }
  function features(row: PublicFeedArticle) {
    const tokens = words(row.title);
    const numbers = (row.title.match(/\d+(?:\.\d+)*/g) || []).sort().join("|");
    const uncertain = /\b(rumou?r|reportedly|plans?|will|might|could|denies?|not|preview|beta)\b|传闻|计划|否认|预览/i.test(row.title);
    return { tokens, exact: tokens.join(" "), key: [kind(row.title), numbers, uncertain, tokens[0]].join(":") };
  }
  function sameEvent(left: PublicFeedArticle, right: PublicFeedArticle, a: ReturnType<typeof features>, b: ReturnType<typeof features>) {
    if (Math.abs(Date.parse(left.published_at || "") - Date.parse(right.published_at || "")) > 2 * day) return false;
    if (a.key !== b.key) return false;
    if (a.exact === b.exact) return true;
    if (a.tokens.length < 5 || b.tokens.length < 5) return false;
    const union = new Set([...a.tokens, ...b.tokens]);
    const overlap = new Set(a.tokens.filter((word) => b.tokens.includes(word))).size;
    return overlap >= 5 && overlap / union.size >= 0.8;
  }
  type Group = { primary: PublicFeedArticle; members: PublicFeedArticle[]; features: ReturnType<typeof features> };
  const groups: Group[] = [];
  const buckets = new Map<string, Group[]>();
  const urls = new Map<string, Group>();
  const recent = rows.filter((row) => {
    const published = Date.parse(row.published_at || "");
    return Number.isFinite(published) && published <= now + 600_000 && now - published <= 30 * day;
  }).sort((a, b) => Date.parse(b.published_at!) - Date.parse(a.published_at!));
  for (const row of recent) {
    const feature = features(row);
    const url = urlKey(row.url);
    const bucket = buckets.get(feature.key) || [];
    const group = urls.get(url) || bucket.find((entry) => sameEvent(entry.primary, row, entry.features, feature));
    if (!group) {
      const next = { primary: row, members: [row], features: feature };
      groups.push(next);
      bucket.push(next);
      buckets.set(feature.key, bucket);
      urls.set(url, next);
    }
    else {
      urls.set(url, group);
      group.members.push(row);
      if ((!group.primary.title_zh && row.title_zh) ||
          (Boolean(group.primary.title_zh) === Boolean(row.title_zh) && /^T1$/.test(row.source_tier || "") && !/^T1$/.test(group.primary.source_tier || ""))) group.primary = row;
    }
  }
  const ranked = groups.map(({ primary, members }) => {
    const sources = [...new Map(members.map((row) => [row.source_name, {
      name: row.source_name, url: row.url, published_at: row.published_at
    }])).values()];
    const rawScore = Number(primary.overall_score || 0);
    const score = rawScore > 1 ? rawScore / 100 : rawScore;
    const age = Math.max(0, now - Date.parse(primary.published_at!));
    const rank = score * 0.35 + Math.pow(0.5, age / (2 * day)) * 0.6 + Math.min(0.05, (sources.length - 1) * 0.02);
    const processed_at = members.map((row) => row.processed_at).filter((value): value is string => Boolean(value)).sort().at(-1) || primary.processed_at;
    return { item: { ...primary, processed_at, source_count: sources.length, sources }, rank };
  });
  return ranked.sort((a, b) => b.rank - a.rank || a.item.id.localeCompare(b.item.id)).slice(0, limit).map(({ item }) => item);
}
