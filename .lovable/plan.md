
# Fix: Memory-Efficient Image Processing Pipeline

## Problem Summary

The `process-campaign-queue` function crashes with "Memory limit exceeded" when processing 1x-scaled large images. The crash happens during the **dual-fetch step** where both AI-sized and full-resolution images are loaded into memory simultaneously.

| Metric | Value |
|--------|-------|
| Image dimensions | 600 x 6610 px |
| File size | ~3.8 MB |
| Memory usage (dual-fetch) | ~23 MB+ peak |
| Edge function limit | ~150-256 MB |
| Crash point | Line 86-113 (parallel fetch + base64 conversion) |

## Root Cause

The current `fetchAndUploadImage` function (lines 67-132):

1. Fetches **both** AI-sized and full-res images in parallel
2. Holds **both** in memory as `Uint8Array`
3. Converts **both** to base64 using inefficient string concatenation
4. Returns both base64 strings, keeping them in memory throughout processing

The string concatenation pattern is particularly memory-hungry:
```typescript
let binary = '';
for (let i = 0; i < uint8Array.length; i++) {
  binary += String.fromCharCode(uint8Array[i]);  // Creates new string each iteration
}
```

## Solution

Eliminate the dual-fetch pattern entirely. Instead:

1. **Fetch only AI-sized image** for initial processing (slicing, brand detection)
2. **Use Cloudinary server-side cropping** for slice generation instead of client-side ImageScript cropping
3. This means we never need the full-res image in edge function memory

### Architecture Change

```text
BEFORE (broken):
fetchAndUploadImage → [AI-sized base64 + Full-res base64] → autoSliceImage → cropAndUploadSlices
                                                                                    ↓
                                                               Decode full-res with ImageScript
                                                                    ↓
                                                               Crop each slice in memory

AFTER (fixed):
fetchAndUploadImage → [AI-sized base64 only] → autoSliceImage → cropSlicesViaCloudinary
                                                                        ↓
                                                    Use Cloudinary URL transformations
                                                    (c_crop,x_0,y_100,w_600,h_500)
                                                                        ↓
                                                    Cloudinary does the cropping server-side
                                                    (zero memory in edge function)
```

## Technical Changes

### File: `supabase/functions/process-campaign-queue/index.ts`

**Change 1: Simplify `fetchAndUploadImage` (lines 67-132)**

Remove dual-fetch, return only AI-sized version:

```typescript
async function fetchAndUploadImage(
  supabase: any,
  item: any
): Promise<{ imageUrl: string; imageBase64ForAI: string } | null> {
  console.log('[process] Step 1: Fetching AI-sized image only...');

  if (item.image_url) {
    try {
      // For AI processing: resize to 7900px max
      const aiResizedUrl = getResizedCloudinaryUrl(item.image_url, 600, 7900);
      console.log('[process] AI-sized URL:', aiResizedUrl.substring(0, 80) + '...');
      
      const response = await fetch(aiResizedUrl);
      if (!response.ok) throw new Error('Failed to fetch AI-sized image');
      
      const buffer = await response.arrayBuffer();
      
      // Use chunked base64 conversion (memory efficient)
      const base64 = chunkedArrayBufferToBase64(buffer);
      
      console.log('[process] Fetched AI-sized:', Math.round(buffer.byteLength / 1024), 'KB');
      
      return { imageUrl: item.image_url, imageBase64ForAI: base64 };
    } catch (err) {
      console.error('[process] Failed to fetch image:', err);
      return null;
    }
  }
  return null;
}
```

**Change 2: Add memory-efficient base64 conversion**

```typescript
// Chunked base64 conversion to avoid stack overflow on large images
function chunkedArrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 32768; // 32KB chunks
  let result = '';
  
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    result += String.fromCharCode.apply(null, Array.from(chunk));
  }
  
  return btoa(result);
}
```

