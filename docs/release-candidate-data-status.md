# Release Candidate Data Status

Generated: 2026-05-26

## What Completed

- Resumable live activation ran against 86 automated-eligible sources.
- 18 chunks completed and 18 chunks were persisted.
- DeepSeek understanding ran in bounded live mode for 296 calls.
- Supabase persistence wrote only controlled source/raw/radar/entity/score/run rows.
- Daily and weekly report candidates were regenerated and persisted through the report candidate write gate.
- Data completeness JSON was generated at `data/reports/data-completeness.latest.json` and is ignored.

## Current Counts

- sources: 312
- automated eligible: 86
- attempted: 86
- fetched: 62
- failed: 24
- blocked/manual: 226
- raw_items: 205
- radar_items: 201
- public_radar_items: 183
- included / needs_review / excluded / failed: 176 / 9 / 16 / 0

## Target Status

- preferred 200 public items: no
- minimum 180 public items: yes

Blockers for 200:

- too many manual/blocked sources: 226
- failed automated sources: 24
- GitHub unauthenticated rate limits
- 403/timeout fetch failures
- low relevance exclusions: 16
- public view gaps: 18, all from excluded rows or source risk flags

## Failure Families

- low_relevance_excluded: 16
- rate_limit: 16
- timeout: 5
- 403: 4

## Conversion

- source to raw coverage: 90.7%
- raw to radar conversion: 98.0%
- radar to public visibility: 91.0%
- public visible sources / total configured sources: 19.9%

## Safety

The audit script did not run writes. Actual writes were limited to the explicit activation/report candidate steps with process-level `ENABLE_SUPABASE_WRITES=true`.
