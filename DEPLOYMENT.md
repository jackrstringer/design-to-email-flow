# Deployment Guide

This app no longer depends on Lovable. It is a standard Vite + React frontend
with a Supabase backend (Postgres, Auth, Edge Functions, Vault). You can run
the whole stack locally and deploy it to infrastructure you own.

## Architecture at a glance

- **Frontend**: Vite + React + shadcn (deploy to Vercel/Netlify/Cloudflare Pages)
- **Backend**: Supabase — 56 edge functions, 37 migrations, Vault-encrypted brand secrets
- **External services**: Anthropic (slicing/copy/agents), Google Cloud Vision (OCR),
  Firecrawl (link discovery), ImageKit + Cloudinary (image CDN), OpenAI (embeddings),
  Klaviyo (per-brand keys, stored encrypted in Vault — never in env vars)

## Local development (replaces the Lovable editor)

```bash
bun install
supabase start          # full local stack in Docker: db, auth, functions, vault
supabase migration up   # idempotent; `supabase start` also applies migrations
bun run dev             # app on http://localhost:8080
```

`.env.local` (already created, gitignored) points the app at the local stack.
`.env` keeps the production values.

To exercise the AI pipeline locally, put service keys in
`supabase/functions/.env` (gitignored):

```
ANTHROPIC_API_KEY=...
GOOGLE_CLOUD_VISION_API_KEY=...
FIRECRAWL_API_KEY=...
OPENAI_API_KEY=...
IMAGEKIT_PUBLIC_KEY=...
IMAGEKIT_PRIVATE_KEY=...
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
# optional overrides
AGENT_MODEL=claude-sonnet-4-5
ALLOWED_ORIGINS=http://localhost:8080
```

Then `supabase functions serve` (the CLI loads that env file automatically).

> Local-dev quirk: the current local Postgres image (CLI 2.90) segfaults on
> permission-denied errors when a *revoked* function is called by the
> `authenticated` role. This never happens in the app's normal flows and does
> not occur on hosted Supabase. Updating the CLI (`brew upgrade supabase`)
> likely resolves it.

## Production deployment

### 1. Create your own Supabase project

1. https://supabase.com → New project.
2. `supabase login`
3. `supabase link --project-ref <YOUR_PROJECT_REF>`
4. Update `project_id` in `supabase/config.toml` to your ref.

### 2. Apply the schema

```bash
supabase db push        # applies all migrations, including vault + knowledge layer
```

### 3. Set function secrets

```bash
supabase secrets set \
  ANTHROPIC_API_KEY=... \
  GOOGLE_CLOUD_VISION_API_KEY=... \
  FIRECRAWL_API_KEY=... \
  OPENAI_API_KEY=... \
  IMAGEKIT_PUBLIC_KEY=... \
  IMAGEKIT_PRIVATE_KEY=... \
  CLOUDINARY_CLOUD_NAME=... \
  CLOUDINARY_API_KEY=... \
  CLOUDINARY_API_SECRET=... \
  ALLOWED_ORIGINS=https://yourapp.com
```

(`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are injected
automatically.)

Note: `search-clickup-for-copy` previously used Lovable's AI gateway
(`LOVABLE_API_KEY`, Gemini). If you use the ClickUp copy-search feature,
either set `LOVABLE_API_KEY` (still works while your Lovable account exists)
or migrate that one call to the Anthropic helper in `_shared/anthropic.ts`.

### 4. Deploy edge functions

```bash
supabase functions deploy
```

### 5. Deploy the frontend

Set these env vars in Vercel/Netlify and deploy (`bun run build`, output `dist/`):

```
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<anon key>
VITE_SUPABASE_PROJECT_ID=<ref>
```

SPA routing: add a rewrite of `/* → /index.html` (Vercel handles this
automatically for Vite; Netlify needs `_redirects`).

### 6. Schedule the maintenance agents

In Supabase Dashboard → Integrations → Cron (or SQL):

- `weekly-link-recrawl` — weekly. Refreshes each brand's link index.
- `brand-agent-refresh` — daily. Verifies link health, expires stale promo
  knowledge, processes the learning backlog.

Both are edge functions; schedule them with `pg_cron` + `pg_net` calling
`https://<ref>.supabase.co/functions/v1/<name>` with the service-role key in
the Authorization header, or use the Dashboard's "Schedule function" UI.

The stuck-job watchdog (`reset_stuck_processing_jobs`) is pure SQL and was
scheduled automatically by the migration when `pg_cron` is available.

## Migrating data from Lovable Cloud

Your Lovable project runs on a real Supabase instance
(`esrimjavbjdtecszxudc.supabase.co`). To move existing brands/campaigns:

1. Ask Lovable for a full database dump (or use the connection string if you
   can claim the project): `pg_dump --data-only --schema=public ...`
2. Restore into your new project **before** running the security migration is
   not necessary — the migration is idempotent, but the simplest order is:
   apply all migrations to the empty project first, then import data
   table-by-table (the old `klaviyo_api_key` / `clickup_api_key` columns no
   longer exist; re-enter each brand's keys once in Brand Settings — they go
   straight into Vault).
3. Images stay on ImageKit/Cloudinary, so campaign history keeps rendering.
4. Auth users can be exported/imported via the Supabase CLI or users can
   simply re-register (brands are keyed by user id — if users re-register
   with new ids, update `brands.user_id` accordingly).

## Security model (what changed vs the Lovable build)

| Area | Before | Now |
|---|---|---|
| Edge function auth | `verify_jwt = false` everywhere, JWTs decoded with `atob` (forgeable), ownership check skipped when no header | Platform JWT verification on all non-plugin functions + signature-verified `requireAuth` in code |
| Klaviyo/ClickUp keys | Plaintext DB columns, sent to the browser | Supabase Vault (encrypted at rest), service-role-only decryption, browser sees a boolean flag |
| Push duplication | Every push created a new template; double-clicks duplicated campaigns | In-place template updates (PATCH) + idempotency keys + push audit log |
| Klaviyo API revisions | Mixed 2025-01-15 / 2025-10-15 | Single `KLAVIYO_REVISION` constant |
| Sent-email durability | Images served from your CDNs forever | Slices mirrored into Klaviyo's image library at push time |
| HTML injection | Alt text/links/template names interpolated raw | Escaped + URL-validated; AI HTML stripped of active content |
| Rate limiting | None | Per-user fixed-window limits on expensive functions |
| Stuck jobs | Spinners forever | SQL watchdog auto-fails jobs idle >10 min |
| Error responses | Raw internal errors to the client | Sanitized messages + trace ids; full detail in server logs |

## The brand knowledge layer

- `brand_knowledge` — durable lessons per brand (voice, link rules, promos,
  past mistakes), with confidence, expiry, supersession, and optional
  embeddings for semantic recall (`match_brand_knowledge`).
- `knowledge_events` — raw corrections captured automatically when you fix a
  link or alt text during review.
- `brand-agent-learn` — distills events into lessons after each push.
- `brand-agent-qa` — runs automatically when a campaign reaches review:
  verifies every link server-side, checks promo dates against today, applies
  brand knowledge, surfaces typos — results land in `campaign_queue.qa_flags`.
- `brand-agent-refresh` — daily upkeep (see scheduling above).
