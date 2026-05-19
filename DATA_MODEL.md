# Data Model

## Role Model

- `admin`: full access to users, roles, sources, scoring, reports, settings, and ingestion logs.
- `editor`: manage sources, imports, annotations, reports, and review queues.
- `viewer`: read permitted radar content and save items.

## Auth Requirements

Implement Supabase Email magic links first, with GitHub OAuth available after manual Supabase dashboard/provider setup. Include a WeChat auth placeholder or adapter guarded by a feature flag, but do not fake a working WeChat integration unless credentials and platform configuration are available.

`/admin` and `/admin/*` require an authenticated Supabase user with the `admin` role. Public/product routes, `/ask`, and `/write` remain public. Highest role resolution is `admin > editor > viewer`.

## Tables and Entities

### users

Application user profile linked to Supabase Auth.

Fields: `id`, `auth_user_id`, `email`, `display_name`, `avatar_url`, `created_at`, `updated_at`, `last_seen_at`.

RLS policy: authenticated users can read their own profile by `auth_user_id = auth.uid()`. Anon users do not receive broad table access.

### user_roles

Role assignments.

Fields: `id`, `user_id`, `role`, `created_at`, `created_by`.

RLS policy: authenticated users can read their own role rows through their linked profile. Browser clients do not receive insert, update, or delete grants for roles; bootstrap/admin mutation remains service-role/server-only.

### sources

Tracked public information sources.

Fields: `id`, `slug`, `name`, `name_en`, `url`, `type`, `category`, `description`, `rss_url`, `x_handle`, `github_url`, `youtube_url`, `podcast_url`, `language`, `region`, `topics`, `tags`, `status`, `source_tier`, `tier_label`, `weight`, `crawl_method`, `update_frequency`, `risk_flags`, `risk_notes`, `notes`, `source_origin`, `created_at`, `updated_at`, `last_checked_at`.

### source_health_checks

Source availability and quality checks.

Fields: `id`, `source_id`, `checked_at`, `checked_url`, `crawl_method`, `check_kind`, `status`, `latency_ms`, `duration_ms`, `http_status`, `item_count`, `error_message`, `metadata`.

### raw_items

Raw ingested public items before enrichment.

Fields: `id`, `local_id`, `source_id`, `ingestion_run_id`, `external_id`, `url`, `canonical_url`, `title`, `author`, `published_at`, `collected_at`, `retrieved_at`, `raw_text`, `summary`, `raw_metadata`, `hash`, `language`, `source_snapshot`, `source_tier`, `crawl_method`, `status`, `error_message`.

### radar_items

Normalized and enriched items for ranking and display.

Phase 5 local JSON fields: `id`, `raw_item_id`, `source_id`, `source_name`, `title`, `url`, `published_at`, `collected_at`, `processed_at`, `language`, `summary_zh`, `summary_en`, `ai_relevance_score`, `importance_score`, `credibility_score`, `novelty_score`, `freshness_score`, `overall_score`, `categories`, `tags`, `entities`, `source_tier`, `source_weight`, `confidence`, `status`, `exclusion_reason`, `why_it_matters`, `evidence_notes`, `model_metadata`.

Phase 7 database fields add: `local_id`, `source_id`, `source_name`, `url`, `published_at`, `collected_at`, `processed_at`, `language`, `ai_relevance_score`, `freshness_score`, `overall_score`, `categories`, `tags`, `source_tier`, `source_weight`, `confidence`, `understanding_status`, `exclusion_reason`, `why_it_matters`, `evidence_notes`, `model_metadata`, and `understanding_run_id`.

### public_radar_items

Public-safe retrieval view for server-side anon reads.

Fields: `id`, `local_id`, `raw_item_id`, `source_id`, `source_name`, `title`, `url`, `published_at`, `collected_at`, `processed_at`, `language`, `summary_zh`, `summary_en`, `topics`, `categories`, `tags`, `status`, `understanding_status`, `exclusion_reason`, `ai_relevance_score`, `importance_score`, `credibility_score`, `novelty_score`, `freshness_score`, `overall_score`, `source_tier`, `source_weight`, `confidence`, `why_it_matters`, `evidence_notes`, `created_at`, `updated_at`.

The view does not expose raw text, raw metadata, model metadata, operational logs, private notes, write access, or private/internal URLs.

### event_clusters

Groups of related radar items.

Fields: `id`, `title_zh`, `title_en`, `summary_zh`, `summary_en`, `status`, `confidence`, `importance_score`, `first_seen_at`, `updated_at`.

### event_cluster_items

Many-to-many relation between clusters and radar items.

Fields: `id`, `event_cluster_id`, `radar_item_id`, `role`, `created_at`.

### entities

Canonical entities for companies, people, models, products, papers, and projects.

Fields: `id`, `type`, `name`, `aliases`, `description`, `homepage_url`, `metadata`, `created_at`, `updated_at`.

