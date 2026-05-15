-- Phase 9.5: Supabase Auth profile/role foundations and RLS.
-- Review and apply manually after the Phase 7 migrations. Do not apply from
-- this repository task.

create extension if not exists pgcrypto;

do $$
begin
  create type public.app_role as enum ('admin', 'editor', 'viewer');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.users_profile (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz
);

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users_profile(id) on delete cascade,
  role public.app_role not null default 'viewer',
  created_at timestamptz not null default now(),
  created_by uuid references public.users_profile(id),
  unique (user_id, role)
);

comment on table public.users_profile is
  'Application profile linked to Supabase Auth users. RLS limits authenticated users to their own profile.';

comment on table public.user_roles is
  'Role assignments for admin/editor/viewer access. Browser clients can read only their own roles.';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_profile_auth_user_id_key'
      and conrelid = 'public.users_profile'::regclass
  ) then
    alter table public.users_profile
      add constraint users_profile_auth_user_id_key unique (auth_user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_profile_email_key'
      and conrelid = 'public.users_profile'::regclass
  ) then
    alter table public.users_profile
      add constraint users_profile_email_key unique (email);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_roles_user_id_role_key'
      and conrelid = 'public.user_roles'::regclass
  ) then
    alter table public.user_roles
      add constraint user_roles_user_id_role_key unique (user_id, role);
  end if;
end $$;

create index if not exists idx_users_profile_auth_user_id
  on public.users_profile(auth_user_id);

create index if not exists idx_users_profile_email
  on public.users_profile(email);

create index if not exists idx_user_roles_user_id
  on public.user_roles(user_id);

create index if not exists idx_user_roles_role
  on public.user_roles(role);

alter table public.users_profile enable row level security;
alter table public.user_roles enable row level security;

revoke all on table public.users_profile from public;
revoke all on table public.user_roles from public;

grant select on table public.users_profile to authenticated;
grant select on table public.user_roles to authenticated;
grant all on table public.users_profile to service_role;
grant all on table public.user_roles to service_role;

drop policy if exists users_profile_select_own on public.users_profile;
create policy users_profile_select_own
  on public.users_profile
  for select
  to authenticated
  using (auth_user_id = auth.uid());

drop policy if exists user_roles_select_own on public.user_roles;
create policy user_roles_select_own
  on public.user_roles
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.users_profile profile
      where profile.id = user_roles.user_id
        and profile.auth_user_id = auth.uid()
    )
  );
