import { RADAR_CATEGORIES } from "@/lib/understanding/types";

export const UNDERSTANDING_PROMPT_FAMILY = "ai-radar-understanding";

export const INCLUSION_THRESHOLDS = {
  excludedBelow: 0.35,
  reviewBelow: 0.6,
  lowCredibilityBelow: 0.45
};

export const SCORING_FORMULA_WEIGHTS = {
  aiRelevance: 0.3,
  importance: 0.2,
  credibility: 0.2,
  novelty: 0.15,
  freshness: 0.1,
  sourceWeight: 0.05
};

export const SCORING_FORMULA_DESCRIPTION =
  "overall = relevance*0.30 + importance*0.20 + credibility*0.20 + novelty*0.15 + freshness*0.10 + source_weight*0.05";

export const UNDERSTANDING_MODEL_RULES = [
  "Use only the provided raw item fields.",
  "Do not invent launches, dates, claims, entities, funding amounts, or benchmarks.",
  "If the item only contains HTML metadata, say it is metadata-level evidence.",
  "Return strict JSON only.",
  "Final inclusion is controlled by code thresholds and scoring formula, not by the model."
];

export const CATEGORY_GUIDE = RADAR_CATEGORIES.map((category) => `- ${category}`).join("\n");
