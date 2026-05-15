# Auth and Admin

## Providers

Use Supabase Email magic links first. GitHub OAuth is supported by the UI/code path after the provider is configured in the Supabase dashboard. Provider setup is manual; this repo does not automate Supabase dashboard changes.

The app must build when Supabase environment variables are missing. In that state, `/auth/login` shows setup guidance instead of crashing.

## WeChat Placeholder

Include a WeChat auth adapter placeholder behind `ENABLE_WECHAT_AUTH=false`. Do not fake a working WeChat integration. Enable it only when credentials and platform configuration are available.

## Roles

- `admin`: full system control.
- `editor`: source, import, annotation, and report workflows.
- `viewer`: read and save permitted radar content.

Highest role wins in the order `admin > editor > viewer`.

Set `ADMIN_EMAIL` in the server environment for the initial admin bootstrap. The admin must sign in once first so Supabase Auth has an existing user. Then run:

```bash
npm run auth:bootstrap-admin
```

The command is dry-run by default. Write mode requires `--write`, `ENABLE_SUPABASE_WRITES=true`, `SUPABASE_SERVICE_ROLE_KEY`, and `ADMIN_EMAIL`. It upserts `users_profile` and `user_roles` only for the existing Auth user; it does not create Auth users and does not print the configured email or secrets.

## Admin Areas

- Source management.
- Manual import.
- Scoring rules.
- Ingestion logs.
- User roles.
- System settings.

## Route Protection

`/admin` and `/admin/*` require an authenticated Supabase user with the `admin` role. Unauthenticated users redirect to `/auth/login?next=/admin...`; authenticated users without the admin role redirect to `/unauthorized`.

Middleware may redirect users without a Supabase session, but final admin authorization is enforced server-side in the admin layout using the Supabase user plus `user_roles`.

Public/product pages remain public. `/ask` and `/write` do not require login.

## Migration

Apply `supabase/migrations/202605140004_auth_admin_rls.sql` manually in the Supabase SQL Editor after review. It enables RLS for `users_profile` and `user_roles`, grants authenticated users read access to their own profile/role rows, revokes anon access, and keeps role mutation service-role/bootstrap-only until future workflows are explicitly implemented.
