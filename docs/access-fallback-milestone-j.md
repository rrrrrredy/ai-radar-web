# Milestone J Access Fallback and Public Mirror

## Production App

Vercel Production remains the full app:

https://ai-radar-web-luosongred-5507s-projects.vercel.app

Use Vercel Production for:

- Auth and `/auth/login`
- Admin review and `/admin`
- `/ask` and `/write`
- `/api/ask` and `/api/writing-assistant`
- Server actions
- Supabase write-gated operating tasks

Production must keep `ENABLE_SUPABASE_WRITES=false`. Any approved write run should use temporary process-level `ENABLE_SUPABASE_WRITES=true` only.

## Why GitHub Pages Is Read-Only

GitHub Pages cannot replace the full Next.js app because it cannot run Next.js server actions, auth callbacks, Supabase server-side authorization, API routes, or admin workflows.

The GitHub Pages mirror is only a stable public read-only fallback for data surfaces. It contains static HTML and a public-safe JSON snapshot built from Supabase public read views when available.

Expected Pages URL:

https://rrrrrredy.github.io/ai-radar-web/

Setup status:

- Workflow file: `.github/workflows/github-pages-public-mirror.yml`
- Trigger: manual `workflow_dispatch`
- If Pages is not enabled, open GitHub repo -> Settings -> Pages -> Source: GitHub Actions
- If Supabase public env is needed in GitHub Actions, configure repository variables or secrets named `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Do not hardcode them.

## Windows Hosts Pin Workaround

Some local/company DNS resolvers return non-Vercel IPs for the production `*.vercel.app` host. A narrow hosts pin to Vercel edge IP `76.76.21.21` can restore local browser access.

Diagnostics:

```powershell
nslookup ai-radar-web-luosongred-5507s-projects.vercel.app
Test-NetConnection ai-radar-web-luosongred-5507s-projects.vercel.app -Port 443
curl.exe -I --max-time 20 https://ai-radar-web-luosongred-5507s-projects.vercel.app
curl.exe -I --max-time 20 --resolve ai-radar-web-luosongred-5507s-projects.vercel.app:443:76.76.21.21 https://ai-radar-web-luosongred-5507s-projects.vercel.app
```

If normal DNS fails but the pinned curl returns `200 OK`, add only this narrow entry to `C:\Windows\System32\drivers\etc\hosts` from an elevated editor or elevated PowerShell:

```text
# Codex temporary Vercel production DNS pin for AI Industry Radar
76.76.21.21 ai-radar-web-luosongred-5507s-projects.vercel.app
```

Then flush DNS:

```powershell
ipconfig /flushdns
```

Rollback:

1. Remove the hosts comment and host line above.
2. Run `ipconfig /flushdns`.

Do not add wildcard hosts entries and do not change unrelated networking.

## Snapshot Generation

Commands:

```bash
npm run mirror:snapshot
npm run mirror:build
```

`mirror:snapshot` writes:

```text
dist/github-pages/data/radar-snapshot.json
```

`mirror:build` writes:

```text
dist/github-pages/index.html
dist/github-pages/radar/index.html
dist/github-pages/reports/index.html
dist/github-pages/assets/styles.css
dist/github-pages/data/radar-snapshot.json
```

Snapshot source priority:

1. Supabase public-safe views using public URL plus anon key.
2. Local radar output if Supabase public reads are unavailable.

The mirror excludes `raw_text`, `raw_metadata`, `model_metadata`, service-role access, private admin notes, secrets, auth, admin actions, API routes, and server actions.

## Static Mirror Contents

GitHub Pages includes:

- Homepage snapshot with visible production data counts
- Radar snapshot from public-safe rows
- Reports snapshot from public saved candidates/reports
- Data freshness and generation time
- Source/citation links
- Caveats
- Link back to Vercel Production for dynamic features

GitHub Pages does not include:

- Auth
- Admin review
- Server actions
- API generation
- Supabase writes
- Source-health writes
- Scheduled jobs
- X or WeChat crawling
