# Architecture Overview

> Single entry-point for an outside engineer or AI agent analyzing this codebase.
> Read this first, then dive into [`TECHNICAL_ARCHITECTURE.md`](./TECHNICAL_ARCHITECTURE.md) for the deep pipeline walkthrough.

---

## 1. What this app does

An AI-powered email-campaign builder for e-commerce brands. The core flow:

1. User (or a Figma plugin) uploads a campaign **image** (a full-length email design as a PNG).
2. The system **auto-slices** that image into horizontal blocks (hero, product grid, CTA, footer, etc.).
3. For each slice it uses **AI vision + brand link intelligence** to determine the right product/category URL, alt text, and copy.
4. It generates **Klaviyo-compatible email HTML** (table-based, with hybrid `data-klaviyo-region` blocks where appropriate) and a brand-specific **footer** (logo, social icons, legal block, Klaviyo `{% unsubscribe_link %}` tags).
5. The user reviews/refines via a queue UI and **pushes to Klaviyo** as a Template + Campaign with segments.

It is a Lovable project deployed on Lovable Cloud (managed Supabase).

---

## 2. Tech stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite 5 + TypeScript + Tailwind v3 + shadcn/ui + React Router + TanStack Query |
| Backend | Supabase Edge Functions (Deno) — ~55 functions in `supabase/functions/` |
| DB | Postgres (Supabase) — schema in `src/integrations/supabase/types.ts` (auto-generated, do not edit) |
| Auth | Supabase Auth (email/password). `profiles` table mirrors `auth.users` |
| AI | Anthropic Claude, Google Gemini, OpenAI — routed via Lovable AI Gateway (`LOVABLE_API_KEY`) and direct provider keys |
| Vision | Google Cloud Vision (OCR) |
| Image CDN | Cloudinary (primary) + ImageKit (migrated for some flows) — both used for server-side cropping |
| Web scraping | Firecrawl (brand site crawl, link discovery, evergreen URL resolution) |
| Integrations | Klaviyo (templates/campaigns/segments), Figma (plugin export + REST), ClickUp (copy search) |

Secrets list (values not in repo): see `supabase/config.toml` and the Lovable Cloud Secrets panel.

---

## 3. Repo map

```
src/
  pages/                  Top-level routes (CampaignQueue, Brands, Segments, FooterEditor, ...)
  components/
    queue/                Campaign queue table, row, status/segment selectors, spelling panel
    dashboard/            Brand creator, campaign creator, brand settings
    brand/                Brand identity, link table, integrations, sitemap import
    footer/               Inline legal/footer editors
    segments/             Klaviyo segment chip editor + preset manager
    ui/                   shadcn primitives (do not modify directly)
  hooks/                  useCampaignQueue, useBrands, useSegmentPresets, useFooterProcessingJob, ...
  contexts/AuthContext    Supabase auth provider
  integrations/supabase/  Auto-generated client + types (DO NOT EDIT)
  lib/                    footerVisionDiff, imageSlicing, socialIcons, utils
  types/                  brand-assets, email-blocks, footer, link-intelligence, slice

supabase/
  config.toml             Per-function verify_jwt config (most are public)
  functions/<name>/       One Deno entry-point per function (see catalog below)
  migrations/             Timestamped SQL — schema source of truth

.lovable/plan.md          Most recent agent plan
TECHNICAL_ARCHITECTURE.md Deep dive: pipeline steps, sequence diagrams, Cloudinary transforms
ARCHITECTURE_OVERVIEW.md  This file
```

---

## 4. Core data flow (campaign pipeline)

