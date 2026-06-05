## Why the "TRY Ü SLEEP" CTA fell back to the homepage

There are **three compounding bugs** between `match-slice-to-link` and `resolve-slice-links`. Even after the previous fix, the CTA still fails because the second-line fallback (Firecrawl web search) is also broken for this exact case.

### What actually happens on this slice

1. **`analyze-slices` → `match-slice-to-link`**
   - The slice description is essentially "TRY Ü SLEEP" button.
   - `isGenericCta = true` (because "TRY X" is a generic verb pattern).
   - `Calming Co` has **89 healthy links** in the brand link index, so the function takes the **vector-search path** (threshold ≥ 50).
   - Embedding similarity between "TRY Ü SLEEP" and the `Ü Sleep | Kava Drink | …` product title typically lands in the **0.55–0.72** range — below the `0.75` Claude-confirm threshold and well below the `0.90` high-confidence threshold.
   - Result: `low_confidence` → `url: null`.
   - The brand has **no `default_destination_url` set** (verified in DB), so the new generic-CTA default fallback I added can't fire either. Returns `no_match`.

2. **`process-campaign-queue` step 4.5 → `resolve-slice-links`**
   - Sees the null link, calls `resolve-slice-links` with `description`, `altText`, and the **button image URL**.
   - OCR on the slice extracts `"TRY Ü SLEEP"`.
   - `cleanQuery` regex `[^\w\s-]` is ASCII-only — it **strips the `Ü`**, producing `"TRY SLEEP"`.
   - `wordCount = 2`, length `< 20`, so it's flagged as a **category search**.
   - `primaryKeyword = "try"` (first word) → Firecrawl is asked for `"try collection site:calmingco.com"` and filters results for URLs containing `"try"`. Nothing matches.
   - Returns `null` → `process-campaign-queue` applies `defaultDestinationUrl` (also null) → final link defaults to homepage `https://calmingco.com`.

3. **`resolve-slice-links` never gets campaign context**
   - `process-campaign-queue` does not pass `campaign_context.primary_focus` ("Ü Sleep") to the resolver, so the web-search fallback can't use the campaign's known focus to disambiguate a generic CTA.

## Fixes

### 1. `supabase/functions/match-slice-to-link/index.ts`

For generic CTAs with a `campaign_context.primary_focus`, treat the vector search more aggressively:

- After vector search returns, if `is_generic_cta && primary_focus` and the top candidate's title/URL contains a meaningful token from `primary_focus` (case-insensitive, diacritics-normalized), accept it as `vector_high_confidence` regardless of similarity.
- Lower the Claude-confirmation floor from `0.75` to `0.55` **only** when `is_generic_cta && primary_focus` is set — small, scoped change so we don't loosen matching for everything.
- Keep the existing fallthrough to `default_destination_url` as a last resort.

### 2. `supabase/functions/resolve-slice-links/index.ts`

- **Normalize diacritics before stripping non-word characters.** Apply `.normalize('NFD').replace(/\p{Diacritic}/gu, '')` so `Ü Sleep` → `U Sleep` instead of being chopped to `Sleep` alone. Use the Unicode `\p{L}` class instead of `\w` for letter-keeping.
- **Add `try`, `discover`, `meet`, `experience`, `unlock`, `start` to the noise pattern** — these are CTA verbs that should never become the primary keyword. After noise removal, if the query collapses to one or zero meaningful tokens, fall back to the campaign primary focus (see fix 3) instead of doing a doomed category search.
- **For generic CTAs, prefer the campaign focus query over OCR text** when both exist. The OCR usually just re-reads the button verb; the campaign focus is the actual product intent.

### 3. `supabase/functions/process-campaign-queue/index.ts`

- Plumb `campaignContext` (specifically `primary_focus` and `detected_products`) into the `resolve-slice-links` request body so the resolver can use it for generic-CTA disambiguation.
- After Step 4.5, if a CTA slice still has no link AND `campaign_context.primary_focus` is set AND there's a brand link index entry whose title contains that focus, use that entry's URL as a last-resort match (server-side equivalent of "the campaign is clearly about Ü Sleep — link there"). This is the safety net that should have caught the current case.

### 4. `supabase/functions/resolve-slice-links/index.ts` — accept campaign context

Extend `RequestBody` with optional `campaignContext: { primary_focus?: string; detected_products?: string[] }` and use it as described above.

## Why this addresses the user's frustration

The previous fix only patched **one** of the three layers. The web-search fallback was silently throwing away the `Ü`, picking `"try"` as the search keyword, and never being told what product the campaign was about. After these changes, "TRY Ü SLEEP" in a campaign whose primary focus is "Ü Sleep" will route to `/products/u-sleep` via three independent paths (vector match accepted at lower confidence with focus confirmation, web search using the focus query, or final server-side index lookup), so all three would have to fail simultaneously for it to revert to the homepage.

## Files touched

- `supabase/functions/match-slice-to-link/index.ts`
- `supabase/functions/resolve-slice-links/index.ts`
- `supabase/functions/process-campaign-queue/index.ts`

No DB migrations, no UI changes.

## Verification after build

1. Re-run the Calming Co "TRY Ü SLEEP" campaign through the queue.
2. Check `match-slice-to-link` logs for `vector_high_confidence` or `vector_claude_confirmed` pointing at `/products/u-sleep`.
3. If Step 4.5 fires, confirm `resolve-slice-links` logs show a normalized query `"U Sleep"` and a `/products/u-sleep` result.
4. Inspect the final campaign queue row's `slices[*].link` for that CTA — must be a `/products/u-sleep` URL, not the homepage.