-- Persist the generated public-safe event layer without replacing existing rows.

alter table public.event_clusters
  add column if not exists local_id text,
  add column if not exists canonical_title text,
  add column if not exists category text,
  add column if not exists event_score smallint,
  add column if not exists event_score_label text,
  add column if not exists score_reason text,
  add column if not exists source_count integer not null default 0,
  add column if not exists source_families text[] not null default '{}',
  add column if not exists source_tier_max text,
  add column if not exists latest_seen_at timestamptz,
  add column if not exists related_item_ids text[] not null default '{}',
  add column if not exists related_entities text[] not null default '{}',
  add column if not exists timeline jsonb not null default '[]'::jsonb,
  add column if not exists citations jsonb not null default '[]'::jsonb,
  add column if not exists caveats text[] not null default '{}';

alter table public.event_cluster_items
  add column if not exists event_local_id text,
  add column if not exists radar_item_local_id text,
  add column if not exists source_name text;

-- A non-partial unique index can be inferred by PostgREST's ON CONFLICT clause.
-- PostgreSQL still permits multiple null values for any legacy rows.
create unique index if not exists idx_event_clusters_local_id_unique
  on public.event_clusters(local_id);

create unique index if not exists idx_event_cluster_items_local_pair_unique
  on public.event_cluster_items(event_local_id, radar_item_local_id);

create index if not exists idx_event_clusters_latest_seen_at
  on public.event_clusters(latest_seen_at desc);

create index if not exists idx_event_clusters_category_score
  on public.event_clusters(category, event_score desc);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'event_clusters_event_score_check'
      and conrelid = 'public.event_clusters'::regclass
  ) then
    alter table public.event_clusters
      add constraint event_clusters_event_score_check
      check (event_score is null or event_score between 0 and 100) not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'event_clusters_source_count_check'
      and conrelid = 'public.event_clusters'::regclass
  ) then
    alter table public.event_clusters
      add constraint event_clusters_source_count_check
      check (source_count >= 0) not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'event_clusters_event_score_label_check'
      and conrelid = 'public.event_clusters'::regclass
  ) then
    alter table public.event_clusters
      add constraint event_clusters_event_score_label_check
      check (
        event_score_label is null
        or event_score_label in ('高优先级', '关注', '观察', '噪音/低相关')
      ) not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'event_clusters_timeline_array_check'
      and conrelid = 'public.event_clusters'::regclass
  ) then
    alter table public.event_clusters
      add constraint event_clusters_timeline_array_check
      check (jsonb_typeof(timeline) = 'array') not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'event_clusters_citations_array_check'
      and conrelid = 'public.event_clusters'::regclass
  ) then
    alter table public.event_clusters
      add constraint event_clusters_citations_array_check
      check (jsonb_typeof(citations) = 'array') not valid;
  end if;
end
$$;

comment on column public.event_clusters.local_id is
  'Stable event-layer identifier used as the idempotent upsert key.';
comment on column public.event_clusters.timeline is
  'Public-safe chronological evidence entries for this event.';
comment on column public.event_clusters.citations is
  'Public-safe source citations for this event.';
comment on column public.event_cluster_items.event_local_id is
  'Stable event-layer identifier corresponding to event_clusters.local_id.';
comment on column public.event_cluster_items.radar_item_local_id is
  'Public/local radar item identifier corresponding to radar_items.local_id.';
