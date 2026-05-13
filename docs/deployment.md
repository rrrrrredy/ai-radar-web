# Deployment

## Target Hosting

The target deployment path is Vercel for the Next.js app, with Supabase for database and auth.

## Environment Variables

Configure all variables from `.env.example` in the deployment environment. Do not commit real secrets.

## Scheduled Jobs

Use GitHub Actions and/or Vercel Cron for ingestion. Keep jobs idempotent and log each run.

## Pre-Deployment Checks

- Validate JSON seed data and schemas.
- Run lint and typecheck scripts.
- Confirm no `.env` files or secrets are staged.
- Confirm private source lists are not published unless intentionally protected.