**Change 3: Replace `cropAndUploadSlices` with Cloudinary-based cropping**

Instead of downloading full-res, decoding with ImageScript, cropping, and re-uploading:

```typescript
async function cropSlicesViaCloudinary(
  originalImageUrl: string,
  sliceBoundaries: any[],
  imageWidth: number,
  imageHeight: number
): Promise<any[]> {
  console.log('[process] Step 3.5: Generating slice URLs via Cloudinary transformations...');

  const uploadedSlices = [];

  for (let i = 0; i < sliceBoundaries.length; i++) {
    const slice = sliceBoundaries[i];
    const yTop = slice.yTop;
    const yBottom = slice.yBottom;
    const sliceHeight = yBottom - yTop;

    // Use Cloudinary's server-side cropping
    // Format: /c_crop,x_0,y_{yTop},w_{width},h_{height}/
    const croppedUrl = getCloudinaryCropUrl(originalImageUrl, 0, yTop, imageWidth, sliceHeight);
    
    uploadedSlices.push({
      ...slice,
      imageUrl: croppedUrl,  // Direct Cloudinary URL, no upload needed
      width: imageWidth,
      height: sliceHeight,
      // ... other properties
    });
  }

  return uploadedSlices;
}

function getCloudinaryCropUrl(url: string, x: number, y: number, w: number, h: number): string {
  const uploadIndex = url.indexOf('/upload/');
  if (uploadIndex === -1) return url;
  
  const before = url.substring(0, uploadIndex + 8);
  const after = url.substring(uploadIndex + 8);
  
  return `${before}c_crop,x_${x},y_${y},w_${w},h_${h}/${after}`;
}
```

**Change 4: Update main processing flow**

Remove `imageBase64FullRes` from the flow, pass only `imageBase64ForAI`:

```typescript
// Step 1: Fetch image (AI-sized only)
const imageResult = await fetchAndUploadImage(supabase, item);
// imageResult now only has: { imageUrl, imageBase64ForAI }

// Step 3: Auto-slice (uses AI-sized base64)
const sliceResult = await autoSliceImage(imageResult.imageBase64ForAI, ...);

// Step 3.5: Generate slice URLs (uses Cloudinary server-side cropping)
const uploadedSlices = await cropSlicesViaCloudinary(
  imageResult.imageUrl,  // Original Cloudinary URL
  sliceResult.slices,
  item.image_width,
  item.image_height
);
```

## Why This Works

| Aspect | Before | After |
|--------|--------|-------|
| Full-res in memory | Yes (~3.8MB+) | Never |
| AI-sized in memory | Yes (~2MB) | Yes (~2MB) |
| ImageScript decode | Full image | None |
| Slice cropping | Client-side | Cloudinary server-side |
| Total memory peak | ~23MB+ | ~5MB |

## Alternative Considered

Could use streaming/lazy fetching for full-res, but:
- Still requires ImageScript decode (memory heavy)
- More complex implementation
- Cloudinary cropping is zero-cost and faster

## Horizontal Split Handling

For slices with `horizontalSplit`, we'll generate multiple Cloudinary URLs with different x/y/w/h parameters:

```typescript
// For a 3-column split at positions [33.33, 66.66]:
// Column 0: c_crop,x_0,y_{yTop},w_200,h_{height}
// Column 1: c_crop,x_200,y_{yTop},w_200,h_{height}
// Column 2: c_crop,x_400,y_{yTop},w_200,h_{height}
```

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/process-campaign-queue/index.ts` | Remove dual-fetch, add chunked base64, replace ImageScript cropping with Cloudinary URL transformations |

## Testing Verification

After implementation:
1. Upload a tall frame (>3500px) from Figma at 1x scale
2. Verify campaign enters queue and progresses past 5%
3. Verify slices are generated correctly
4. Verify slice URLs point to Cloudinary crop transformations
5. Verify final email renders correctly in Klaviyo preview
