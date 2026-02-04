
## What’s happening (root cause, with evidence)

### 1) The pipeline is currently **skipping the “link finding” stage**
In `supabase/functions/process-campaign-queue/index.ts`, Step 4 is:

- If `auto-slice-v2` ran with “link intelligence”, we do:
  - `SKIPPING analyze-slices (link intelligence already applied)`
  - and we never run any web-search fallback.

This is confirmed in logs:
- `process-campaign-queue`: `Step 4: SKIPPING analyze-slices (link intelligence already applied)`
- `auto-slice-v2`: `Link intelligence: 100 links provided, 0 need web search`

So right now, **whatever URL `auto-slice-v2` picks becomes final**.

### 2) `auto-slice-v2` is being given a link list that contains **only collections**, not products
In `process-campaign-queue`, we fetch a link index like this:

- `brand_link_index`
- `order('use_count', { ascending: false })`
- `limit(100)`

For the O’Neill brand, the “top 100 by use_count” are all collections:
- Query result: `count:100 link_type:collection` (top 100)
- Even though the DB *does* contain product links (total product count is ~20), they have low/zero `use_count`, so they never make it into the top-100 list.

Result: Claude sees 100 available links, but they’re all collections/pages, so it “forces” a collection.

### 3) Even with strict prompt rules, Claude is still forcing an imperfect match
Your screenshot shows clearly:
- Slice content: specific products (“O’Riginals Hybrid Jacket”, “Hammer Jacket”, etc.)
- Assigned links: collection URLs (e.g. `/collections/mens-winter-jackets`)

We already strengthened prompts to discourage this, but we need a **deterministic guardrail** so the system doesn’t accept “close enough” when it must be exact.

---

## Goal behavior (what we’ll make true)

1) If a slice is product-specific, the chosen URL must be a `/products/...` URL (or we set `needs_search`).
2) If a slice includes a year/season/version (Winter 2025), the URL must match exactly (or we set `needs_search`).
3) Multi-column product blocks must resolve **per-column product URLs** (not one shared collection URL).
4) If the link isn’t perfect, the system must “go find it” using deterministic site search + fallback search, then cache it.

---

## Implementation plan (code changes)

### A) Fix the link list we pass into `auto-slice-v2` (so products aren’t starved out)
**File:** `supabase/functions/process-campaign-queue/index.ts`  
**Where:** Step 3, the “FETCH LINK INDEX FOR BRAND” block

**Change:**
- Instead of `order by use_count desc limit 100` across all link types,
- Build a curated list:
  - Up to 100 `product` links (most recent / most verified / best candidates)
  - Plus a smaller set of collections/pages (for generic CTAs and nav)

This prevents “100 collections only” from happening again.

**Why this matters:** even before fallback, Claude now has at least some product candidates.

---

### B) Add a deterministic “link perfection” validator after slicing (do not trust Claude blindly)
**File:** `supabase/functions/process-campaign-queue/index.ts`  
**Where:** Right after Step 3.5 (once we have per-slice crop URLs)

Add a new step that:
1) Inspects each slice and its assigned link.
2) If the link is “imperfect”, override it to `needs_search` and queue it for resolution.

**Imperfect examples (deterministic rules):**
- Slice looks product-specific (has price pattern `$`, or strong product naming, or “SHOP NOW” under a product card) AND URL does **not** include `/products/`
- Slice mentions a year (2025) and URL includes a different year (2024)
- Multi-column slice: each column should resolve separately; a single shared collection link is considered imperfect unless it’s explicitly a “collection promo” slice.

This makes the system “strict by construction”, not “strict by prompt”.

---

### C) Implement the “find it yourself” fallback resolver (fast, deterministic first)
We’ll implement a resolver that runs for any slice flagged as needing search.

**Preferred approach order:**
1) **Brand Learning Cache**: `brands.all_links.productUrls` (already used in code)
2) **Shopify predictive search** (fast, non-AI, cheap) when available:
   - `https://${domain}/search/suggest.json?q=${query}&resources[type]=product&resources[limit]=4`
   - Parse the JSON and select best product URL.
