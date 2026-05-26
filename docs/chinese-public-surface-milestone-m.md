# Milestone M Chinese Public Surface

Date: 2026-05-26

Cloudflare is the primary Chinese-first public site:

```text
https://ai-industry-radar.pages.dev
```

Current public data:

- `public_radar_items`: 183
- `event_clusters`: 159
- `report_candidates`: 22
- latest refresh: 2026-05-26T03:40:53.261+00:00
- latest daily candidate: quality passed, 61 usable items, 12 citations, 17 sources, 9 categories
- latest weekly candidate: quality passed, 125 usable items, 12 citations, 13 sources, 8 categories

Route checks:

- `/` first screen shows `今日行业精选`, counts, multi-source events, source health, coverage limits, and real radar pulse.
- `/radar/` defaults to `行业精选` and provides `全部事件`, `全部信号`, `最新时间线`, `待复核`, and `来源健康`.
- `/reports/` shows latest daily/weekly candidates, quality gates, event counts, curated events, caveats, missing evidence, and Markdown export.
- `/ask/` and `/write/` are static Chinese-first event query/writing hubs with prompts based on current clusters.
- `/data/radar-snapshot.json` includes public-safe events, report quality, source health, failure families, and no raw/private fields.

The daily report now passes the gate, so the insufficient-data warning is not shown.
