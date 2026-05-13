# Data Model

## Role Model

- `admin`: full access to users, roles, sources, scoring, reports, settings, and ingestion logs.
- `editor`: manage sources, imports, annotations, reports, and review queues.
- `viewer`: read permitted radar content and save items.

## Auth Requirements

Implement Email and GitHub auth in the first real implementation phase. Include a WeChat auth placeholder or adapter guarded by a feature flag, but do not fake a working WeChat integration unless credentials and platform configuration are available.

## Tables and Entities

### users

Application user profile linked to Supabase Auth.

Fields: `id`, `auth_user_id`, `email`, `display_name`, `avatar_url`, `created_at`, `updated_at`, `last_seen_at`.

### user_roles

Role assignments.

Fields: `id`, `user_id`, `role`, `created_at`, `created_by`.

### sources

Tracked public information sources.

Fields: `id`, `name`, `url`, `type`, `language`, `region`, `topics`, `status`, `weight`, `risk_notes`, `created_at`, `updated_at`, `last_checked_at`.

### source_health_checks

Source availability and quality checks.

Fields: `id`, `source_id`, `checked_at`, `status`, `latency_ms`, `http_status`, `item_count`, `error_message`.

### raw_items

Raw ingested public items before enrichment.

Fields: `id`, `source_id`, `external_id`, `url`, `canonical_url`, `title`, `author`, `published_at`, `retrieved_at`, `raw_text`, `raw_metadata`, `hash`, `language`.

### radar_items

Normalized and enriched items for ranking and display.

Fields: `id`, `raw_item_id`, `title`, `summary_zh`, `summary_en`, `topics`, `status`, `credibility_score`, `novelty_score`, `importance_score`, `created_at`, `updated_at`.

### event_clusters

Groups of related radar items.

Fields: `id`, `title_zh`, `title_en`, `summary_zh`, `summary_en`, `status`, `confidence`, `importance_score`, `first_seen_at`, `updated_at`.

### event_cluster_items

Many-to-many relation between clusters and radar items.

Fields: `id`, `event_cluster_id`, `radar_item_id`, `role`, `created_at`.

### entities

Canonical entities for companies, people, models, products, papers, and projects.

Fields: `id`, `type`, `name`, `aliases`, `description`, `homepage_url`, `metadata`, `created_at`, `updated_at`.

### item_entities

Many-to-many relation between radar items and entities.

Fields: `id`, `radar_item_id`, `entity_id`, `relationship`, `confidence`, `created_at`.

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

### ingestion_runs

Operational ingestion logs.

Fields: `id`, `started_at`, `finished_at`, `status`, `trigger`, `source_count`, `raw_item_count`, `radar_item_count`, `error_count`, `metadata`.

### api_usage_logs

Model and API usage tracking.

Fields: `id`, `provider`, `model`, `purpose`, `prompt_tokens`, `completion_tokens`, `cost_estimate`, `status`, `created_at`, `metadata`.

### system_settings

Feature flags and operational settings.

Fields: `id`, `key`, `value`, `description`, `updated_by`, `updated_at`.

