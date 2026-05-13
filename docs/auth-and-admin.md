# Auth and Admin

## First Providers

Use Supabase Email auth first, then GitHub OAuth. Both are represented in the Phase 2 code/config skeleton.

The app must build when Supabase environment variables are missing. In that state, `/auth/login` shows setup guidance instead of crashing.

## WeChat Placeholder

Include a WeChat auth adapter placeholder behind `ENABLE_WECHAT_AUTH=false`. Do not fake a working WeChat integration. Enable it only when credentials and platform configuration are available.

## Roles

- `admin`: full system control.
- `editor`: source, import, annotation, and report workflows.
- `viewer`: read and save permitted radar content.

`ADMIN_EMAIL=luosongred@gmail.com` is the bootstrap admin email. After first sign-in, create a matching profile and assign the `admin` role in `user_roles`.

## Admin Areas

- Source management.
- Manual import.
- Scoring rules.
- Ingestion logs.
- User roles.
- System settings.

## Phase 2 Boundary

Admin pages are present as a skeleton, but hard access blocking is not enforced yet. The next phase should validate roles in server-side code and not rely on middleware alone.
