
# Pipeline Optimization: Cloudinary Server-Side Cropping + Batch Slice Analysis

## Overview
Two major performance optimizations that will reduce pipeline time from ~90-120s to ~40-60s:
1. **Cloudinary Server-Side Cropping**: Replace ImageScript decode/crop/upload with URL generation
2. **Batch Slice Analysis**: Send all slices to Claude in ONE API call

---

## Change 3: Cloudinary Server-Side Cropping

### Current Problem
The `cropAndUploadSlices` function (lines 207-377 in `process-campaign-queue/index.ts`):
- Downloads full image to edge function memory
- Uses ImageScript to decode (~2-3s)
- Crops each slice region
- Encodes each slice as JPEG
- Uploads each slice back to Cloudinary (6+ parallel uploads)
- Total: 15-25 seconds

### Solution

#### Step 1: Database Migration
Add columns to store actual Cloudinary dimensions:

```sql
ALTER TABLE campaign_queue 
ADD COLUMN IF NOT EXISTS actual_image_width INTEGER,
ADD COLUMN IF NOT EXISTS actual_image_height INTEGER,
ADD COLUMN IF NOT EXISTS cloudinary_public_id TEXT;
```

#### Step 2: Modify `figma-ingest` to capture dimensions

The `upload-to-cloudinary` function already returns `width` and `height` (lines 91-94). We need to:
1. Capture these in `figma-ingest`
2. Store them on the campaign_queue record

```typescript
// After Cloudinary upload (around line 139)
const uploadData = await uploadResponse.json();
const imageUrl = uploadData.url || uploadData.secure_url;
const actualWidth = uploadData.width;
const actualHeight = uploadData.height;
const publicId = uploadData.publicId;

// In campaign_queue insert (around line 152)
.insert({
  // ... existing fields ...
  actual_image_width: actualWidth,
  actual_image_height: actualHeight,
  cloudinary_public_id: publicId,
})
```

#### Step 3: Replace `cropAndUploadSlices` with `generateSliceCropUrls`

Remove:
- ImageScript import (line 3)
- `base64ToBytes` and `bytesToBase64` helper functions
- All Image decoding/encoding logic

Replace with URL generation function:

```typescript
function generateSliceCropUrls(
  slices: any[],
  originalImageUrl: string,
  actualWidth: number,
  actualHeight: number
): any[] {
  // Extract Cloudinary base URL and public ID from original URL
  // e.g., "https://res.cloudinary.com/cloud/image/upload/v123/folder/id.png"
  const match = originalImageUrl.match(/(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload)\/[^/]+\/(.+)\.(png|jpg|jpeg|webp)/);
  if (!match) {
    console.error('[process] Could not parse Cloudinary URL:', originalImageUrl);
    return slices; // Fallback: return slices without URLs
  }
  
  const [, baseUrl, publicId] = match;
  
  return slices.map((slice, i) => {
    const yPixel = Math.round((slice.yTop / actualHeight) * actualHeight); // yTop is already in pixels
    const sliceHeight = slice.yBottom - slice.yTop;
    
    if (slice.horizontalSplit && slice.horizontalSplit.columns > 1) {
      // Horizontal split: generate column URLs
      const { columns, gutterPositions } = slice.horizontalSplit;
      const xBoundaries = [
        0,
        ...(gutterPositions || []).map((p: number) => Math.round(actualWidth * p / 100)),
        actualWidth
      ];
      
      const columnUrls: string[] = [];
      for (let col = 0; col < columns; col++) {
        const xLeft = xBoundaries[col];
        const xRight = xBoundaries[col + 1];
        const colWidth = xRight - xLeft;
        
        // Cloudinary crop transformation URL
        const cropUrl = `${baseUrl}/c_crop,x_${xLeft},y_${slice.yTop},w_${colWidth},h_${sliceHeight},q_90,f_jpg/${publicId}`;
        columnUrls.push(cropUrl);
      }
      
      return {
        ...slice,
        imageUrl: columnUrls[0], // Primary column URL
        columnImageUrls: columnUrls,
        width: actualWidth,
        height: sliceHeight,
        startPercent: (slice.yTop / actualHeight) * 100,
        endPercent: (slice.yBottom / actualHeight) * 100,
        type: slice.hasCTA ? 'cta' : 'image',
        column: 0,
        totalColumns: columns,
        rowIndex: i,
      };
    } else {
      // Full-width slice
      const cropUrl = `${baseUrl}/c_crop,x_0,y_${slice.yTop},w_${actualWidth},h_${sliceHeight},q_90,f_jpg/${publicId}`;
      
      return {
        ...slice,
        imageUrl: cropUrl,
        dataUrl: null, // No longer storing base64
        width: actualWidth,
        height: sliceHeight,
        startPercent: (slice.yTop / actualHeight) * 100,
        endPercent: (slice.yBottom / actualHeight) * 100,
        type: slice.hasCTA ? 'cta' : 'image',
        column: 0,
        totalColumns: 1,
        rowIndex: i,
      };
    }
  });
}
```

