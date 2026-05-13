# Project Brief

## Product Name

AI Industry Radar

## Target Users

- AI practitioners who need to track technical changes.
- Product managers who need market and feature awareness.
- Researchers who need signal from papers, models, and labs.
- Investors who need early views of companies, products, and adoption.
- Internal colleagues and non-technical readers who need readable summaries.
- The author, as a personal AI industry operating dashboard and writing aid.

## Daily Jobs To Be Done

- See what happened in AI today.
- Identify which events are real hotspots rather than repeated summaries.
- Track models, products, companies, papers, people, and projects.
- Turn noisy information into bilingual, source-attributed summaries.
- Prepare daily or weekly reports and writing angles.

## Product Principles

- Public information only.
- Source attribution by default.
- Facts, evidence-backed inference, and speculation must be separated.
- Official and primary sources outrank summaries and rumors.
- Bilingual output should preserve meaning, not mechanically mirror wording.
- Admin workflows should make source management and scoring transparent.

## Public and Private Boundary

The system may store public source metadata, public URLs, public article metadata, generated summaries, and user-created annotations. Secrets must stay in environment variables. Private credentials, cookies, browser profiles, intranet links, and private company URLs must not be committed or stored as seed data.

## MVP Scope

- Public homepage with ranked AI hotspots.
- Source ingestion from a small curated public source list.
- Radar item ranking, event clustering, and entity extraction.
- Bilingual summaries.
- Admin dashboard for sources, manual imports, scoring rules, and ingestion logs.
- DeepSeek-powered filtering, scoring, Q&A, and report generation.
- Email and GitHub auth.

## Non-Goals

- Building a general-purpose search engine.
- Replacing primary sources or expert judgment.
- Supporting private web scraping or credentialed browsing.
- Implementing a full social network.
- Shipping a mobile app in Phase 0.

