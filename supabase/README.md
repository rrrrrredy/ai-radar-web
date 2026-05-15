# Supabase Setup

This folder contains the Phase 2 database skeleton and later reviewable migrations for AI Industry Radar.

## Create a Project

1. Create a Supabase project from the Supabase dashboard.
2. Open the SQL editor.
3. Run `supabase/schema.sql`.
4. Optionally run `supabase/seed.sql` to insert synthetic demo rows.

The seed data uses only `https://example.com` demo URLs. It contains no private
sources, credentials, or internal links.

## Phase 7 Migration

For an existing project that already has the Phase 2 schema, apply these
migrations in order:

```bash
supabase/migrations/202605140001_phase7_persistence.sql
supabase/migrations/202605140002_phase7_upsert_constraints.sql
supabase/migrations/202605140003_public_retrieval_view.sql
```

The first migration adds nullable source URLs, cleaned-registry fields, source
health history metadata, local artifact IDs, understanding runs, expanded
radar-item fields, entity upsert keys, and idempotent score keys. The second
migration adds the plain unique constraints required by the dry-run-first
persistence upserts. The third migration creates `public.public_radar_items`,
the only Supabase read surface used by server-side anon retrieval. Review and
apply them as ALTER migrations; do not use a full schema rerun as the migration
path.

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
ADMIN_EMAIL=luosongred@gmail.com
ENABLE_SUPABASE_RETRIEVAL=false
ENABLE_SUPABASE_WRITES=false
```

`SUPABASE_SERVICE_ROLE_KEY` is server-side only. Never expose it in browser code.
Write scripts also require `--write` and `ENABLE_SUPABASE_WRITES=true` before
they use the service-role client.

## Auth Providers

Enable Email auth first. Enable GitHub OAuth in Supabase when a GitHub OAuth app
is configured.

WeChat auth is a placeholder only in Phase 2. Keep `ENABLE_WECHAT_AUTH=false`
unless a future phase adds a real supported provider flow and credentials.

## Role Setup

The intended bootstrap admin is:

```bash
ADMIN_EMAIL=luosongred@gmail.com
```

After the first admin signs in, create a matching `users_profile` row and assign
the `admin` role in `user_roles`. Future migrations can automate this with a
server-side bootstrap script.
