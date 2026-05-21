# Milestone I Design Reference Notes

Date: 2026-05-21

## Pages Inspected

- `https://rrrrrredy.github.io/ai-knowledge-graph/`
- `https://rrrrrredy.github.io/ai-knowledge-graph/ranking.html`
- `https://rrrrrredy.github.io/ai-knowledge-graph/browse.html`
- `https://ai-query-hub-space.mynocode.host/`

Browser tooling was used. The AI Knowledge Graph pages loaded and were inspected. The AI Query Hub URL redirected to a private SSO login page with no public product UI visible, so only the route/access blocker could be inspected directly.

## Useful Patterns From AI Knowledge Graph

- Dense relationship-first first screen: graph canvas, node counts, relationship counts, update time, and category chips appear together.
- Search gives visible feedback (`found N`) while preserving the broader graph context.
- Category filters are prominent and fast to scan: all, company/school, product, person, technical concept, paper.
- The graph is paired with supporting modules: ranking, topic distribution, popular institutions, and node type counts.
- Ranking cards include relationship count, document count, mention count, and the documents where the entity appears.

## Useful Patterns From AI Query Hub

Direct product inspection was blocked by SSO. Based on the route name and the milestone brief, the useful pattern to adopt is a query/search hub: examples first, action-oriented prompts, concise dashboard context, and entry points into Ask/Write rather than a passive description page.

## What To Adopt

- Add a real relationship preview: connect data source, categories, sources, and saved report candidates using live Supabase counts.
- Add visible category tabs and search to `/radar`.
- Add an analyst query hub on `/`, `/ask`, and `/write` using current top categories and row counts.
- Promote daily/weekly report candidates as workflow cards before detailed report sections.
- Keep data source, status, freshness, citations, and caveats visible near every primary workflow.

## What Not To Copy

- Do not copy the reference site content or Chinese entity dataset.
- Do not make a heavy interactive graph dependency for this milestone.
- Do not hide source/caveat context behind graph interaction.
- Do not require login for the public product surface.

## Route Mapping

- `/`: Production data status, Radar Pulse, relationship preview, query hub.
- `/radar`: Category tabs, source-family filter, search box, count rail, source/category/freshness summaries.
- `/reports`: Latest daily/weekly saved candidates promoted with status, usable items, citations, caveats, and Markdown readiness.
- `/ask`: Query hub shortcuts derived from current top categories, plus data source and row-count badges.
- `/write`: Topic hub shortcuts derived from current top categories, plus data source and row-count badges.

## Reference Blockers

- `https://ai-query-hub-space.mynocode.host/` redirected to SSO in the browser session. No credentials were provided and no login flow was attempted.
- Screenshot capture for the graph site timed out in the browser tool, so this doc uses route notes rather than committed screenshots.
