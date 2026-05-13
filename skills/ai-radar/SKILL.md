---
name: ai-radar
description: Embedded project-local summary of AI Radar Skill for reading public AI radar data, evaluating sources, answering AI industry questions, clustering events, and generating reports with attribution.
---

# AI Radar Skill Embedded Summary

Use this embedded skill when working inside AI Industry Radar and the task involves public AI source evaluation, radar Q&A, event clustering, report generation, or writing assistant workflows.

This is a lightweight embedded copy. The canonical skill specification is maintained in the standalone `ai-radar-skill` repository:

https://github.com/rrrrrredy/ai-radar-skill

## Core Rules

- Use public information only.
- Cite sources whenever possible.
- Separate facts, evidence-backed inference, and speculation.
- Prefer official sources, primary artifacts, reputable media, and known domain experts.
- Downgrade rumor accounts, SEO spam, title-bait, unsourced reposts, and duplicated summaries.
- Do not require a specific model provider.
- Do not use private credentials, cookies, browser profiles, intranet links, or private company URLs.

## Modes

- `radar_qa`
- `source_evaluation`
- `daily_brief`
- `weekly_brief`
- `event_clustering`
- `writing_assistant`
- `website_data_reader`

## Web Q&A Boundary

Skill Q&A and web Q&A are not the same runtime:

- Skill Q&A uses the agent's tools and public evidence available in the current agent session.
- Web Q&A will retrieve evidence from the Radar database first, then use DeepSeek answer generation in a future app phase.

For detailed routing, weighting, evidence, freshness, uncertainty, safety, and examples, use the standalone repository as the source of truth.
