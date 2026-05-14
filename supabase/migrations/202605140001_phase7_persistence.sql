-- Phase 7: Supabase persistence and source health history.
-- Apply this migration to an existing Phase 2 schema before enabling writes.

do $$
begin
  alter type source_status add value if not exists 'trial';
  alter type source_status add value if not exists 'needs_public_url';
  alter type source_status add value if not exists 'deferred';
exception
  when duplicate_object then null;
end $$;

alter table sources
  alter column url drop not null;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'sources_url_key'
      and conrelid = 'sources'::regclass
  ) then
    alter table sources drop constraint sources_url_key;
  end if;
end $$;

alter table sources
  add column if not exists name_en text,
  add column if not exists category text,
  add column if not exists description text,
  add column if not exists rss_url text,
  add column if not exists x_handle text,
  add column if not exists github_url text,
  add column if not exists youtube_url text,
  add column if not exists podcast_url text,
  add column if not exists tier_label text,
  add column if not exists crawl_method text,
  add column if not exists update_frequency text,
  add column if not exists tags text[] not null default '{}',
  add column if not exists risk_flags text[] not null default '{}',
  add column if not exists notes text,
  add column if not exists source_origin text;

create unique index if not exists idx_sources_url_not_null on sources(url) where url is not null;
create index if not exists idx_sources_crawl_method on sources(crawl_method);
create index if not exists idx_sources_status_crawl on sources(status, crawl_method);

alter table source_health_checks
  add column if not exists checked_url text,
  add column if not exists crawl_method text,
  add column if not exists check_kind text not null default 'public_endpoint',
  add column if not exists duration_ms integer,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists idx_source_health_checks_checked_at on source_health_checks(checked_at desc);
create index if not exists idx_source_health_checks_source_checked on source_health_checks(source_id, checked_at desc);
create index if not exists idx_source_health_checks_status_checked on source_health_checks(status, checked_at desc);

alter table ingestion_runs
  add column if not exists local_run_id text,
  add column if not exists duration_ms integer,
  add column if not exists selected_source_count integer,
  add column if not exists duplicate_count integer not null default 0,
  add column if not exists skipped_count integer not null default 0,
  add column if not exists warnings text[] not null default '{}',
  add column if not exists output_files jsonb not null default '{}'::jsonb,
  add column if not exists options jsonb not null default '{}'::jsonb;

create unique index if not exists idx_ingestion_runs_local_run_id on ingestion_runs(local_run_id) where local_run_id is not null;

create table if not exists understanding_runs (
  id uuid primary key default gen_random_uuid(),
  local_run_id text unique not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  duration_ms integer,
  status ingestion_status not null,
  mode text not null check (mode in ('mock', 'live')),
  input_path text not null,
  output_path text not null,
  raw_item_count integer not null default 0,
  processed_count integer not null default 0,
  included_count integer not null default 0,
  excluded_count integer not null default 0,
  needs_review_count integer not null default 0,
  failed_count integer not null default 0,
  categories_count jsonb not null default '{}'::jsonb,
  entities_count integer not null default 0,
  api_call_count integer not null default 0,
  estimated_token_count integer,
  warnings text[] not null default '{}',
  errors text[] not null default '{}',
  output_files jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_understanding_runs_started_at on understanding_runs(started_at desc);
create index if not exists idx_understanding_runs_status on understanding_runs(status);

alter table raw_items
  add column if not exists local_id text,
  add column if not exists ingestion_run_id uuid references ingestion_runs(id) on delete set null,
  add column if not exists collected_at timestamptz,
  add column if not exists source_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists source_tier text,
  add column if not exists crawl_method text,
  add column if not exists status text not null default 'collected',
  add column if not exists summary text,
  add column if not exists error_message text;

create unique index if not exists idx_raw_items_local_id on raw_items(local_id) where local_id is not null;
create index if not exists idx_raw_items_ingestion_run_id on raw_items(ingestion_run_id);
create index if not exists idx_raw_items_status on raw_items(status);
create index if not exists idx_raw_items_collected_at on raw_items(collected_at desc);

alter table radar_items
  add column if not exists local_id text,
  add column if not exists source_id uuid references sources(id) on delete set null,
  add column if not exists source_name text,
  add column if not exists url text,
  add column if not exists published_at timestamptz,
  add column if not exists collected_at timestamptz,
  add column if not exists processed_at timestamptz,
  add column if not exists language text,
  add column if not exists ai_relevance_score numeric(5, 4) check (ai_relevance_score >= 0 and ai_relevance_score <= 1),
  add column if not exists freshness_score numeric(5, 4) check (freshness_score >= 0 and freshness_score <= 1),
  add column if not exists overall_score numeric(5, 4) check (overall_score >= 0 and overall_score <= 1),
  add column if not exists categories text[] not null default '{}',
  add column if not exists tags text[] not null default '{}',
  add column if not exists source_tier text,
  add column if not exists source_weight numeric(5, 4) check (source_weight >= 0 and source_weight <= 1),
  add column if not exists confidence numeric(5, 4) check (confidence >= 0 and confidence <= 1),
  add column if not exists understanding_status text check (understanding_status in ('included', 'excluded', 'needs_review', 'failed')),
  add column if not exists exclusion_reason text,
  add column if not exists why_it_matters text,
  add column if not exists evidence_notes text[] not null default '{}',
  add column if not exists model_metadata jsonb not null default '{}'::jsonb,
  add column if not exists understanding_run_id uuid references understanding_runs(id) on delete set null;

create unique index if not exists idx_radar_items_local_id on radar_items(local_id) where local_id is not null;
create index if not exists idx_radar_items_source_id on radar_items(source_id);
create index if not exists idx_radar_items_processed_at on radar_items(processed_at desc);
create index if not exists idx_radar_items_overall_score on radar_items(overall_score desc);
create index if not exists idx_radar_items_understanding_status on radar_items(understanding_status);
create index if not exists idx_radar_items_understanding_run_id on radar_items(understanding_run_id);

do $$
declare
  constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'entities'::regclass
    and pg_get_constraintdef(oid) like '%type in (%'
  limit 1;

  if constraint_name is not null then
    execute format('alter table entities drop constraint %I', constraint_name);
  end if;
end $$;

alter table entities
  add column if not exists entity_key text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'entities_type_check'
      and conrelid = 'entities'::regclass
  ) then
    alter table entities
      add constraint entities_type_check check (
        type in ('company', 'person', 'model', 'product', 'paper', 'project', 'repository', 'investor', 'regulator', 'other')
      ) not valid;
  end if;
end $$;

update entities
set entity_key = type || ':' || lower(name)
where entity_key is null;

alter table entities
  alter column entity_key set not null;

create unique index if not exists idx_entities_entity_key on entities(entity_key);

alter table item_entities
  add column if not exists evidence_text text;

alter table scores
  add column if not exists local_score_key text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create unique index if not exists idx_scores_local_score_key on scores(local_score_key) where local_score_key is not null;
create index if not exists idx_scores_type_created_at on scores(score_type, created_at desc);
