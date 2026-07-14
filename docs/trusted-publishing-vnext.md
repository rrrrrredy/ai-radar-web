# AI Radar vNext Trusted Publishing

Date: 2026-06-30

## Goal

This milestone improves the path from evidence draft to formal public report without auto-publishing generated content.

Trusted AI Radar reports must pass through a visible chain:

```text
public evidence -> report candidate -> admin review -> reviewed report -> published report
```

The product should make it obvious why public reports may be zero and what the next operator action is.

## Changes

- `/reports` now shows publication readiness counts: formal reports, publishable candidates, items needing review, reviewed reports, published reports, and blocked drafts.
- Report cards show the next action, such as needing admin review or being ready for Save report / Publish report.
- `/admin/review` now includes a report publishing funnel with draft, needs-review, approved, publishable, published, and blocked counts.
- Cloudflare and GitHub Pages static report pages use the same formal-report vs evidence-draft language.
- Shared readiness logic lives in `lib/reports/publishing-readiness.ts` so public and admin surfaces do not reinterpret candidate/report status differently.
- `data/public-reports/` now provides a committed, public-safe, read-only reviewed report snapshot path for local/Cloudflare/GitHub fallback builds when Supabase reports are unavailable.
- `scripts/export-public-snapshot.ts` and `lib/reports/load-report-data.ts` read the same local public-report snapshots and still normalize them through public-safe allowlists.
- Dynamic `/reports` uses the read-only local public snapshot as a traceability fallback when the current radar feed does not contain the reviewed report's public `source_item_ids`.

## Safety Boundaries

- This milestone does not auto-create, auto-approve, auto-save, or auto-publish a Supabase report record.
- Admin writes remain behind role checks, audit events, and `ENABLE_ADMIN_REVIEW_WRITES=true`.
- Public reports still require `saved_report` rows with `reviewed` or `published` status.
- Approved candidates are not formal reports until the admin explicitly saves or publishes them.
- Public report Markdown still strips provider/model/API-call metadata before rendering or export.
- Local public-report snapshots must be explicit `saved_report` records with `reviewed` or `published` status, or approved candidates. They must contain only public evidence IDs, public URLs, citations, sections, caveats, and quality-gate fields.
- Local public-report snapshots are a reviewed read-only fallback source, not a browser write path and not live model generation.

## Acceptance Criteria

- Public `/reports` explains why formal reports may be empty and shows publication readiness.
- Public `/reports` and the static mirrors can render at least one formal reviewed report from `data/public-reports/` when no Supabase report exists.
- Public `/reports` can trace that local reviewed report back to public snapshot evidence and section-level entity coverage without changing the normal radar feed selection.
- Admin `/admin/review` shows the report publishing funnel and write-gate state.
- Cloudflare and GitHub Pages fallback pages do not call candidates formal reports.
- Smoke tests cover readiness classification, local public report records, report/draft wording, and metadata stripping.
- `npm run test`, `npm run lint`, `npm run typecheck`, `npm run validate:data`, `npm run sensitive:scan`, `npm run build`, and `npm run mirror:build` pass.

## Next Goal Candidate

After this milestone, the likely next goal is Data Freshness and Source Repair:

- repair high-value source failures,
- configure authenticated GitHub reads where available,
- improve Supabase availability for public report persistence,
- refresh the evidence window so the reviewed reports reflect current public AI activity rather than the last available local snapshot.
