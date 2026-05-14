import type { DedupeResult, IngestionRawItem } from "@/lib/ingestion/types";

export function dedupeRawItems(items: IngestionRawItem[]): DedupeResult {
  const kept: IngestionRawItem[] = [];
  const indexByKey = new Map<string, number>();
  const duplicateKeys: string[] = [];

  for (const item of items) {
    const keys = dedupeKeys(item);
    const existingIndex = keys.map((key) => indexByKey.get(key)).find((index) => index !== undefined);

    if (existingIndex === undefined) {
      const nextIndex = kept.length;
      kept.push(item);
      keys.forEach((key) => indexByKey.set(key, nextIndex));
      continue;
    }

    duplicateKeys.push(keys[0] ?? item.id);
    const existing = kept[existingIndex];
    const replacement = chooseBetterItem(existing, item);
    kept[existingIndex] = replacement;
    dedupeKeys(replacement).forEach((key) => indexByKey.set(key, existingIndex));
  }

  return {
    items: kept,
    duplicateCount: items.length - kept.length,
    duplicateKeys
  };
}

function dedupeKeys(item: IngestionRawItem) {
  const keys = new Set<string>();
  if (item.canonical_url) {
    keys.add(`url:${item.canonical_url.toLowerCase()}`);
  }
  if (item.external_id) {
    keys.add(`external:${item.source_id}:${item.external_id.toLowerCase()}`);
  }
  if (item.content_hash) {
    keys.add(`hash:${item.content_hash}`);
  }
  keys.add(`title:${item.source_id}:${item.title.toLowerCase()}`);
  return Array.from(keys);
}

function chooseBetterItem(left: IngestionRawItem, right: IngestionRawItem) {
  const leftScore = completenessScore(left);
  const rightScore = completenessScore(right);

  if (rightScore > leftScore) {
    return right;
  }

  if (rightScore < leftScore) {
    return left;
  }

  const leftDate = Date.parse(left.published_at ?? left.collected_at);
  const rightDate = Date.parse(right.published_at ?? right.collected_at);

  return rightDate < leftDate ? right : left;
}

function completenessScore(item: IngestionRawItem) {
  return (
    item.raw_text.length +
    item.summary.length +
    (item.author ? 50 : 0) +
    (item.published_at ? 50 : 0) +
    (item.status === "collected" ? 100 : 0)
  );
}
