
## What’s actually going on (with concrete evidence)

### 1) Those “needs_search” pills you’re seeing are not a status label — they are literally being saved as the link URL
In the latest processed campaign row, slices are being stored like:

- `link: "needs_search"`
- `linkSource: "needs_search"`

That’s why the UI renders “needs_search” as if it were a URL.

This is happening because `auto-slice-v2` sometimes returns `"link": "needs_search"` (string) instead of `null`, and our current normalization logic accepts any string as a “link”.

### 2) Even worse: the pipeline is **not** running web search for “needs_search” slices right now
`process-campaign-queue` Step 4 only resolves “imperfect” links (e.g., product matched to collection, year mismatch) and ignores the core case:

- “Clickable slice, but no real URL (needs_search)”

So web search never fires, and the slices remain stuck with placeholder links.

### 3) Multi-column product rows need per-column resolution, but our current descriptions are row-level
For a 2-column product row, both column slices share the same altText/description (often containing both products).
Even if we did web search, we’d likely resolve one product URL and accidentally apply it to both columns unless we extract per-column product text.

## Desired behavior (what we will make true)

1) If a slice link is missing/placeholder/invalid, the pipeline must immediately resolve it via web search.
2) “needs_search” must never be stored in `link` (it should be `null`), and it must not leak into the UI.
3) Multi-column blocks must resolve **per-column** product URLs (column 1 ≠ column 2).
4) Injecting “more links” into Claude should actually matter (right now `auto-slice-v2` only formats the first 100).

---

## Implementation changes (exact files + what will change)

### A) Stop saving placeholder strings as links (sanitize link values)
**File:** `supabase/functions/auto-slice-v2/index.ts`

**Change:** In the slice normalization mapping (where we currently do `link: s.link ?? null`), add strict URL validation:
- If `link` is not an `http://` or `https://` URL, force it to `null`.
- If `linkSource === 'needs_search'`, force `link = null` no matter what.
- Treat strings like `"needs_search"`, `"none"`, `""`, `"null"` as `null`.

**Outcome:** UI will no longer show “needs_search” as a URL.

---

### B) Always invoke web search for slices that need it (this is the main functional fix)
**File:** `supabase/functions/process-campaign-queue/index.ts`

**Where:** Step 4 (currently “Validate and resolve links (deterministic guardrails)”)

**Change:** Replace the current “resolve only imperfect links” approach with a unified resolver list:

Build `slicesToResolve` from `currentSlices` using rules:
- `slice.isClickable === true`
- AND (any of):
  - `slice.link` is `null`/empty
  - `slice.link` is not a valid URL
  - `slice.linkSource === 'needs_search'`
  - `slice.link === 'needs_search'` (legacy stored values)
  - (optional but useful) looks-like-product AND link is a collection URL

Then call `resolve-slice-links` for **all** of those slices.

**Important detail:** This happens **after** `generateSliceCropUrls`, so the indices match the final per-column slices (solves the pre-split vs post-split indexing mismatch).

**Apply results:**
- If resolved, set:
  - `slice.link = resolved.url`
  - `slice.linkSource = 'resolved_web_search'`
  - `slice.linkVerified = true`
  - clear any placeholder
- If not resolved:
  - set `slice.link = defaultDestinationUrl` (or homepage)
  - set `slice.linkSource = 'default_fallback'`
  - set `slice.linkVerified = false`
  - optionally set `slice.linkWarning = 'Could not resolve product link; using fallback.'`

**Outcome:** “If it can’t find it right away, it uses web search” becomes true, automatically.

---

### C) Make web search accurate for multi-column rows by extracting per-column product names via OCR
**File:** `supabase/functions/resolve-slice-links/index.ts`

Right now it uses only `slice.description`, which is often not column-specific.

**Change:** If `slice.imageUrl` is provided:
1) Call Google Vision OCR using `image.source.imageUri = slice.imageUrl` (no downloads, fast).
2) Extract likely product name text:
   - filter out noise: “SHOP NOW”, prices, sizes, brand-only text
   - keep the best 1–2 lines as the query
3) Use that OCR-derived query for Firecrawl Search:
   - `query: "${ocrQuery} site:${domain}"`

Fallback order:
- OCR query if available and non-trivial
- else fall back to `slice.description` / `altText`

Also add URL cleanup:
- Strip tracking params like `?srsltid=...` from returned URLs for cleaner final links.

**Outcome:** Column 1 gets Column 1’s product URL; Column 2 gets Column 2’s product URL.

---

### D) “Inject as many links as possible” — make it real in the prompt
**File:** `supabase/functions/auto-slice-v2/index.ts`

Right now the prompt formatting does:
- `linkIndex.slice(0, 100)`

So passing 1000 links doesn’t help beyond the first 100.

**Change:**
- Increase the formatted list to something like 400–800 entries, but token-efficient:
  - show only pathname (`/products/...`) instead of full URL where possible
  - truncate titles to ~60 chars
- Keep products first, then collections/pages (already done in `process-campaign-queue`)

**Outcome:** Claude actually sees “as many links as possible” within practical context limits, improving index matches and reducing how often we need web search.

---

## Verification / Acceptance tests (end-to-end)

1) Reprocess the same O’Neill campaign:
   - The “needs_search” pills should disappear and become real `/products/...` URLs.
   - Each 2-column row should have different product links per column.
2) Confirm fallback behavior:
   - If a product truly cannot be found, the slice should get the default destination (homepage/brand default), plus a warning.
3) Confirm performance:
   - Pipeline should still complete in a normal time window.
   - If there are many unresolved slices, it should progress through “resolving_links” and finish, not hang at 0%.
4) Spot-check URL quality:
   - Ensure we’re not saving placeholder strings.
   - Ensure tracking query params are removed.

---

## Files that will be changed (summary)

- `supabase/functions/process-campaign-queue/index.ts`
  - Resolve *all* `needs_search`/missing/invalid links via `resolve-slice-links`
  - Sanitize placeholder link strings
  - Preserve per-column indices after splitting

- `supabase/functions/resolve-slice-links/index.ts`
  - Add per-slice OCR via Google Vision using `imageUri`
  - Use OCR text to drive Firecrawl Search queries
  - Strip tracking params from final URLs

- `supabase/functions/auto-slice-v2/index.ts`
  - Sanitize links (only valid URLs; force null when `needs_search`)
  - Expand link list formatting beyond 100 entries (token-efficient)

---

## Why this fixes what you’re seeing in the screenshot
- The UI isn’t “broken”; it’s rendering exactly what we stored: `link: "needs_search"`.
- We’ll stop storing placeholders as links, and we’ll actually run web search automatically any time a slice needs it.
- We’ll use OCR on the per-column crops so product grids resolve correctly instead of guessing one link for the whole row.
