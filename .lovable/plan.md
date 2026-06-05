# Plan: Create ARCHITECTURE_OVERVIEW.md

Create a single curated entry-point doc at the repo root that an outside AI agent (Super Agent) or senior engineer can read in ~20 minutes to understand the entire system before diving into code.

## Approach

1. **Survey existing material** (read-only): `README.md`, `TECHNICAL_ARCHITECTURE.md`, `.lovable/plan.md`, `supabase/config.toml`, `src/integrations/supabase/types.ts`, `src/App.tsx`, key edge functions, and the `mem://` memory index — so the overview reflects current reality, not a generic template.

2. **Write `ARCHITECTURE_OVERVIEW.md`** at the repo root with these sections:
   - **What this app does** — 1-paragraph product summary (AI email campaign builder: image → sliced HTML → Klaviyo)
   - **Tech stack** — React 18 + Vite + TS + Tailwind + shadcn; Supabase (Lovable Cloud); edge functions in Deno; Anthropic/Gemini/OpenAI via Lovable AI Gateway; Cloudinary + ImageKit for image ops; Firecrawl, Klaviyo, Figma, ClickUp integrations
   - **Repo map** — annotated tree of `src/`, `supabase/functions/`, `supabase/migrations/`, key configs
   - **Core data flow** — ASCII diagram of the campaign pipeline: upload → auto-slice → analyze-slices → generate-slice-html → footer pipeline → refine → push-to-klaviyo
   - **Edge function catalog** — table of all ~55 edge functions grouped by domain (slicing, footer, link intelligence, Klaviyo, Figma, ClickUp, brand analysis, QA) with one-line purpose each
   - **Database schema overview** — main tables (brands, campaigns, brand_footers, brand_link_index, segment_presets, footer_editor_sessions, etc.) and key relationships; pointer to `types.ts` for full schema
   - **Auth & RLS model** — Supabase auth, profiles table, RLS scoped by user
   - **External integrations** — Klaviyo (templates/campaigns/segments), Cloudinary, ImageKit, Firecrawl, Figma, ClickUp, Anthropic, Gemini, OpenAI — what each is used for
   - **Key conventions & gotchas** — distilled from `mem://index.md`: 7900px vision payload cap, chunked base64, Cloudinary server-side cropping, Klaviyo template tags, social icon self-hosting, footer brand isolation, etc.
   - **Where to look first** — recommended reading order for an agent doing analysis
   - **What's NOT in the repo** — secrets values, edge function runtime logs, Klaviyo account state

3. **Keep it tight** — target ~400-600 lines. Link out to existing files rather than duplicating large chunks.

## Files touched

- **Create:** `ARCHITECTURE_OVERVIEW.md` (repo root)

No code, schema, or config changes. Pure documentation.
