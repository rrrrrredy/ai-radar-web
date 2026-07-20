create extension if not exists pgcrypto;

do $$
begin
  create type app_role as enum ('admin', 'editor', 'viewer');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type source_status as enum ('active', 'paused', 'rejected', 'monitor');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type content_status as enum ('draft', 'reviewed', 'published', 'archived');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type ingestion_status as enum ('queued', 'running', 'succeeded', 'failed', 'partial');
exception
  when duplicate_object then null;
end $$;

create table if not exists users_profile (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz
);

comment on table users_profile is 'Application profile linked to Supabase Auth users.';

create table if not exists user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users_profile(id) on delete cascade,
  role app_role not null default 'viewer',
  created_at timestamptz not null default now(),
  created_by uuid references users_profile(id),
  unique (user_id, role)
);

comment on table user_roles is 'Role assignments for admin/editor/viewer access.';

create table if not exists sources (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  url text not null unique,
  type text not null,
  source_tier smallint not null default 3 check (source_tier between 1 and 4),
  language text not null default 'en',
  region text not null default 'global',
  topics text[] not null default '{}',
  status source_status not null default 'monitor',
  weight numeric(4, 3) not null default 0.500 check (weight >= 0 and weight <= 1),
  risk_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_checked_at timestamptz
);

comment on table sources is 'Public information source registry with trust tier and operational status.';

create table if not exists source_health_checks (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references sources(id) on delete cascade,
  checked_at timestamptz not null default now(),
  status text not null,
  latency_ms integer,
  http_status integer,
  item_count integer not null default 0,
  error_message text
);

create table if not exists raw_items (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references sources(id) on delete restrict,
  external_id text,
  url text not null,
  canonical_url text not null,
  title text not null,
  author text,
  published_at timestamptz,
  retrieved_at timestamptz not null default now(),
  raw_text text,
  raw_metadata jsonb not null default '{}'::jsonb,
  hash text not null,
  language text,
  unique (source_id, canonical_url),
  unique (source_id, hash)
);

comment on table raw_items is 'Raw public items before enrichment, dedupe, and scoring.';

create table if not exists radar_items (
  id uuid primary key default gen_random_uuid(),
  raw_item_id uuid not null unique references raw_items(id) on delete cascade,
  title text not null,
  summary_zh text,
  summary_en text,
  topics text[] not null default '{}',
  status content_status not null default 'draft',
  credibility_score numeric(5, 4) check (credibility_score >= 0 and credibility_score <= 1),
  novelty_score numeric(5, 4) check (novelty_score >= 0 and novelty_score <= 1),
  importance_score numeric(5, 4) check (importance_score >= 0 and importance_score <= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table radar_items is 'Normalized, summarized, and ranked items shown in the product.';

create table if not exists event_clusters (
  id uuid primary key default gen_random_uuid(),
  title_zh text not null,
  title_en text not null,
  summary_zh text,
  summary_en text,
  status content_status not null default 'draft',
  confidence text not null default 'medium' check (confidence in ('high', 'medium', 'low')),
  importance_score numeric(5, 4) check (importance_score >= 0 and importance_score <= 1),
  first_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table event_clusters is 'Real-world event groupings across multiple radar items.';

create table if not exists event_cluster_items (
  id uuid primary key default gen_random_uuid(),
  event_cluster_id uuid not null references event_clusters(id) on delete cascade,
  radar_item_id uuid not null references radar_items(id) on delete cascade,
  role text not null default 'supporting',
  created_at timestamptz not null default now(),
  unique (event_cluster_id, radar_item_id)
);

create table if not exists entities (
  id uuid primary key default gen_random_uuid(),
  type text not null check (
    type in ('company', 'person', 'model', 'product', 'paper', 'project', 'repository', 'investor', 'regulator', 'other')
  ),
  name text not null,
  aliases text[] not null default '{}',
  description text,
  homepage_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table entities is 'Canonical companies, people, models, products, papers, and projects.';

create table if not exists item_entities (
  id uuid primary key default gen_random_uuid(),
  radar_item_id uuid not null references radar_items(id) on delete cascade,
  entity_id uuid not null references entities(id) on delete cascade,
  relationship text not null default 'mentioned',
  confidence numeric(5, 4) check (confidence >= 0 and confidence <= 1),
  created_at timestamptz not null default now(),
  unique (radar_item_id, entity_id, relationship)
);

create table if not exists scores (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('radar_item', 'event_cluster', 'entity', 'source')),
  target_id uuid not null,
  score_type text not null,
  score numeric(5, 4) not null check (score >= 0 and score <= 1),
  explanation text,
  model text,
  rule_version text not null,
  created_at timestamptz not null default now()
);

comment on table scores is 'Versioned scoring records for auditability.';

create table if not exists saved_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users_profile(id) on delete cascade,
  radar_item_id uuid not null references radar_items(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, radar_item_id)
);

create table if not exists annotations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users_profile(id) on delete cascade,
  target_type text not null check (target_type in ('radar_item', 'event_cluster', 'entity', 'source')),
  target_id uuid not null,
  body text not null,
  visibility text not null default 'private' check (visibility in ('private', 'team', 'public')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status ingestion_status not null default 'queued',
  trigger text not null default 'manual' check (trigger in ('manual', 'scheduled', 'retry')),
  source_count integer not null default 0,
  raw_item_count integer not null default 0,
  radar_item_count integer not null default 0,
  error_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb
);

comment on table ingestion_runs is 'Operational logs for public source ingestion jobs.';

create table if not exists api_usage_logs (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  model text not null,
  purpose text not null,
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  cost_estimate numeric(10, 6),
  status text not null,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists system_settings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value jsonb not null default '{}'::jsonb,
  description text,
  updated_by uuid references users_profile(id),
  updated_at timestamptz not null default now()
);

create index if not exists idx_sources_status on sources(status);
create index if not exists idx_sources_type on sources(type);
create index if not exists idx_source_health_checks_source_id on source_health_checks(source_id);
create index if not exists idx_raw_items_source_id on raw_items(source_id);
create index if not exists idx_raw_items_retrieved_at on raw_items(retrieved_at desc);
create index if not exists idx_radar_items_status on radar_items(status);
create index if not exists idx_radar_items_importance on radar_items(importance_score desc);
create index if not exists idx_event_clusters_status on event_clusters(status);
create index if not exists idx_event_cluster_items_cluster on event_cluster_items(event_cluster_id);
create index if not exists idx_event_cluster_items_item on event_cluster_items(radar_item_id);
create index if not exists idx_entities_type_name on entities(type, name);
create index if not exists idx_item_entities_entity_id on item_entities(entity_id);
create index if not exists idx_scores_target on scores(target_type, target_id);
create index if not exists idx_saved_items_user_id on saved_items(user_id);
create index if not exists idx_annotations_target on annotations(target_type, target_id);
create index if not exists idx_ingestion_runs_started_at on ingestion_runs(started_at desc);
create index if not exists idx_api_usage_logs_created_at on api_usage_logs(created_at desc);
