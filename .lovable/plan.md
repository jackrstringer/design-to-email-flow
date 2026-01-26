
## What's actually failing (definitive, with evidence)

This is **not a 4000px slicing/AI-limit bug anymore**, and it's **not the plugin "breaking" the pipeline logic**.

The failure is happening **before** `process-campaign-queue` ever runs:

- `figma-ingest` uploads the frame to `upload-to-cloudinary`
- `upload-to-cloudinary` returns an error from Cloudinary:

**Edge logs show:**
- `Cloudinary upload failed: File size too large. Got 11049918. Maximum is 10485760`

So the real failure is **Cloudinary's 10MB upload limit**, not the 4000px height cap.  
Tall images often exceed 10MB (especially PNG exports), which is why it correlates with ">4000px".

Because the upload fails, `figma-ingest` **does not create a campaign_queue record**, and therefore `process-campaign-queue` never triggers (which matches the absence of `process-campaign-queue` logs).

## Why the "4000px fix" didn't help

The "dual-fetch AI (7900px) vs full-res slicing" fix lives in:
- `supabase/functions/process-campaign-queue/index.ts`

That code only runs **after** an image URL exists.  
Right now the image never successfully uploads (file-size limit), so we never reach that stage.

## Definitive solution: make uploads robust against Cloudinary's 10MB limit (without sacrificing slice resolution)

### Goal
Keep the current design intent:
- **AI** gets a resized version (<= ~7900px height).
- **Slices** use the highest-resolution version we can store and reliably process.

### Approach (recommended, minimal behavioral change)
Implement **automatic server-side compression** inside `upload-to-cloudinary` so *all* callers benefit:
- Figma plugin ingestion (`figma-ingest`)
- Manual uploads / tests (`CampaignCreator`, `TestUploadModal`)
- Any other uploads (slices already small, but fine)

### Step 1 — Update `upload-to-cloudinary` to auto-compress when too large
File:
- `supabase/functions/upload-to-cloudinary/index.ts`

Changes:
1. Detect incoming payload size (approx decoded bytes from base64 length, or decode to bytes and measure).
2. If under limit: upload as-is.
3. If over ~9.5MB threshold:
   - Decode the image using ImageScript
   - Re-encode as **JPEG** (keeping pixel dimensions) at a high quality (e.g. 90)
   - If still too large, step quality down (e.g. 85 → 80 → 75)
   - If still too large at quality floor, apply a **minimal downscale** (e.g. cap width to 1200 or compute scale factor) while preserving aspect ratio
4. Upload the compressed data URL to Cloudinary
5. Return extra metadata (non-breaking) so we can debug:
   - `wasCompressed`, `originalBytes`, `finalBytes`, `finalFormat`, `originalWidth/height`, `finalWidth/height`

Why this is "correct" for your requirement:
- We preserve **full resolution in pixels** whenever possible.
- Compression changes file size, not layout geometry; slices remain "HD".
- If a file is so huge it cannot fit under the provider's hard cap, we downscale only as a last resort.

### Step 2 — Improve error reporting in `figma-ingest` so the plugin can show the true reason
File:
- `supabase/functions/figma-ingest/index.ts`

Changes:
- When `upload-to-cloudinary` fails, inspect `errText` and include a more specific message in the response `errors[]`, e.g.:
  - "Image too large (>10MB). Try exporting at 1x scale or JPG."
  - If our auto-compression runs but still can't fit: "Still too large after compression."

This stops the "mystery failure" feeling and makes it obvious whether we're hitting a hard provider cap.

### Step 3 — Ensure the "AI vs full-res slicing" logic stays intact
File:
- `supabase/functions/process-campaign-queue/index.ts` (already updated)

We keep the existing dual-fetch behavior:
- AI: `getResizedCloudinaryUrl(..., h_7900)`
- Slices: full-res URL (whatever was actually uploaded)

No changes needed here unless we find another unrelated cap.

### Step 4 — Verification checklist (how we'll prove it's fixed)
1. Upload a frame that previously failed (>4000px tall).
2. Confirm in logs:
   - `upload-to-cloudinary` logs show `originalBytes` > 10MB, then `finalBytes` < 10MB, then success
3. Confirm `figma-ingest` creates a `campaign_queue` record.
4. Confirm `process-campaign-queue` runs and generates slices.
5. Confirm slice images in Klaviyo look sharp (same pixel dimensions if compression-only path succeeded).

## Why this isn't the plugin's fault
The plugin is sending a large PNG (common for tall frames).  
The backend currently passes it directly to Cloudinary, which enforces a 10MB cap.  
So the "plugin correlation" is real, but the failure mechanism is the upload provider limit.

## Scope of code changes (expected)
- Edit: `supabase/functions/upload-to-cloudinary/index.ts` (core fix)
- Edit: `supabase/functions/figma-ingest/index.ts` (better errors)
- (Optional) Edit: UI places that show generic "Failed to upload" to include returned details (e.g., `TestUploadModal.tsx`) so the web UI also tells the truth.

## Notes / Tradeoffs
- If the frame is extremely large (pixel count), decoding and recompressing may be heavy. We'll add guardrails (downscale cap only when needed).
- If you later upgrade the Cloudinary plan, the compression path remains useful but will run less often.

## IMPLEMENTED ✅

### Changes Made:

1. **`upload-to-cloudinary/index.ts`** - Added auto-compression:
   - Detects images >9.5MB before upload
   - Uses ImageScript to decode and re-encode as JPEG
   - Progressively lowers quality (92 → 85 → 78 → 70) until under limit
   - Falls back to downscaling only if quality reduction isn't enough
   - Returns compression metadata for debugging

2. **`figma-ingest/index.ts`** - Better error messages:
   - Parses Cloudinary errors and extracts hints
   - Shows "Image too large (>10MB). Try exporting at 1x scale or as JPG." instead of generic failure
