# Auth and Admin

## First Implementation Phase

Implement Supabase Email auth and GitHub auth first.

## WeChat Placeholder

Include a WeChat auth adapter placeholder behind `ENABLE_WECHAT_AUTH=false`. Do not fake a working WeChat integration. Enable it only when credentials and platform configuration are available.

## Roles

- `admin`: full system control.
- `editor`: source, import, annotation, and report workflows.
- `viewer`: read and save permitted radar content.

## Admin Areas

- Source management.
- Manual import.
- Scoring rules.
- Ingestion logs.
- User roles.
- System settings.

