
# Fix: Support Variable Export Scale from Figma Plugin

## Summary

The Figma plugin now sends an `exportScale` property (1 or 2) indicating whether the frame was exported at 1x or 2x resolution. The backend needs to:
1. Accept and store this value
2. Calculate and store the **actual exported image dimensions** (`width * exportScale`)
3. Pass correct dimensions to downstream functions

## Current Behavior (Problem)

| Field | What's Stored Now | What Should Be Stored |
|-------|-------------------|----------------------|
| `image_width` | Figma frame width (1x) | Actual exported width (width × exportScale) |
| `image_height` | Figma frame height (1x) | Actual exported height (height × exportScale) |
| `source_metadata.exportScale` | Not stored | 1 or 2 (from plugin) |

**Why This Matters:**
- `autoSliceImage()` in `process-campaign-queue` passes `item.image_width` and `item.image_height` to `auto-slice-v2`
- While `auto-slice-v2` correctly extracts dimensions from the image header, having incorrect metadata can cause confusion and logging issues
- Future functions might rely on `image_width`/`image_height` being accurate

## Solution

### File 1: `supabase/functions/figma-ingest/index.ts`

**Change 1: Update `FrameData` interface to include `exportScale`**

Add the `exportScale` property:
```typescript
interface FrameData {
  name: string;
  width: number;        // Figma frame width (1x)
  height: number;       // Figma frame height (1x)
  exportScale?: number; // Export scale (1 or 2), defaults to 2
  imageBase64: string;
  figmaUrl?: string;
}
```

**Change 2: Calculate actual dimensions when creating campaign**

Update the insert to use actual exported dimensions:
```typescript
// Calculate actual exported dimensions
const exportScale = frame.exportScale || 2; // Default to 2 for backwards compatibility
const actualWidth = Math.round(frame.width * exportScale);
const actualHeight = Math.round(frame.height * exportScale);

const { data: campaign, error: campaignError } = await supabase
  .from('campaign_queue')
  .insert({
    user_id: userId,
    brand_id: validBrandId,
    source: 'figma',
    source_url: frame.figmaUrl || null,
    source_metadata: {
      frameName: frame.name,
      figmaWidth: frame.width,      // Original Figma dimensions
      figmaHeight: frame.height,
      exportScale: exportScale       // Store for reference
    },
    name: frame.name,
    image_url: imageUrl,
    image_width: actualWidth,       // ACTUAL exported width
    image_height: actualHeight,     // ACTUAL exported height
    provided_subject_line: subjectLine || null,
    provided_preview_text: previewText || null,
    status: 'processing',
    processing_step: 'queued',
    processing_percent: 0
  })
```

**Why this approach:**
- **Backwards compatible**: If `exportScale` is not sent (older plugin versions), defaults to 2
- **Accurate metadata**: `image_width` and `image_height` now reflect actual image dimensions
- **Debugging support**: Original Figma dimensions and scale factor preserved in `source_metadata`

### No Changes Needed to Other Files

The good news is that the core processing functions are already robust:

1. **`auto-slice-v2/index.ts`** - Extracts dimensions from image header (`getImageDimensions`), doesn't rely on passed dimensions
2. **`cropAndUploadSlices`** - Uses `Image.decode()` to get actual dimensions, explicitly ignores passed parameters
3. **`process-campaign-queue/index.ts`** - While it passes `item.image_width` and `item.image_height` to `autoSliceImage`, that function ignores these values

## Data Flow After Fix

```text
Plugin exports frame at {exportScale}x
         ↓
Frame: {width: 600, height: 4500, exportScale: 1}
         ↓
figma-ingest calculates: actualWidth = 600 × 1 = 600
                         actualHeight = 4500 × 1 = 4500
         ↓
campaign_queue stores:
  - image_width: 600 (actual)
  - image_height: 4500 (actual)
  - source_metadata: {figmaWidth: 600, figmaHeight: 4500, exportScale: 1}
         ↓
auto-slice-v2 reads image header → confirms 600×4500 ✓
         ↓
cropAndUploadSlices decodes image → confirms 600×4500 ✓
```

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/figma-ingest/index.ts` | Add `exportScale` to FrameData interface; calculate and store actual dimensions |

## Testing Verification

After deployment:
1. Export a frame >3500px tall from Figma (should use 1x scale)
2. Check `campaign_queue` record:
   - `image_width` = Figma width × 1
   - `image_height` = Figma height × 1
   - `source_metadata.exportScale` = 1
3. Export a frame <3500px tall (should use 2x scale)
4. Check `campaign_queue` record:
   - `image_width` = Figma width × 2
   - `image_height` = Figma height × 2
   - `source_metadata.exportScale` = 2
5. Verify slices are generated correctly for both cases
