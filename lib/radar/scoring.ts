import type { RadarItem } from "@/lib/radar/types";

export function calculateCompositeScore(item: RadarItem) {
  return (
    item.credibilityScore * 0.35 +
    item.noveltyScore * 0.25 +
    item.importanceScore * 0.4
  );
}

export function getSignalLabel(score: number) {
  if (score >= 0.75) {
    return "Strong signal";
  }

  if (score >= 0.55) {
    return "Watch";
  }

  return "Low signal";
}

export function sortRadarItems(items: RadarItem[]) {
  return [...items].sort(
    (a, b) => calculateCompositeScore(b) - calculateCompositeScore(a)
  );
}
