# Phase 8.3 Design QA

Routes reviewed: `/ask`, `/write`

## Scores

| Criterion | Score | Notes |
| --- | --- | --- |
| Visual hierarchy | 4 | Both routes now place data source, time window, counts, generation mode, and caveats before synthesis or topic candidates. |
| Evidence/citation visibility | 4 | Ask facts and citations expose source/status labels; Write topic cards and the final citation section show titles, sources, URLs, dates, status, and confidence. |
| Freshness/uncertainty visibility | 4 | Evidence rails disclose time windows, freshness when available, mock/local/Supabase caveats, live-model status, needs_review, counterpoints, and missing evidence. |
| Q&A usability | 4 | The answer anatomy follows data rail, short answer, facts, inference, uncertainty, and citations. No-evidence states are explicit. |
| Writing-assistant usability | 4 | Candidate topics separate summary, why it matters, evidence, caveats, suggested angle, counterpoints, missing evidence, and citations. |
| Analyst-grade tone | 4 | Copy stays careful and source-bound, with mock/local/live boundaries stated plainly. |
| Non-generic quality | 4 | The pages read as evidence and editorial planning desks, without prompt-box hero treatment, purple gradients, glassmorphism, decorative motion, or fake charts. |
| Mobile responsiveness | 4 | Rails stack before synthesis on narrow layouts; citation URLs and long bilingual text wrap. Browser smoke should remain part of future phase QA. |
| Accessibility | 4 | Form controls have labels, statuses include text, focus-visible remains global, and sections use semantic headings. |
| Implementation risk | 4 | Changes are scoped to response UI and small shared components; API shapes, fallbacks, mock mode, and dependencies are unchanged. |

## Checklist Notes

- Data source shown: `/ask` and `/write` use the shared evidence rail with Supabase/local/mock/empty disclosure before generated output.
- Evidence/citations score: 4.
- Freshness/uncertainty score: 4.
- Q&A usability score: 4.
- Writing-assistant usability score: 4.
- Analyst-grade tone score: 4.
- Non-generic quality score: 4.
- Mobile risks: dense topic cards may become long on small screens, but the layout avoids fixed heights and keeps rails stacked above content.
- Accessibility notes: status is never color-only; citation links expose readable titles and URLs; shortcut buttons are real buttons and keep visible focus styling.
- Known limitations: writing output does not include a retrieved item count in its API contract, so the rail reports candidate topic count and citation count instead of inventing a retrieval count.
- Next recommended fix: Phase 8.4 should redesign admin operations around the same evidence/status language while making write gates denser and harder to misread.
