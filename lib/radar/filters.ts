import type { ConfidenceLevel, RadarItem } from "@/lib/radar/types";

export const filterOptions = {
  timeWindows: ["Last 24 hours", "Last 7 days", "Last 30 days"],
  categories: ["All", "Models", "Products", "Open source", "Papers", "Companies"],
  regions: ["All", "Global", "US", "China", "Europe"],
  sourceTiers: ["All tiers", "Tier 1", "Tier 2", "Tier 3", "Tier 4"],
  confidence: ["All", "high", "medium", "low"] satisfies Array<"All" | ConfidenceLevel>
};

export type RadarFilterInput = {
  category?: string;
  region?: string;
  confidence?: "All" | ConfidenceLevel;
};

export function filterRadarItems(items: RadarItem[], filters: RadarFilterInput) {
  return items.filter((item) => {
    const matchesCategory =
      !filters.category || filters.category === "All" || item.category === filters.category;
    const matchesRegion =
      !filters.region || filters.region === "All" || item.region === filters.region;
    const matchesConfidence =
      !filters.confidence ||
      filters.confidence === "All" ||
      item.confidence === filters.confidence;

    return matchesCategory && matchesRegion && matchesConfidence;
  });
}
