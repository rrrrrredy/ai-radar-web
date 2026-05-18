-- Phase 9.4: Admin review workflow foundations.
-- Review and apply manually after Phase 9.5 auth/admin RLS. Do not apply from
-- validation tasks, and do not use this migration as approval for browser writes.

create extension if not exists pgcrypto;

create table if not exists public.review_tasks (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('radar_item', 'source', 'report_candidate', 'source_change', 'system')),
  target_id uuid,
  target_local_id text,
  title text not null,
  description text,
  status text not null default 'open' check (status in ('open', 'in_review', 'approved', 'rejected', 'deferred', 'resolved')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  reason text,
  assigned_to uuid references public.users_profile(id) on delete set null,
  created_by uuid references public.users_profile(id) on delete set null,
  resolved_by uuid references public.users_profile(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

comment on table public.review_tasks is
  'Generic admin/editor review queue for radar items, sources, report candidates, source changes, and system issues. Browser writes are not granted in Phase 9.4.';

create table if not exists public.source_change_requests (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.sources(id) on delete set null,
  source_slug text,
  request_type text not null check (request_type in ('add', 'update_url', 'trial', 'approve', 'reject', 'pause', 'resume')),
  proposed_url text,
  proposed_status text,
  proposed_tier text,
  rationale text,
  status text not null default 'open' check (status in ('open', 'approved', 'rejected', 'deferred')),
  created_by uuid references public.users_profile(id) on delete set null,
  reviewed_by uuid references public.users_profile(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

comment on table public.source_change_requests is
  'Review record for source add/update/trial/approve/reject/pause/resume decisions. Authenticated browser clients receive read access only through admin/editor RLS.';

create table if not exists public.report_candidates (
  id uuid primary key default gen_random_uuid(),
  report_type text not null check (report_type in ('daily', 'weekly', 'topic', 'observation')),
  title text not null,
  summary text,
  time_window_start timestamptz,
  time_window_end timestamptz,
  source_item_ids uuid[] not null default '{}'::uuid[],
  status text not null default 'draft' check (status in ('draft', 'needs_review', 'approved', 'rejected', 'published')),
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  created_by uuid references public.users_profile(id) on delete set null,
  reviewed_by uuid references public.users_profile(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

comment on table public.report_candidates is
  'Candidate daily, weekly, topic, and observation report seeds awaiting controlled review workflow implementation.';

create table if not exists public.admin_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.users_profile(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id uuid,
  target_local_id text,
  summary text,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

comment on table public.admin_audit_events is
  'Append-only-by-policy admin action log. Phase 9.4 grants no authenticated browser write access.';

create index if not exists idx_review_tasks_status_priority_created_at
  on public.review_tasks(status, priority, created_at desc);

create index if not exists idx_review_tasks_target_type_target_id
  on public.review_tasks(target_type, target_id);

create index if not exists idx_source_change_requests_status_created_at
  on public.source_change_requests(status, created_at desc);

create index if not exists idx_report_candidates_status_report_type_created_at
  on public.report_candidates(status, report_type, created_at desc);

create index if not exists idx_admin_audit_events_target_type_target_id_created_at
  on public.admin_audit_events(target_type, target_id, created_at desc);

alter table public.review_tasks enable row level security;
alter table public.source_change_requests enable row level security;
alter table public.report_candidates enable row level security;
alter table public.admin_audit_events enable row level security;

revoke all on table public.review_tasks from public;
revoke all on table public.source_change_requests from public;
revoke all on table public.report_candidates from public;
revoke all on table public.admin_audit_events from public;

grant select on table public.review_tasks to authenticated;
grant select on table public.source_change_requests to authenticated;
grant select on table public.report_candidates to authenticated;
grant select on table public.admin_audit_events to authenticated;

grant all on table public.review_tasks to service_role;
grant all on table public.source_change_requests to service_role;
grant all on table public.report_candidates to service_role;
grant all on table public.admin_audit_events to service_role;

drop policy if exists review_tasks_select_admin_editor on public.review_tasks;
create policy review_tasks_select_admin_editor
  on public.review_tasks
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.users_profile profile
      join public.user_roles role_row on role_row.user_id = profile.id
      where profile.auth_user_id = auth.uid()
        and role_row.role::text in ('admin', 'editor')
    )
  );

drop policy if exists source_change_requests_select_admin_editor on public.source_change_requests;
create policy source_change_requests_select_admin_editor
  on public.source_change_requests
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.users_profile profile
      join public.user_roles role_row on role_row.user_id = profile.id
      where profile.auth_user_id = auth.uid()
        and role_row.role::text in ('admin', 'editor')
    )
  );

drop policy if exists report_candidates_select_admin_editor on public.report_candidates;
create policy report_candidates_select_admin_editor
  on public.report_candidates
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.users_profile profile
      join public.user_roles role_row on role_row.user_id = profile.id
      where profile.auth_user_id = auth.uid()
        and role_row.role::text in ('admin', 'editor')
    )
  );

drop policy if exists admin_audit_events_select_admin_editor on public.admin_audit_events;
create policy admin_audit_events_select_admin_editor
  on public.admin_audit_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.users_profile profile
      join public.user_roles role_row on role_row.user_id = profile.id
      where profile.auth_user_id = auth.uid()
        and role_row.role::text in ('admin', 'editor')
    )
  );