#### Step 4: Update `process-campaign-queue` to use URL generation

Replace the call to `cropAndUploadSlices` (lines 866-871) with:

```typescript
// === STEP 3.5: Generate Cloudinary crop URLs (instant) ===
const uploadedSlices = generateSliceCropUrls(
  sliceResult.slices,
  imageResult.imageUrl,
  item.actual_image_width || item.image_width || 600,
  item.actual_image_height || item.image_height || 2000
);
```

---

## Change 4: Batch Slice Analysis

### Current Problem
The `analyze-slices` function is called ONCE with ALL slices in a single Claude request, but:
- It sends each slice as a separate base64 image with full data URLs
- The current function is designed for batch, but the process-campaign-queue passes dataUrls
- With URL-based cropping (Change 3), we no longer have dataUrls

### Solution: Modify `analyze-slices` to accept URLs instead of dataUrls

#### Step 1: Update `analyze-slices` to fetch images from URLs

Current input format:
```typescript
{ slices: [{ dataUrl: "data:image/jpeg;base64,...", index: 0 }] }
```

New input format:
```typescript
{ slices: [{ imageUrl: "https://res.cloudinary.com/...", index: 0 }] }
```

Modify the content building section (lines 170-221):

```typescript
// Add each slice image with EXPLICIT labeling
for (let i = 0; i < slices.length; i++) {
  const slice = slices[i];
  
  // Build context string for multi-column slices
  let columnContext = '';
  if (slice.totalColumns && slice.totalColumns > 1) {
    columnContext = ` | COLUMN ${(slice.column ?? 0) + 1} of ${slice.totalColumns} (row ${slice.rowIndex ?? 0})`;
  }
  
  // Add explicit text label BEFORE each slice image
  content.push({
    type: 'text',
    text: `=== SLICE ${i + 1} (index: ${i})${columnContext} ===`
  });
  
  // NEW: Support both URL and dataUrl formats
  if (slice.imageUrl && !slice.dataUrl) {
    // URL-based (new Cloudinary crop URLs)
    content.push({
      type: 'image',
      source: {
        type: 'url',
        url: slice.imageUrl
      }
    });
  } else if (slice.dataUrl) {
    // Legacy dataUrl format (backwards compatible)
    const matches = slice.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (matches) {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: matches[1],
          data: matches[2]
        }
      });
    }
  }
}
```

#### Step 2: Update `analyzeSlices` in `process-campaign-queue`

The current call (lines 896-902) passes `uploadedSlices` which will now have `imageUrl` instead of `dataUrl`. The function needs to:

1. Pass slice URLs instead of dataUrls
2. Pass the full campaign image URL (already resized)