```
   Upload image  ──▶  campaign_queue row (status: pending)
                          │
                          ▼
   ┌──────────────── process-campaign-queue (orchestrator) ───────────────┐
   │                                                                      │
   │  1. auto-slice-v2          → vision model finds horizontal cut Ys    │
   │  2. analyze-slices         → per-slice intent (hero/product/CTA/...)  │
   │  3. generate-email-copy-early (parallel) + qa-spelling-check-early   │
   │  4. match-slice-to-link  ──▶ brand_link_index (pgvector RAG)         │
   │       └── resolve-slice-links (Firecrawl fallback for misses)        │
   │  5. generate-slice-html  (per slice, Claude, table-based HTML)        │
   │  6. Footer pipeline (see §5)                                         │
   │  7. refine-campaign     → final QA + assembly                        │
   │                                                                      │
   └──────────────────────────────────────────────────────────────────────┘
                          │
                          ▼
   Queue UI (review) ──▶  push-to-klaviyo  ──▶  Klaviyo Template + Campaign
```

Real-time progress is surfaced to the queue via Supabase Realtime on `campaign_queue` + `processing_jobs`.

---

## 5. Footer pipeline (separate sub-system)

Footers are generated **once per brand** and reused. The flow:

```
auto-slice-footer  ──▶  detect-footer-region (vision)
                          ↓
   detect-footer-socials + detect-footer-links (parallel)
                          ↓
   extract-section-assets (logo / social icons via Cloudinary)
                          ↓
   generate-footer-html  ──▶  brand_footers row (is_primary)
                          ↓
   Vision diff loop: analyze-footer-render vs source image
   → refine-footer-html until convergence (footerVisionDiff.ts)
```

