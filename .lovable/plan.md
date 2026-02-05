
# Fix: Campaign Processing Issues

## Problems Identified

| Issue | Impact | Root Cause |
|-------|--------|------------|
| 80+ second processing time | Poor UX, progress stalls at 65% | Early generation never finishes, sync fallback runs anyway |
| 9000px campaign fails | Complete failure | MIME type mismatch when ImageKit outputs JPEG but PNG is declared |
| Wrong horizontal splits | Broken email layout | Claude over-splitting non-navigation content into columns |
| Height limit still 4000px | Tall campaigns truncated | Resize call not updated to 7900px |

---

## Fix 1: Height Limit (4000px to 7900px)

**File:** `supabase/functions/process-campaign-queue/index.ts`

Line 81 still has the old value:
```typescript
const resizedUrl = getResizedCloudinaryUrl(item.image_url, 600, 4000);
```

Change to:
```typescript
const resizedUrl = getResizedCloudinaryUrl(item.image_url, 600, 7900);
```

This allows processing of campaigns up to 9000px tall (like the failed one).

---

## Fix 2: MIME Type Detection for ImageKit Resized Images

**File:** `supabase/functions/process-campaign-queue/index.ts`

When ImageKit resizes an image, it may output a different format (JPEG) than the original (PNG). The code fetches the resized image but preserves the original MIME type assumption.

**Solution:** Detect actual MIME type from the response headers or image bytes:

```typescript
// After fetching resized URL, detect actual MIME type
const response = await fetch(resizedUrl);
const contentType = response.headers.get('content-type') || 'image/png';
const buffer = await response.arrayBuffer();
// ... convert to base64 ...

// Use actual content-type in data URL
const dataUrl = `data:${contentType};base64,${base64}`;
```

**Also update:** `supabase/functions/auto-slice-v2/index.ts`

The `resizeImageForClaude` function outputs JPEG but may not update the MIME type correctly when passed to Claude. Ensure the MIME type in the API call matches the actual encoded format.

---

## Fix 3: Reduce Aggressive Horizontal Splitting in Claude Prompt

**File:** `supabase/functions/auto-slice-v2/index.ts` (lines 1051-1084)

The current prompt (Rule 0.5) is too aggressive and causes Claude to split product category sections horizontally.

**Add clarifying rules to prevent misclassification:**

```
### RULE 0.5b: What is NOT Navigation (Do NOT horizontal split)

These should be SEPARATE VERTICAL SLICES, not horizontal columns:
- Category SECTIONS with images below them (e.g., "JACKETS" with jacket photos below)
- Product grid headers like "SHOP MEN" / "SHOP WOMEN" when each has its own content below
- Stacked category blocks like "JACKETS" then "SNOWPANTS" then "FLEECE"
- Any section where clicking leads to a DIFFERENT page than adjacent sections

**Detection:**
- If each text block has DIFFERENT images or content directly below it → SEPARATE SLICES
- If text blocks have equal height content extending far below them → SEPARATE SLICES
- Only use horizontal split when items are truly in one row with NO distinct content below each

**Example - WRONG (3-column split):**
[JACKETS]  [SNOWPANTS]  [FLEECE]
  ↓            ↓           ↓
[photos]    [photos]    [photos]

These are 3 separate category sections, not 3 columns of one row!

**Example - CORRECT (3 separate vertical slices):**
Slice 1: JACKETS header + JACKETS photos
Slice 2: SNOWPANTS header + SNOWPANTS photos  
Slice 3: FLEECE header + FLEECE photos
```

Also add a clarification:
```
### Hero Images Are NEVER Split Horizontally

A hero section is ONE slice:
- Full-width image with text overlay
- Even if there's negative space on one side
- Even if the skier/model is only on part of the image

WRONG: Splitting "GO BIG" hero into 2 columns
CORRECT: One slice containing the entire hero
```

---

## Fix 4: Early Generation Reliability

The early copy generation frequently fails to complete before the pipeline polls for results. This causes 20-40 second delays as the system falls back to synchronous generation.

**Observation from logs:**
- `No early copy found for session: xxx` - repeated polling
- `Early copy not ready after polling, falling back to sync generation...` 

**Root cause:** The background generation may be:
1. Starting too late
2. Taking longer than expected
3. Not persisting results correctly

**Solution options:**
1. **Increase polling duration** from ~10s to ~20s before fallback
2. **Skip early generation entirely** if not reliably faster than sync
3. **Fire earlier** - currently fires in Step 1.5, could fire immediately on queue item creation

For now, recommend increasing polling timeout to give background tasks more time to complete.

---

## Implementation Priority

1. **Height limit fix** - One line change, prevents 9000px failures
2. **MIME type detection** - Fixes Claude API errors for large images  
3. **Horizontal split prompt fix** - Stops incorrect column layouts
4. **Early generation timing** - Reduces overall processing time

---

## Files to Modify

1. `supabase/functions/process-campaign-queue/index.ts`
   - Line 81: Change 4000 to 7900
   - Add MIME type detection from response headers/bytes

2. `supabase/functions/auto-slice-v2/index.ts`
   - Add Rule 0.5b to prompt (clarify what NOT to horizontal split)
   - Add hero image clarification
   - Verify MIME type consistency in `resizeImageForClaude`

3. Optional: Increase polling timeout in `process-campaign-queue/index.ts`
