
## What the logs show (why links are missing)
- The **analyze-slices** backend function is failing with a 400 error:

  `Image does not match the provided media type image/jpeg`

- When that happens, **analyze-slices returns the fallback “default analysis”** (no links, no alt text), so the queue item ends up with empty link assignments.

### Root cause
In `process-campaign-queue`, we generate slice `dataUrl`s like this:

- We fetch a crop from Cloudinary (which is often still **PNG** if the original is PNG).
- But we **hardcode the data URL prefix as** `data:image/jpeg;base64,...`

So Claude is told “this is JPEG”, but the bytes are actually PNG → request rejected → link/alt assignment fails.

### Secondary issue found (important)
The queue item in the DB currently contains `slices[].dataUrl` with huge base64 blobs. That means we are accidentally **persisting “analysis-only” base64 images into `campaign_queue.slices`**, which is not needed and can bloat the DB / slow UI.

---

## Implementation approach (minimal + robust)
### A) Fix slice media type mismatch (main fix)
**File:** `supabase/functions/process-campaign-queue/index.ts`

In `fetchSliceDataUrlsForAnalysis()`:
1. After `fetch(cropUrl)`, read the actual content type:
   - `const contentType = response.headers.get('content-type') ?? 'image/png'`
   - normalize it to just the mime (strip `; charset=...`)
2. Build the data URL using that mime:
   - `data:${mime};base64,${base64}`  
   instead of hardcoding `data:image/jpeg;base64,...`

This guarantees the declared media type always matches the bytes Cloudinary returns.

### B) Fix full-campaign “reference image” media type too (consistency)
**File:** `supabase/functions/process-campaign-queue/index.ts`

In `analyzeSlices()` when creating `fullCampaignImage`:
- currently it hardcodes `data:image/png;base64,...`
- update to use `imageResponse.headers.get('content-type')` just like slices

This avoids future mismatches if Cloudinary returns JPEG/webp/etc.

### C) Stop saving base64 `dataUrl` into the database (prevents bloat + confusion)
**File:** `supabase/functions/process-campaign-queue/index.ts`

After analysis is done, before calling `updateQueueItem(... { slices: ... })`:
- strip analysis-only fields from each slice object (at minimum `dataUrl`)
- save only persistent fields (imageUrl, altText, link, etc.)

Example behavior:
- Use `dataUrl` only to call **analyze-slices**
- Do **not** store `dataUrl` in `campaign_queue.slices`

### D) Minor clean-up: remove leftover `h_7900` in `smallCropUrl` generation
**File:** `supabase/functions/process-campaign-queue/index.ts`

In `cropSlicesViaCloudinary()` there’s still a `getResizedCloudinaryUrl(originalImageUrl, 600, 7900)` used for `smallCropUrl`. Even if it’s not currently driving analysis, we should align it to `5000` to avoid future regressions.

---

## How we’ll verify the fix
1. Trigger processing again (use the existing “retry” action on a failed/processed queue item).
2. Confirm in **analyze-slices logs** we no longer see the media-type mismatch 400.
3. Confirm `campaign_queue.slices` now contains:
   - `altText` populated
   - `link` populated where clickable
   - **no** giant `dataUrl` base64 fields
4. Confirm UI shows links (e.g. LinksTooltip/ExternalLinksIndicator counts change).

---

## Expected outcome
- Link + alt text assignment works again (because analyze-slices no longer errors).
- Queue items stay lightweight (no base64 blobs in DB).
- Future Cloudinary output changes won’t break analysis (we trust the response content-type rather than guessing).

