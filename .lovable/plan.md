

# Fix: Alt Text / Link Coordinate Scaling Bug

## Problem Summary

Alt text is misaligned from actual slice content because the database stores potentially incorrect dimensions (e.g., Figma's 1x dimensions while actual images are 2x, or compression changed dimensions). The coordinate scaling calculations use wrong original dimensions, causing a "snowball" effect where misalignment gets progressively worse down the image.

### Evidence from Code Analysis

1. **`auto-slice-v2`** correctly parses TRUE dimensions from the image header (lines 1243-1264) and returns `imageWidth`/`imageHeight` as the actual dimensions of what Claude analyzed
2. **`process-campaign-queue`** uses `item.image_width` and `item.image_height` from the database (lines 830-834, 891-898, 923-929)
3. If the database has wrong dimensions (e.g., 600x7058 but actual Cloudinary image is 1200x14116), then:
   - `cropSlicesViaCloudinary` calculates wrong scale factors
   - `fetchSliceDataUrlsForAnalysis` calculates wrong crop coordinates
   - Alt text gets assigned to wrong visual regions

### The Coordinate Space Mismatch

```text
Database says: 600x7058 (potentially WRONG - Figma 1x dimensions)
Actual Cloudinary image: 1200x14116 (2x exported)
AI-resized image (c_limit,w_600,h_5000): 425x5000

auto-slice-v2 returns: imageWidth=425, imageHeight=5000 (dimensions of AI-sized image)
                       slices with coordinates in 425x5000 space

cropSlicesViaCloudinary uses:
  - originalWidth=600, originalHeight=7058 (from DB - WRONG)
  - analyzedWidth=425, analyzedHeight=5000 (from auto-slice-v2 - correct)
  - scaleY = 7058/5000 = 1.4116 (WRONG - should be 14116/5000 = 2.8232)
  - Crops point to WRONG regions in actual image!
```

## Solution

Fetch and verify **actual original image dimensions** from the Cloudinary asset at processing time, rather than trusting database values.

## Implementation Changes

### File: `supabase/functions/process-campaign-queue/index.ts`

#### 1. Add `getImageDimensions` helper (after line 74)

Copy the dimension-parsing function from `auto-slice-v2`:

```typescript
function getImageDimensions(base64: string): { width: number; height: number } | null {
  const bytesToDecode = Math.min(base64.length, 50000);
  const binaryStr = atob(base64.substring(0, bytesToDecode));
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  
  // PNG
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
    const width = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
    const height = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
    return { width, height };
  }
  
  // JPEG
  if (bytes[0] === 0xFF && bytes[1] === 0xD8) {
    let offset = 2;
    while (offset < bytes.length - 10) {
      if (bytes[offset] !== 0xFF) { offset++; continue; }
      const marker = bytes[offset + 1];
      if (marker === 0xC0 || marker === 0xC2) {
        const height = (bytes[offset + 5] << 8) | bytes[offset + 6];
        const width = (bytes[offset + 7] << 8) | bytes[offset + 8];
        return { width, height };
      }
      if (marker >= 0xC0 && marker <= 0xFE && marker !== 0xD8 && marker !== 0xD9 && !(marker >= 0xD0 && marker <= 0xD7)) {
        const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
        offset += 2 + length;
      } else {
        offset++;
      }
    }
  }
  return null;
}
```

#### 2. Modify `fetchAndUploadImage` return type and implementation (lines 78-113)

Change to return actual dimensions of both the original image and AI-sized image:

```typescript
async function fetchAndUploadImage(
  supabase: any,
  item: any
): Promise<{ 
  imageUrl: string; 
  imageBase64ForAI: string;
  actualOriginalWidth: number;
  actualOriginalHeight: number;
  actualAIWidth: number;
  actualAIHeight: number;
} | null> {
  console.log('[process] Step 1: Fetching images and parsing actual dimensions...');

  if (item.image_url) {
    try {
      // 1. Fetch ORIGINAL image header to get actual dimensions (first ~50KB)
      const originalResponse = await fetch(item.image_url, {
        headers: { 'Range': 'bytes=0-50000' }
      });
      if (!originalResponse.ok) throw new Error('Failed to fetch original image header');
      const originalBuffer = await originalResponse.arrayBuffer();
      const originalBase64 = chunkedArrayBufferToBase64(originalBuffer);
      const originalDims = getImageDimensions(originalBase64);
      
      if (!originalDims) {
        console.error('[process] Could not parse original image dimensions, using DB values');
        originalDims = { width: item.image_width || 600, height: item.image_height || 2000 };
      }
      
      console.log('[process] ACTUAL original dimensions:', originalDims.width, 'x', originalDims.height);
      console.log('[process] DB dimensions:', item.image_width, 'x', item.image_height);
      if (originalDims.width !== item.image_width || originalDims.height !== item.image_height) {
        console.warn('[process] ⚠️ DIMENSION MISMATCH! Using actual dimensions from image header.');
      }

      // 2. Fetch AI-sized image
      const aiResizedUrl = getResizedCloudinaryUrl(item.image_url, 600, 5000);
      console.log('[process] AI-sized URL:', aiResizedUrl.substring(0, 80) + '...');
      
      const aiResponse = await fetch(aiResizedUrl);
      if (!aiResponse.ok) throw new Error('Failed to fetch AI-sized image');
      const aiBuffer = await aiResponse.arrayBuffer();
      const aiBase64 = chunkedArrayBufferToBase64(aiBuffer);
      
      // 3. Parse ACTUAL AI dimensions from the fetched image
      const aiDims = getImageDimensions(aiBase64);
      if (!aiDims) throw new Error('Could not parse AI image dimensions');
      
      console.log('[process] Actual AI dimensions:', aiDims.width, 'x', aiDims.height);
      console.log('[process] Fetched AI-sized:', Math.round(aiBuffer.byteLength / 1024), 'KB');
      
      return { 
        imageUrl: item.image_url,
        imageBase64ForAI: aiBase64,
        actualOriginalWidth: originalDims.width,
        actualOriginalHeight: originalDims.height,
        actualAIWidth: aiDims.width,
        actualAIHeight: aiDims.height
      };
    } catch (err) {
      console.error('[process] Failed to fetch image:', err);
      return null;
    }
  }

  console.error('[process] No image_url found on queue item');
  return null;
}
```

#### 3. Update `autoSliceImage` call (lines 830-834)

Pass actual AI dimensions instead of DB dimensions:

```typescript
const slicePromise = autoSliceImage(
  imageResult.imageBase64ForAI,
  imageResult.actualAIWidth,    // Use actual AI dimensions, not DB
  imageResult.actualAIHeight
);
```

#### 4. Update `cropSlicesViaCloudinary` call (lines 891-898)

Use actual original dimensions:

```typescript
const uploadedSlices = await cropSlicesViaCloudinary(
  imageResult.imageUrl,
  sliceResult.slices,
  imageResult.actualOriginalWidth,    // Use actual, not item.image_width
  imageResult.actualOriginalHeight,   // Use actual, not item.image_height
  sliceResult.analyzedWidth,          // From auto-slice-v2
  sliceResult.analyzedHeight
);
```

#### 5. Update `analyzeSlices` call (lines 923-929)

Pass actual original dimensions:

```typescript
const enrichedSlices = await analyzeSlices(
  uploadedSlices,
  imageResult.imageUrl,
  brandContext?.domain || null,
  imageResult.actualOriginalWidth,    // Use actual
  imageResult.actualOriginalHeight    // Use actual
);
```

#### 6. Update database if dimensions were wrong (after line 720)

If we detected a mismatch, update the database so future operations use correct values:

```typescript
// After successful image fetch, update DB if dimensions were wrong
if (imageResult.actualOriginalWidth !== item.image_width || 
    imageResult.actualOriginalHeight !== item.image_height) {
  console.log('[process] Updating DB with correct dimensions');
  await updateQueueItem(supabase, campaignQueueId, {
    image_width: imageResult.actualOriginalWidth,
    image_height: imageResult.actualOriginalHeight
  });
}
```

## Summary of Changes

| Location | Current Value | New Value |
|----------|---------------|-----------|
| Lines 78-113 | Returns `{imageUrl, imageBase64ForAI}` | Returns `{imageUrl, imageBase64ForAI, actualOriginalWidth, actualOriginalHeight, actualAIWidth, actualAIHeight}` |
| Lines 830-834 | `item.image_width`, `item.image_height` | `imageResult.actualAIWidth`, `imageResult.actualAIHeight` |
| Lines 891-898 | `item.image_width`, `item.image_height` | `imageResult.actualOriginalWidth`, `imageResult.actualOriginalHeight` |
| Lines 923-929 | `item.image_width`, `item.image_height` | `imageResult.actualOriginalWidth`, `imageResult.actualOriginalHeight` |
| After line 720 | (none) | Update DB with correct dimensions if mismatch detected |

## Why This Fixes the Problem

1. **Actual Original Dimensions**: By parsing the real Cloudinary image header, we get the TRUE pixel dimensions, regardless of what Figma reported or what the database stored.

2. **Actual AI Dimensions**: By parsing the AI-resized image, we know EXACTLY what c_limit produced (e.g., 425x5000), not what we assumed it would produce.

3. **Consistent Coordinate Spaces**: 
   - `auto-slice-v2` returns coordinates in AI-sized image space (e.g., 425x5000)
   - `cropSlicesViaCloudinary` scales these to actual original space (e.g., 1200x14116)
   - `fetchSliceDataUrlsForAnalysis` scales back to AI space for analysis crops
   - All calculations use the SAME actual dimensions

4. **Self-Healing**: If the database had wrong dimensions, we update them so future operations (and re-processing) use correct values.

## Verification Steps

1. Reprocess the problematic campaign (`decec9f1-f49c-4fa4-98cc-d0b5378bd488`)
2. Check logs for "⚠️ DIMENSION MISMATCH" warning - if it appears, the fix is catching the issue
3. Verify alt text matches visual content in each slice
4. Verify multi-column slices have correct per-column alt text
5. Confirm the campaign renders fully without clipping

## Expected Outcome

- Alt text will correctly describe the visual content shown in each slice
- Coordinate scaling will be consistent throughout the pipeline
- No more "snowball" effect of increasing misalignment down the image
- Both old campaigns (with wrong DB dims) and new ones will work correctly

