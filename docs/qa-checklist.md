# AI Industry Radar Design QA Checklist

Score each criterion from 1 to 5.

- 1: fails the product direction or creates user risk.
- 2: partially present but weak, confusing, or inconsistent.
- 3: acceptable baseline with visible gaps.
- 4: strong and product-appropriate.
- 5: excellent, polished, and hard to misread.

Minimum acceptance:

- No criterion below 3.
- Evidence/citation visibility must be >= 4.
- Freshness/uncertainty visibility must be >= 4.

| Criterion | Score | What To Check |
| --- | --- | --- |
| Visual hierarchy | 1-5 | The most important evidence, status, and synthesis are easy to scan in order. |
| Information architecture | 1-5 | Route, section, and component structure match the user job. |
| Evidence/citation visibility | 1-5 | Citations are visible near radar/report surfaces, not hidden as footnotes only. |
| Freshness/uncertainty visibility | 1-5 | Time windows, stale/missing data, and uncertainty are visible near claims. |
| Analyst-grade tone | 1-5 | Copy is careful, neutral, specific, and avoids hype. |
| Non-generic quality | 1-5 | The surface feels like an AI industry intelligence desk, not a generic AI SaaS page. |
| Density/scannability | 1-5 | Cards, rows, chips, and tables carry enough data without becoming noisy. |
| Mobile responsiveness | 1-5 | Nav, evidence rails, citations, tables, and bilingual text work on narrow screens. |
| Accessibility | 1-5 | Headings, labels, focus states, contrast, and non-color status labels are present. |
| Radar/entity usability | 1-5 | Evidence, tracking reasons, next questions, uncertainty, and citations are distinct. |
| Report usability | 1-5 | Formal reports and evidence drafts are separated, with quality gates and missing evidence visible. |
| Static mirror parity | 1-5 | Cloudflare/GitHub static mirrors expose homepage, radar, entity index, entity detail pages, reports, public-safe JSON, and no removed Q&A/writing routes. |
| Supabase public contract | 1-5 | `npm run supabase:public-contract` passes before Supabase-backed retrieval is treated as release-ready; `supabase_project_host_dns_not_found` and other DNS/project inactive failures are environment blockers, not public-contract passes. |
| Admin clarity | 1-5 | Read-only, dry-run, write-gated, missing config, and live/offline states are unmistakable. |
| Implementation risk | 1-5 | Changes are scoped, reusable, dependency-light, and preserve existing API/data behavior. |

## Review Notes Template

- Route or component reviewed:
- Data source shown:
- Evidence/citations score:
- Freshness/uncertainty score:
- Lowest criterion:
- Required fix before acceptance:
