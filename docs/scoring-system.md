# Scoring System

Scoring estimates the usefulness and reliability of sources, items, and clusters.

## Item Scores

- AI relevance: whether the raw item is materially about AI.
- Credibility: source quality and evidence strength.
- Novelty: whether the item adds new information.
- Importance: likely impact on AI practitioners and industry observers.
- Freshness: recency based on publication time, or collection time with a caveat.
- Source weight: registry trust weight carried from the source system.

Phase 5 overall score:

```text
overall = relevance*0.30 + importance*0.20 + credibility*0.20 + novelty*0.15 + freshness*0.10 + source_weight*0.05
```

Inclusion thresholds:

- Relevance below `0.35`: excluded.
- Relevance from `0.35` to `0.60`: needs review.
- Relevance at or above `0.60`: included only if credibility is not low.

DeepSeek can provide scoring rationale in live mode, but code applies final scoring and inclusion.

## Cluster Scores

Cluster scores should combine representative item credibility, entity importance, source diversity, time velocity, and analyst overrides.

## Auditability

Each score should record rule version, model name when applicable, explanation, and creation time. Human overrides should be explicit and reversible.