Phase 5 local entity types include `company`, `model`, `product`, `person`, `paper`, `project`, `repository`, `investor`, `regulator`, and `other`. Phase 7 adds `entity_key` for idempotent upserts.

### item_entities

Many-to-many relation between radar items and entities.

Fields: `id`, `radar_item_id`, `entity_id`, `relationship`, `confidence`, `evidence_text`, `created_at`.

### scores

Versioned scoring records.

Fields: `id`, `target_type`, `target_id`, `score_type`, `score`, `explanation`, `model`, `rule_version`, `created_at`.

### reports

Daily, weekly, and topic reports.

Fields: `id`, `type`, `title`, `language`, `time_window_start`, `time_window_end`, `body`, `metadata`, `status`, `created_by`, `created_at`, `published_at`.

### saved_items

User-saved radar items.

Fields: `id`, `user_id`, `radar_item_id`, `created_at`.

### annotations

Human notes and review decisions.

Fields: `id`, `user_id`, `target_type`, `target_id`, `body`, `visibility`, `created_at`, `updated_at`.

### review_tasks

Generic admin/editor review queue for radar items, sources, report candidates, source changes, and system issues.

Fields: `id`, `target_type`, `target_id`, `target_local_id`, `title`, `description`, `status`, `priority`, `reason`, `assigned_to`, `created_by`, `resolved_by`, `created_at`, `updated_at`, `resolved_at`, `metadata`.

Statuses: `open`, `in_review`, `approved`, `rejected`, `deferred`, `resolved`. Priorities: `low`, `normal`, `high`, `urgent`.

RLS policy: anon receives no access. Authenticated admin/editor users can read after the Phase 9.4 migration is applied. Browser clients do not receive insert, update, or delete grants. Phase 9.4b mutations are server-side admin actions that re-check the admin role, use service-role access only after authorization, and create audit events.

### source_change_requests

Source add/update/trial/approve/reject/pause/resume review records.

Fields: `id`, `source_id`, `source_slug`, `request_type`, `proposed_url`, `proposed_status`, `proposed_tier`, `rationale`, `status`, `created_by`, `reviewed_by`, `created_at`, `updated_at`, `reviewed_at`, `metadata`.

Request types: `add`, `update_url`, `trial`, `approve`, `reject`, `pause`, `resume`. Statuses: `open`, `approved`, `rejected`, `deferred`.

RLS policy: anon receives no access. Authenticated admin/editor users can read after migration. Create/approve/reject/defer mutations are server-side, admin role-gated, sanitized, and audited.

### report_candidates

Candidate daily, weekly, topic, and observation report seeds.

Fields: `id`, `report_type`, `title`, `summary`, `time_window_start`, `time_window_end`, `source_item_ids`, `status`, `confidence`, `created_by`, `reviewed_by`, `created_at`, `updated_at`, `reviewed_at`, `metadata`.

Statuses: `draft`, `needs_review`, `approved`, `deferred`, `rejected`, `published`. Phase 9.4b can create, approve, defer, and reject candidates; it does not publish reports.

Milestone B stores generated report draft payloads in `metadata.report_draft` for report candidates. The public-safe report workflow migration exposes only display fields and `metadata.report_draft` through `public_report_candidates` and `public_reports`; it does not grant browser writes or expose admin review notes.

### admin_audit_events

Immutable-ish admin action log for controlled workflow writes and review activity.

Fields: `id`, `actor_user_id`, `action`, `target_type`, `target_id`, `target_local_id`, `summary`, `created_at`, `metadata`.

RLS policy: anon receives no access. Authenticated admin/editor users can read. Browser write grants are not provided; server-side admin actions write audit rows after role checks.

### ingestion_runs

Operational ingestion logs.

Fields: `id`, `local_run_id`, `started_at`, `finished_at`, `status`, `trigger`, `source_count`, `selected_source_count`, `raw_item_count`, `radar_item_count`, `error_count`, `duplicate_count`, `skipped_count`, `duration_ms`, `warnings`, `output_files`, `options`, `metadata`.

### understanding_runs

Operational understanding logs.

Fields: `id`, `local_run_id`, `started_at`, `ended_at`, `duration_ms`, `status`, `mode`, `input_path`, `output_path`, `raw_item_count`, `processed_count`, `included_count`, `excluded_count`, `needs_review_count`, `failed_count`, `categories_count`, `entities_count`, `api_call_count`, `estimated_token_count`, `warnings`, `errors`, `output_files`, `created_at`.

### api_usage_logs

Model and API usage tracking.

Fields: `id`, `provider`, `model`, `purpose`, `prompt_tokens`, `completion_tokens`, `cost_estimate`, `status`, `created_at`, `metadata`.

Phase 5 local understanding records store prompt version, model names, input/output hashes, API-call count, token usage when available, and error state inside each radar item's `model_metadata`. Phase 7 can persist this metadata and writes `api_usage_logs` only when a run reports actual API calls.

### system_settings

Feature flags and operational settings.

Fields: `id`, `key`, `value`, `description`, `updated_by`, `updated_at`.
