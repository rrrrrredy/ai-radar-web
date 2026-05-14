-- Phase 7.3: plain unique constraints for Supabase/PostgREST upserts.
-- Apply after 202605140001_phase7_persistence.sql.
--
-- Plain `onConflict` upserts cannot target the partial unique indexes created
-- in the first Phase 7 migration, so persisted local artifact identifiers need
-- table constraints that match the conflict target columns exactly.

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'sources_slug_key'
      and conrelid = 'public.sources'::regclass
  ) then
    alter table public.sources
      add constraint sources_slug_key unique (slug);
  end if;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ingestion_runs_local_run_id_key'
      and conrelid = 'public.ingestion_runs'::regclass
  ) then
    alter table public.ingestion_runs
      add constraint ingestion_runs_local_run_id_key unique (local_run_id);
  end if;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'understanding_runs_local_run_id_key'
      and conrelid = 'public.understanding_runs'::regclass
  ) then
    alter table public.understanding_runs
      add constraint understanding_runs_local_run_id_key unique (local_run_id);
  end if;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'raw_items_local_id_key'
      and conrelid = 'public.raw_items'::regclass
  ) then
    alter table public.raw_items
      add constraint raw_items_local_id_key unique (local_id);
  end if;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'radar_items_local_id_key'
      and conrelid = 'public.radar_items'::regclass
  ) then
    alter table public.radar_items
      add constraint radar_items_local_id_key unique (local_id);
  end if;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'entities_entity_key_key'
      and conrelid = 'public.entities'::regclass
  ) then
    if exists (
      select 1
      from pg_class
      join pg_index on pg_index.indexrelid = pg_class.oid
      join pg_namespace on pg_namespace.oid = pg_class.relnamespace
      where pg_namespace.nspname = 'public'
        and pg_class.relname = 'idx_entities_entity_key'
        and pg_class.relkind = 'i'
        and pg_index.indrelid = 'public.entities'::regclass
        and pg_index.indisunique
        and pg_index.indpred is null
    ) then
      alter table public.entities
        add constraint entities_entity_key_key unique using index idx_entities_entity_key;
    else
      alter table public.entities
        add constraint entities_entity_key_key unique (entity_key);
    end if;
  end if;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'item_entities_radar_item_id_entity_id_relationship_key'
      and conrelid = 'public.item_entities'::regclass
  ) then
    alter table public.item_entities
      add constraint item_entities_radar_item_id_entity_id_relationship_key
      unique (radar_item_id, entity_id, relationship);
  end if;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'scores_local_score_key_key'
      and conrelid = 'public.scores'::regclass
  ) then
    alter table public.scores
      add constraint scores_local_score_key_key unique (local_score_key);
  end if;
exception
  when duplicate_object then null;
end $$;