```typescript
// Build slice inputs with URLs (not dataUrls)
const sliceInputs = uploadedSlices.map((slice, index) => ({
  imageUrl: slice.imageUrl,
  index,
  column: slice.column,
  totalColumns: slice.totalColumns,
  rowIndex: slice.rowIndex
}));

const response = await fetch(analyzeUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
  },
  body: JSON.stringify({
    slices: sliceInputs,
    brandDomain: brandContext?.domain || null,
    fullCampaignImage: resizedFullImageUrl, // Now pass URL, not dataUrl
    knownProductUrls
  })
});
```

#### Step 3: Update `analyze-slices` to use URL for full campaign image

Modify the full campaign image handling (lines 176-192):

```typescript
// Add full campaign image FIRST for context (if provided)
if (fullCampaignImage) {
  content.push({
    type: 'text',
    text: '=== REFERENCE IMAGE (DO NOT ANALYZE - context only) ==='
  });
  
  // NEW: Support both URL and dataUrl
  if (fullCampaignImage.startsWith('http')) {
    content.push({
      type: 'image',
      source: {
        type: 'url',
        url: fullCampaignImage
      }
    });
  } else {
    // Legacy dataUrl format
    const fullMatches = fullCampaignImage.match(/^data:([^;]+);base64,(.+)$/);
    if (fullMatches) {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: fullMatches[1],
          data: fullMatches[2]
        }
      });
    }
  }
}
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/figma-ingest/index.ts` | Capture and store `width`, `height`, `publicId` from Cloudinary response |
| `supabase/functions/process-campaign-queue/index.ts` | Remove ImageScript import, remove `cropAndUploadSlices`, add `generateSliceCropUrls`, update `analyzeSlices` call to pass URLs |
| `supabase/functions/analyze-slices/index.ts` | Support URL-based images in addition to base64, use Claude's URL image source |
| Database migration | Add `actual_image_width`, `actual_image_height`, `cloudinary_public_id` columns |

---

## Technical Notes

### Cloudinary URL Crop Transformation Format
```
https://res.cloudinary.com/{cloud_name}/image/upload/c_crop,x_{x},y_{y},w_{w},h_{h},q_90,f_jpg/{public_id}
```

Parameters:
- `c_crop`: Crop mode
- `x_{x}`: X offset from left edge (pixels)
- `y_{y}`: Y offset from top edge (pixels)  
- `w_{w}`: Width of crop region (pixels)
- `h_{h}`: Height of crop region (pixels)
- `q_90`: JPEG quality 90%
- `f_jpg`: Force JPEG format

### Claude URL Image Support
Anthropic's API supports URL-based images:
```typescript
{
  type: 'image',
  source: {
    type: 'url',
    url: 'https://example.com/image.jpg'
  }
}
```

This eliminates the need to fetch and convert to base64.

### Slice Coordinate System
The `auto-slice-v2` function returns slices with `yTop` and `yBottom` in **pixel values** (not percentages). These can be used directly for Cloudinary cropping.

---

## Expected Performance Impact

| Step | Before | After | Savings |
|------|--------|-------|---------|
| Image decode (ImageScript) | ~2-3s | 0s | ~2-3s |
| Slice cropping | ~5-10s | 0s (URL generation instant) | ~5-10s |
| Parallel uploads | ~8-12s | 0s (no uploads needed) | ~8-12s |
| Analyze slices (7 base64 images) | ~30-45s | ~15-25s (Claude fetches URLs) | ~10-20s |
| **Total savings** | | | **~25-45s** |

---

## Implementation Order

1. **Database migration** - Add columns for image dimensions
2. **figma-ingest** - Capture and store Cloudinary dimensions/publicId
3. **process-campaign-queue** - Replace ImageScript cropping with URL generation
4. **analyze-slices** - Support URL-based images
5. **Deploy and test** - Verify URLs work and pipeline completes

---

## Backwards Compatibility

The analyze-slices function will support BOTH formats:
- New: `{ imageUrl: "https://..." }` 
- Legacy: `{ dataUrl: "data:image/..." }`

This ensures any pending campaigns or manual flows continue to work.
