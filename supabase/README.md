# Supabase Setup

This folder contains the Phase 2 database skeleton for AI Industry Radar.

## Create a Project

1. Create a Supabase project from the Supabase dashboard.
2. Open the SQL editor.
3. Run `supabase/schema.sql`.
4. Optionally run `supabase/seed.sql` to insert synthetic demo rows.

The seed data uses only `https://example.com` demo URLs. It contains no private
sources, credentials, or internal links.

## Environment Variables

Add these values locally and in deployment environments:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ADMIN_EMAIL=luosongred@gmail.com
```

`SUPABASE_SERVICE_ROLE_KEY` is server-side only. Never expose it in browser code.

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
