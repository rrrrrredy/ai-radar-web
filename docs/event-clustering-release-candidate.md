# Event Clustering Release Candidate

Generated: 2026-05-26

## Implementation

- Module: `lib/events/clustering.ts`
- Script: `npm run events:cluster`
- Output: `data/events/latest/event-layer.json` (ignored)
- Cloudflare export: `dist/cloudflare-pages/data/radar-snapshot.json`

The event layer is public-safe and derived from `public_radar_items`/retrieval-safe radar fields. It does not export `raw_text`, `raw_metadata`, `model_metadata`, private notes, raw provider payloads, or operational logs.

## Clustering Signals

- normalized title similarity
- shared entities or inferred company/model/product names
- shared category
- source family diversity
- time-window proximity
- keyword overlap
- canonical URL/domain similarity

## Over-Merge Safeguards

- different strong company/model entities are penalized unless title similarity is very high
- generic-only overlaps such as `AI`, `agent`, `model`, `大模型` are not enough
- unrelated research/product/business items require stronger title/entity/category evidence
- every singleton remains visible as an event with caveats

## Event Fields

Each public event includes:

- `event_cluster_id`
- `canonical_title`
- `summary_zh`
- `category`
- `event_score`
- `event_score_label`
- `score_reason`
- `source_count`
- `source_tier_max`
- `source_families`
- `first_seen_at`
- `latest_seen_at`
- `related_item_ids`
- `related_entities`
- `timeline`
- `citations`
- `caveats`

## Current Run

- `public_radar_items`: 183
- event clusters: 159
- multi-item merged events: 12
- average items per cluster: about 1.14
- curated events visible: yes
- timeline visible: yes
- source diversity scoring visible: yes

Backend clustering changes the UI:

- homepage first screen is `今日行业精选`
- `/radar/` defaults to `行业精选`
- raw rows are moved under `全部信号`
- `/reports/`, `/ask/`, and `/write/` show event-aware context and prompts
