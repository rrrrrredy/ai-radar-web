# Milestone M Chinese Public Surface

Date: 2026-05-25

Cloudflare is the primary Chinese-first public site:

```text
https://ai-industry-radar.pages.dev
```

Current public data:

- `public_radar_items`: 187
- `report_candidates`: 20
- latest refresh: 2026-05-25T06:15:21.887Z
- latest daily candidate: quality passed, 59 usable items, 12 citations, 12 sources, 8 categories
- latest weekly candidate: quality passed, 130 usable items, 12 citations, 11 sources, 8 categories

Route checks:

- `/` shows AI 行业雷达 / 行业情报台, counts, source coverage, and real radar pulse.
- `/radar/` shows public row count, search, category/status/source-family filters, distributions, freshness, and citations.
- `/reports/` shows latest daily/weekly candidates, quality gates, caveats, missing evidence, and Markdown export.
- `/ask/` and `/write/` are static Chinese-first hubs with real category examples, source/freshness context, and caveats.
- `/data/radar-snapshot.json` includes public-safe report quality metadata and no raw/private fields.

The daily report now passes the gate, so the insufficient-data warning is not shown.