3) If not Shopify / or empty results:
   - Use a lightweight search fallback (Firecrawl Search endpoint or Claude web_search in a dedicated function)
4) Verify URL returns 200 (basic fetch HEAD/GET) before accepting
5) Save resolved product URL back into `brands.all_links.productUrls` so next campaign is instant

**Where to implement:**
- Option 1 (cleaner): extend `supabase/functions/analyze-slices/index.ts` to support “index-first + fallback search when no match”
- Option 2 (more modular): create a new backend function `resolve-slice-links` and call it from `process-campaign-queue`

Given the current architecture, Option 2 is usually simplest to reason about: it keeps `auto-slice-v2` as the slicer and adds a dedicated “link resolver”.

---

### D) Enable per-column product link resolution (fix the core issue in your screenshot)
Right now:
- `auto-slice-v2` returns one link per “section”
- then `process-campaign-queue` duplicates that link to each column slice in `generateSliceCropUrls`

We will change flow so that **after** we generate per-column crop URLs, the resolver runs *per slice* (per column), using the cropped image + extracted text to resolve the correct product page for that column.

This is the only reliable way to get:
- left product → left product URL
- right product → right product URL

---

### E) Observability: log “why we rejected a link”
Add logs like:
- `rejected_reason: "product_slice_matched_collection"`
- `rejected_reason: "year_mismatch_2025_vs_2024"`
- `resolver_used: "shopify_suggest" | "firecrawl_search" | "web_search" | "cache_hit"`

So when this breaks again, we can see if it’s classification, resolver, or verification.

---

## Where the pertinent code lives (so someone can duplicate the system)

### Core campaign pipeline (queue)
- `supabase/functions/process-campaign-queue/index.ts`
  - Step 1: fetch image
  - Step 3: calls `auto-slice-v2`
  - Step 3.5: creates Cloudinary crop URLs
  - Step 4: currently skips analyze-slices when link intelligence exists (this is what we’ll change/augment)

### Auto slicing + initial link assignment (Claude + Vision data)
- `supabase/functions/auto-slice-v2/index.ts`
  - Vision data gathering layers (OCR/objects/logos/edges)
  - Claude decides slice boundaries
  - Claude currently also assigns initial links (but we’ll treat this as “suggested”, not authoritative)

### Slice analysis / matching (current system)
- `supabase/functions/analyze-slices/index.ts`
  - Gets slice descriptions via Claude
  - Calls `match-slice-to-link` in index mode
  - Has legacy web-search mode for brands without an index
  - Currently has TODO for web-search fallback even when index exists

- `supabase/functions/match-slice-to-link/index.ts`
  - Loads brand_link_index
  - Small catalog: Claude list
  - Large catalog: vector search via `match_brand_links` DB function + optional Claude confirm

### Link index crawling + embeddings
- `supabase/functions/crawl-brand-site/index.ts` (Firecrawl Map)
- `supabase/functions/generate-embedding/index.ts` (OpenAI embeddings)
- DB function: `public.match_brand_links(...)`

### Frontend (queue page you’re on)
- `src/pages/CampaignQueue.tsx`
- Table/expanded row components under `src/components/queue/*`

---

## Acceptance tests (what we’ll verify end-to-end)

1) Re-run O’Neill with the same creative:
   - Product columns should resolve to `/products/...` URLs (different per column)
2) “Winter 2025” button test:
   - If index has only Winter 2024, resolver must search and find Winter 2025
3) Confirm we do not regress generic CTAs:
   - “Shop Now” without product context should still use default/rule/collection as intended
4) Ensure caching works:
   - Second run should hit `brands.all_links.productUrls` and not need search

---

## Why this will fix your current failure mode
- Today, the pipeline ends after `auto-slice-v2` and accepts whatever it outputs.
- With this change:
  - We (1) ensure products are actually in the candidate set, and
  - (2) enforce “perfect link or search” with deterministic validation, and
  - (3) resolve per-column products using the cropped slice images,
  - so the system will not “force through” an incorrect collection link when a product page exists.
