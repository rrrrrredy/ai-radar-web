---
name: ai-radar-web-data
description: Use when working inside the AI Industry Radar web app or repository with public website/cache data, source registries, collected items, exported datasets, or app-specific AI Radar Q&A boundaries. Trigger for maintaining the web data reader, validating public source evidence, or explaining how the app should read Radar data. Not for general AI industry tracking outside this app; use the standalone ai-radar skill instead.
---

# AI Radar Web Data Skill Embedded Summary

Use this embedded skill when working inside AI Industry Radar's web app/repository and the task involves public source registries, website/cache data, exported datasets, the web data reader, or app-specific Radar Q&A boundaries.

This is a lightweight embedded companion to the general AI Radar skill. The canonical cross-repository skill specification is maintained in the standalone `ai-radar-skill` repository:

https://github.com/rrrrrredy/ai-radar-skill

## Routing Contract

### When to use

- User is working in the AI Industry Radar web app/repository and asks how the app should read, validate, or explain its public source data.
- User asks about the web data reader, website/cache records, exported datasets, source registry quality, or app-specific Radar Q&A boundaries.

### When not to use

- User asks for a general AI industry daily brief, trend analysis, or event clustering outside this web app; use the standalone `ai-radar` skill.
- User asks to use private credentials, cookies, internal company URLs, or unsupported rumors.

### Required inputs

- Target artifact: source registry, cache data, collected item, exported dataset, or Web Q&A behavior.
- Evidence scope: public URLs or local repository data files to inspect.

### Output

- Fixed output for app work: data source inspected, evidence quality, freshness notes, boundary decision, and next maintenance action.
- Fixed output for Web Q&A boundary work: what the app can answer from Radar data, what requires live public web evidence, and what should be refused or labeled uncertain.

### Failure handling

- If required data files are missing, report the missing path instead of inventing source state.
- If evidence is stale or duplicated, mark it as low confidence and recommend refresh/deduplication.

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
