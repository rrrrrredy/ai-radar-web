# Phase 8.4 Design QA

Routes reviewed:

- `/admin`
- `/admin/sources`
- `/admin/ingestion`
- `/admin/scoring`
- `/admin/settings`

## Scores

| Criterion | Score | Notes |
| --- | --- | --- |
| Admin clarity | 4 | Admin pages now lead with operational state, route boundaries, data source posture, and disabled production paths instead of generic dashboard cards. |
| Write-gate clarity | 5 | Read-only, dry-run, write-gated, and disabled source-health states are visually separate; command blocks are documentation surfaces, not execution controls. |
| Density/scannability | 4 | Status cards, compact chips, dense tables, and concise rows improve scan speed without fake live metrics or charts. |
| Evidence/status visibility | 4 | StatusChip, EvidenceBadge, and DataSourceChip appear across admin surfaces for registry status, retrieval posture, source weight, confidence, review state, and feature flags. |
| Accessibility | 4 | Tables have labels, headings stay semantic, statuses include text, command blocks use code/pre surfaces, and mobile tables use horizontal overflow. |
| Mobile responsiveness | 4 | Dense tables keep minimum widths with overflow instead of broken columns; status grids collapse cleanly, though long command text should be checked on small devices. |
| Implementation risk | 4 | Changes are scoped to admin UI and small shared components. Backend behavior, API response shapes, migrations, dependencies, and write gates are unchanged. |

## Checklist Notes

- Data source shown: `/admin` and `/admin/settings` disclose Supabase/local/mock retrieval posture; `/admin/ingestion` shows local output and read-only fallback chain.
- Admin clarity score: 4.
- Write-gate clarity score: 5.
- Density/scannability score: 4.
- Evidence/status visibility score: 4.
- Accessibility score: 4.
- Mobile risks: source review, command, and settings tables are intentionally dense and depend on horizontal scrolling on narrow screens. This is acceptable for Phase 8.4 but should be browser-smoked before adding row actions.
- Known limitations: admin routes still do not enforce hard role blocking, do not execute operations, do not show live job state, and do not run source-health writes. Settings can only report booleans/placeholders available at runtime.
- Next recommended fix: Phase 9 should add scheduled job/deployment hardening and real admin review workflows while preserving the same read-only/dry-run/write-gated visual separation.
