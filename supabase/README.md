# Supabase Setup

This folder contains the Phase 2 database skeleton and later reviewable migrations for AI Industry Radar.

## Create a Project

1. Create a Supabase project from the Supabase dashboard.
2. Open the SQL editor.
3. Run `supabase/schema.sql`.
4. Optionally run `supabase/seed.sql` to insert synthetic demo rows.

The seed data uses only `https://example.com` demo URLs. It contains no private
sources, credentials, or internal links.

## Migrations

For an existing project that already has the Phase 2 schema, apply these
migrations in order:

```bash
supabase/migrations/202605140001_phase7_persistence.sql
supabase/migrations/202605140002_phase7_upsert_constraints.sql
supabase/migrations/202605140003_public_retrieval_view.sql
supabase/migrations/202605140004_auth_admin_rls.sql
supabase/migrations/202605140005_admin_review_workflows.sql
```

The first migration adds nullable source URLs, cleaned-registry fields, source
health history metadata, local artifact IDs, understanding runs, expanded
radar-item fields, entity upsert keys, and idempotent score keys. The second
migration adds the plain unique constraints required by the dry-run-first
persistence upserts. The third migration creates `public.public_radar_items`,
the only Supabase read surface used by server-side anon retrieval. Review and
apply them as ALTER migrations; do not use a full schema rerun as the migration
path.

The Phase 9.5 auth/admin migration enables RLS for `users_profile` and
`user_roles`, revokes anon access, grants authenticated users read access to
their own profile/role rows, and leaves role writes to service-role/server
bootstrap paths. Review and apply it manually; do not run it as part of app
validation.

The Phase 9.4 admin review workflow migration creates `review_tasks`,
`source_change_requests`, `report_candidates`, and `admin_audit_events` with RLS
enabled, no anon access, authenticated admin/editor read policies, and no
authenticated browser write grants. Apply it manually only after the auth/admin
RLS migration has been reviewed and applied. Phase 9.4b server actions use these
tables for controlled admin review mutations; the migration still does not
enable scheduled job, source-health, live DeepSeek, or report publish workflows.

## Admin Review Workflow Tables

`review_tasks` is the generic queue for radar items, sources, report candidates,
source changes, and system issues. `source_change_requests` tracks proposed
source add/update/trial/approve/reject/pause/resume decisions.
`report_candidates` tracks draft daily, weekly, topic, and observation seeds.
`admin_audit_events` is the audit log for controlled server-side review actions.

Browser clients receive read access only when authenticated as admin/editor by
RLS. Writes must use server-side admin role checks and audit logging. Do not
grant anon access or authenticated browser write access to these tables.

## Public Retrieval View

`public.public_radar_items` exposes public-safe radar retrieval fields only:
ids, source slug/name, title, public URL, public timestamps, language, summaries,
topics/categories/tags, public scoring fields, source tier/weight, confidence,
understanding status, exclusion reason, why-it-matters, evidence notes, and
created/updated timestamps.

It intentionally does not expose `raw_items.raw_text`, `raw_items.raw_metadata`,
`radar_items.model_metadata`, service-role keys, source-health internals,
operational logs, private notes, write access, or internal/private URLs. The
view is granted to `anon` and `authenticated`; base write tables are not granted
to anon.

## Environment Variables

Add these values locally and in deployment environments:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ADMIN_EMAIL=
ENABLE_SUPABASE_RETRIEVAL=false
ENABLE_SUPABASE_WRITES=false
```

`SUPABASE_SERVICE_ROLE_KEY` is server-side only. Never expose it in browser code.
Generic write scripts also require `--write` and `ENABLE_SUPABASE_WRITES=true`
before they use the service-role client. Admin review server actions are the
controlled exception: they require a signed-in admin role before using service
role and write an `admin_audit_events` row for each successful mutation.

## Auth Providers

Enable Email auth first. Enable GitHub OAuth in Supabase when a GitHub OAuth app
is configured.

WeChat auth is a placeholder only. Keep `ENABLE_WECHAT_AUTH=false`
unless a future phase adds a real supported provider flow and credentials.

## Role Setup

Set `ADMIN_EMAIL` in the server environment. The admin account must sign in once
through Supabase Auth before bootstrap can find it.

Run the dry-run bootstrap first:

```bash
npm run auth:bootstrap-admin
```

Write mode requires all of these gates:

```bash
ENABLE_SUPABASE_WRITES=true
SUPABASE_SERVICE_ROLE_KEY=<server-only value>
ADMIN_EMAIL=<admin email>
npm run auth:bootstrap-admin -- --write
```

The script does not create Auth users and does not print the configured email,
keys, tokens, or cookies.