Klaviyo template tags MUST be `{% unsubscribe_link %}` and `{% manage_preferences_link %}` (URL-only, used inside `href="..."`). Never `{% unsubscribe_url %}` (doesn't exist) or bare `{% unsubscribe %}` inside an `href` (renders nested `<a>`).

---

## 6. Edge function catalog (~55 functions)

All in `supabase/functions/<name>/index.ts`. Most are public (`verify_jwt = false` in config.toml) — RLS + brand_id checks gate access.

### Campaign pipeline
- `figma-ingest` — Entry point for the Figma plugin export
- `process-campaign-queue` — Main orchestrator
- `auto-slice-email`, `auto-slice-v2` — Vision-based horizontal slicing
- `analyze-email-design`, `analyze-slices` — Per-slice intent classification
- `generate-slice-html`, `refine-slice-html` — Per-slice HTML generation/refinement
- `generate-email-copy`, `generate-email-copy-early`, `generate-email-copy-background` — Copy generation tiers
- `qa-spelling-check`, `qa-spelling-check-early` — Spelling/grammar pass
- `refine-campaign` — Final assembly + QA
- `extract-section-assets` — Pull logos/icons/buttons from slices via Cloudinary

### Footer pipeline
- `auto-slice-footer`, `detect-footer-region` — Find footer boundaries
- `detect-footer-socials`, `detect-footer-links` — Identify social icons + legal links
- `generate-footer-html`, `generate-simple-footer`, `refine-footer-html` — HTML build/refine
- `footer-conversation` — Chat-based footer editing
- `analyze-footer-reference`, `analyze-footer-render` — Vision diff comparing target vs render
- `process-footer-queue` — Async footer job runner

### Brand intelligence
- `analyze-brand` — Firecrawl-driven brand profile (colors, fonts, links)
- `detect-brand-from-image` — Identify brand from campaign image
- `crawl-brand-site`, `import-sitemap`, `trigger-sitemap-import` — Build link inventory
- `weekly-link-recrawl` — Scheduled re-crawl
- `add-brand-link`, `delete-brand-link`, `get-brand-link-index`, `update-brand-link-preferences` — Link mgmt
- `match-slice-to-link`, `resolve-slice-links` — RAG link matching (pgvector) + Firecrawl fallback
- `generate-embedding` — pgvector embedding endpoint

### Klaviyo
- `push-to-klaviyo` — Create template + campaign + assign segments
- `get-klaviyo-lists`, `get-segment-size` — Segment metadata
- `scrape-klaviyo-copy` — Pull copy from existing Klaviyo templates

### Figma
- `fetch-figma-design`, `figma-to-email-html` — REST API path

### ClickUp
- `get-clickup-hierarchy`, `search-clickup-for-copy` — Copy search across ClickUp tasks

### Asset / utility
- `upload-to-cloudinary`, `upload-to-imagekit`, `upload-social-icon`, `process-brand-logo`, `invert-logo` — Image upload + transforms
- `get-plugin-brands` — Figma plugin brand list

---

## 7. Database schema (high level)

Full types in `src/integrations/supabase/types.ts`. Migrations in `supabase/migrations/`.

| Table | Purpose |
|---|---|
| `profiles` | User mirror of `auth.users` (id, email) |
| `brands` | Brand identity: colors, logos, fonts, Klaviyo API key, ClickUp config |
| `brand_profiles` | Extended brand metadata from Firecrawl analysis |
| `brand_footers` | Generated footer HTML per brand (one `is_primary`) |
| `brand_link_index` | All known URLs for a brand, with pgvector embeddings for RAG matching |
| `campaigns` | Generated email campaigns (HTML, blocks, status, klaviyo_template_id) |
| `campaign_queue` | Queue rows driving the `/queue` UI; segment presets attached here |
| `segment_presets` | Saved combinations of Klaviyo segments for repeated sends |
| `processing_jobs`, `footer_processing_jobs` | Async job tracking (heartbeats, status) |
| `footer_editor_sessions` | Conversational footer editor state |
| `early_generated_copy`, `early_spelling_check` | Pre-computed copy + QA results |
| `modules` | Reusable email module library |
| `plugin_tokens` | Auth tokens for the Figma plugin |
| `sitemap_import_jobs` | Async sitemap crawl tracking |

Key DB function: `match_brand_links(query_embedding, brand_id, count)` — pgvector cosine similarity for link RAG.

RLS: every user-facing table is scoped by `auth.uid()` via the user → brand relationship. `service_role` is used inside edge functions for cross-user writes.

---

## 8. Routes / frontend pages

| Route | Page |
|---|---|
| `/auth` | Sign in / sign up |
| `/queue` (default) | Campaign queue — main workspace |
| `/brands`, `/brands/:id/{links,email,integrations}` | Brand management |
| `/segments` | Klaviyo segment preset manager |
| `/upload` | Manual single-campaign upload |
| `/campaign/:id`, `/campaign/:id/send` | Campaign detail + send flow |
| `/footer-editor/:brandId` | HTML-based footer editor |
| `/footer-studio/:brandId/:jobId` | Image-based footer studio |
| `/settings` | App settings |

---

## 9. External integrations

| Service | Used for | Auth |
|---|---|---|
| Klaviyo | Template create, campaign create, list/segment fetch, copy scrape | Per-brand API key on `brands.klaviyo_api_key` |
| Cloudinary | Image hosting + server-side URL transformations (crop/resize) | `CLOUDINARY_*` secrets |
| ImageKit | Secondary CDN (some flows migrated here) | `IMAGEKIT_*` secrets |
| Firecrawl | Brand site crawl, evergreen URL resolution, web search fallback | `FIRECRAWL_API_KEY` |
| Google Cloud Vision | OCR for footer text + layout detection | `GOOGLE_CLOUD_VISION_API_KEY` |
| Anthropic Claude | Slice analysis, HTML generation, refinement, conversation | `ANTHROPIC_API_KEY` |
| Google Gemini | High-volume vision/classification (cheaper tier) | via Lovable AI Gateway |
| OpenAI | Embeddings + some text tasks | `OPENAI_API_KEY` |
| Figma | Plugin ingest + REST design fetch | `FIGMA_ACCESS_TOKEN` + plugin tokens |
| ClickUp | Copy reference search | Per-brand `clickup_api_key` |
| HCTI | (Legacy) HTML-to-image | `HCTI_*` secrets |
| Replicate | Image gen / inversion | `REPLICATE_API_TOKEN` |

---

## 10. Conventions & gotchas (must-read)

These are distilled from the project's persistent memory and are non-obvious from reading code alone:

**Image / vision**
- **Max AI vision payload**: 4.8 MB or 7900 px tall. Larger inputs MUST be downscaled before sending to Claude/Gemini vision.
- **Server-side cropping is mandatory** — use Cloudinary/ImageKit URL transformations, never decode-in-memory in edge functions.
- **Base64 conversion**: use `uint8Array.subarray` chunked at 32768 to avoid stack overflows on large images.
- **Auto-slice top boundary**: `yTop` must always be `0` for the first slice — never trim email headers.
- **Slicing across columns/buttons**: differently-worded parallel buttons force a hard slice partition (so they get different links).

**Links**
- **Always prefix** with `https://`. Strip tracking params (`?srsltid=`, UTM, etc.).
- **Correct link or no link** — never fall back to a random brand URL when no semantic match is found.
- Two-tier discovery: brand_link_index pgvector RAG first, Firecrawl web search second.

**Klaviyo HTML**
- Template tags: `{% unsubscribe_link %}` / `{% manage_preferences_link %}` (URL-only, inside `href`).
- Hybrid blocks require `data-klaviyo-region` on a wrapping table.
- Multi-column blocks MUST use nested tables (not divs/CSS grid) for email-client compatibility.
- Social icons must be self-hosted PNGs on Cloudinary — Simple Icons CDN is blocked by some email clients.

**Footer**
- Footer brand isolation: generation prompts must explicitly forbid logo cross-contamination between brands.
- Footer height detection has guardrails — discard AI footer boundaries that are suspiciously high.
- Convergence loop: vision-diff target vs render until layout offsets are within tolerance.

**AI model strategy** — see `mem://technical/model-selection-strategy-v2`. Roughly: Claude for HTML gen + conversation, Gemini for high-volume vision classification, OpenAI for embeddings.

**Jobs**
- Stale-job heartbeat: a job with no heartbeat for >10 min is considered dead and can be restarted.

---

## 11. Where to look first (recommended reading order)

1. This file (you're here)
2. [`TECHNICAL_ARCHITECTURE.md`](./TECHNICAL_ARCHITECTURE.md) — deep pipeline walkthrough with sequence diagrams
3. `supabase/config.toml` — every edge function listed
4. `src/integrations/supabase/types.ts` — full DB schema
5. `src/App.tsx` — route tree
6. `src/pages/CampaignQueue.tsx` + `src/components/queue/*` — main UI
7. `supabase/functions/process-campaign-queue/index.ts` — orchestrator
8. `supabase/functions/generate-slice-html/index.ts` — heart of HTML generation
9. `supabase/functions/generate-footer-html/index.ts` + `src/lib/footerVisionDiff.ts` — footer subsystem
10. `supabase/functions/push-to-klaviyo/index.ts` — publishing
11. `supabase/functions/match-slice-to-link/index.ts` — link RAG

---

## 12. What is NOT in this repo

- **Secret values** — only secret *names* are visible; actual keys live in Lovable Cloud Secrets.
- **Edge function runtime logs** — visible in Lovable Cloud → Functions, not in git.
- **Database row data** — schema is in migrations, but production data is in the managed Postgres instance.
- **Klaviyo account state** — templates/campaigns pushed live exist only in the user's Klaviyo workspace.
- **Figma plugin source** — the plugin is a separate codebase; only its ingest endpoint (`figma-ingest`) lives here.
- **`.env`** — auto-managed by Lovable Cloud; contains only `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` (all public).

---

*Last updated: generated by the Lovable agent as a curated entry point. For the latest pipeline-step detail, always cross-reference `TECHNICAL_ARCHITECTURE.md` and the actual edge function source.*
