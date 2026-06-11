# Sendr (design-to-email-flow)

Jack Stringer's (Redwood agency) SaaS: slices email campaign designs sent from
Figma, QAs them against per-brand "memory", assigns links/alt text, and builds
them in Klaviyo as editable templates/campaigns. Originally Lovable-built; now
fully self-hosted. Jack is an email marketer, not a developer — explain in
product terms, handle all infra for him, always verify changes visually
against real data before claiming done.

## Stack & where things live

- **Frontend**: Vite + React + shadcn + TanStack Query (`src/`). Port 8080.
- **Backend**: Supabase — 58 Deno edge functions (`supabase/functions/`),
  37+ migrations (`supabase/migrations/`), Vault-encrypted brand API keys.
- **Design system** (2026-06-11, Jack's call): stock shadcn/ui, LIGHT ONLY,
  zinc palette, Inter, small dense type (13px body), 6px radius, hairline
  shadows. Monochrome — the old brand violet is retired; `--brand` is
  aliased to `--primary` (carbon) for legacy classnames. Functional
  green/amber/red/blue tints carry status meaning only. Jack's words:
  "small text by default, sophisticated feel", nothing "cartoonish" (no
  big rounded pills, bouncy buttons, oversized hero numbers). Primitives
  in `src/components/ui/button|card|input|select.tsx` (13px, h-8 controls).
  `src/lib/agentMeta.ts` = agent/knowledge/QA badge metadata.
  `DESIGN_SPEC.md` = older contract, superseded by this.
- **Key surfaces**: `src/pages/CampaignQueue.tsx` + `components/queue/*`
  (QueueTable = Airtable-style grid: stretch-to-fill columns, never shrink
  below defaults, ≤5% squeeze tolerance, expanded panel pins to viewport via
  ResizeObserver). `src/pages/BrandKnowledge.tsx` = brand-memory wiki +
  question survey. `src/pages/Analytics.tsx` = team time-saved analytics.
- **Agents** (edge functions writing to `brand_knowledge`/`agent_runs`):
  `brand-agent-learn` (corrections → lessons), `brand-agent-qa` (pre-push
  review → `campaign_queue.qa_flags`), `brand-agent-refresh` (daily upkeep),
  `brand-agent-research` (mines last 20 sent Klaviyo campaigns; can file
  `question` kind entries the user answers in the Knowledge tab).
- **Figma plugin**: `figma-plugin/` (manifest+code.js+ui.html, no build step).
  Installed in Jack's Figma as dev plugin "Sendr — Design to Email".
- **Pipeline**: figma-ingest → process-campaign-queue (orchestrator) →
  auto-slice-v2 (Vision+Claude) → link matching → copy gen → brand-agent-qa →
  ready_for_review → push-to-klaviyo (vault key, in-place template updates,
  idempotency, image mirroring to Klaviyo).

## Running locally

```bash
bun install
supabase start            # Docker stack; migrations auto-apply
bun run dev               # app on :8080 (.env.local → local stack; .env → prod values)
supabase functions serve  # edge functions (secrets in supabase/functions/.env, gitignored)
```

Local test login: `e2e@test.com` / `test12345` (owns "TestBrand" + "QA Test
Campaign"). Regenerate DB types after migrations:
`supabase gen types typescript --local > src/integrations/supabase/types.ts`.

## Production (Jack owns all of it)

- **App**: https://sendr-sooty.vercel.app (Vercel project `sendr`, team
  jackstringer-redwoodsos-projects).
- **Supabase**: project `ckpnvxlyvwzhnfzrfpnf` ("sendr-production", Redwood
  org). DB password in `.supabase-db-password`; Jack's login + Figma plugin
  token in `.prod-login.txt` (both gitignored).
- **Deploy**: `supabase db push`, `supabase functions deploy [names]`, and
  **frontend MUST use remote build** (`vercel --prod`) — local prebuilt
  deploys bake no env vars → white screen. Git author must be
  jackstringer@redwood.so (repo git config set) or Vercel blocks the deploy.
- **CRITICAL platform quirk**: new-format Supabase projects inject
  `SUPABASE_SERVICE_ROLE_KEY` as `sb_secret_…` (not a JWT); the function
  gateway's verify_jwt rejects it on internal function→function calls. All
  internal fetches use `SERVICE_ROLE_JWT` secret (legacy JWT) first —
  preserve this pattern in any new internal call.
- Cron (pg_cron on prod): stuck-job watchdog 5min, brand-agent-refresh daily,
  weekly-link-recrawl Mondays.

## Testing — Jack's explicit instructions

- **Use Jack's real production account as the test space** (his words). The
  eskiin brand is fully configured there (Klaviyo key, footer, real history).
- **Default test campaign file**: `test-assets/eskiin-filtered-water.png`
  (600×4360, a real eskiin send). Jack also designated the eskiin "Summer
  Glow Sale" campaign as a canonical test design.
- Always verify UI changes in the browser preview at realistic widths AND
  against real data — single skinny test campaigns hide layout bugs. Jack
  screenshots what's broken; treat his screenshots as the source of truth.
- **Never leave background watcher loops running** — Jack noticed 8 stray
  deploy-poll tasks once. Deploy, check once, move on.

## Where we left off (2026-06-11, evening)

Shipped and verified in production:
- Brand-memory wiki + research dedupe deployed; eskiin `brand_knowledge`
  dupes from the double-run cleaned (10 clean rows; 1 open question — the
  "RW |" naming one. Jack answered the emoji question live: "Testing /
  evolving", now a manual fact).
- Queue expanded-panel fixes: panel pins to the visible viewport (the
  visibleWidth observer missed the empty→populated mount; an inner
  overflow-hidden also broke position:sticky). Contract per Jack: rows may
  grow past the screen and scroll side-to-side (Airtable); the expanded
  flyout must NEVER scroll sideways. Do not auto-squeeze his column widths.
- Stale "missing footer" QA flag explained: pre-05:40 brand-agent-qa only
  checked legacy brands.footer_html; footers live in brand_footers. Deployed
  function is correct; re-ran QA on the flagged row → clean. Old closed rows
  QA'd before that deploy may still carry stale flags — re-run QA, don't
  hand-edit.
- Settings "Connected" badge was dark-on-dark → green status tint.
- `.env` was stale (old Lovable project esrimjavbjdtecszxudc) — now points
  at real prod. `.env.local` is parked at `.env.local.off` so the dev
  server runs against prod; rename it back for local-stack work.
- Jack's saved queue column widths in profiles predate the density redesign
  (no `__v:2`) and are intentionally ignored until he drags once.

Known next steps / open threads:
- Team sharing (members seeing shared brands/queue) is deliberately NOT built
  — phase 2, needs RLS redesign across all tables. v1 = roles + invites +
  admin-wide analytics only.
- `search-clickup-for-copy` still calls the Lovable AI gateway
  (LOVABLE_API_KEY) — migrate to `_shared/anthropic.ts` eventually.
- `profiles.clickup_api_key` + `figma_access_token` are still plaintext.
- Keys Jack pasted in chat (Anthropic/OpenAI/ImageKit/Vision/Firecrawl)
  should be rotated someday.
- Old dev plugin "Sendr - Send to Campaign Queue" still in Jack's Figma —
  he should delete it (causes confusion with the real one).
