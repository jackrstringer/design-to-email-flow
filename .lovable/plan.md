

# Fix Campaign Processing Pipeline Regression (68s → 20s)

## Executive Summary

The campaign processing pipeline regressed from **~20 seconds to ~68 seconds**. The root cause is **triple image downloading** combined with slow Cloudinary fetches.

## Timeline Comparison

### Friday (Working - ~20s)
| Step | Time | Notes |
|------|------|-------|
| Fetch image | ~1s | Fast, likely cached |
| Fire async tasks | ~0s | Immediate |
| Auto-slice | ~10s | Normal |
| Copy generation | Already done | Completed in parallel |
| **Total** | **~20s** | |

### Now (Broken - ~68s)
| Step | Time | Notes |
|------|------|-------|
| Fetch image | 23s | **SLOW - something broke** |
| Fire async tasks | ~0s | But they each re-download the image! |
| Auto-slice | 19s | Normal |
| Early copy re-downloads image | 22s | **Redundant download #2** |
| Poll timeout → sync fallback | 13s | Re-downloads image **#3** |
| **Total** | **~68s** | |

## Root Cause Analysis

### Issue 1: Image Downloaded THREE Times

The `process-campaign-queue` function already has the image in memory as base64 after Step 1, but it passes the **URL** (not the base64) to async functions:

**Current code (line 109-111):**
```typescript
body: JSON.stringify({
  sessionKey,
  imageUrl: resizedImageUrl,  // ← Forces re-download!
  ...
})
```

**Current code (line 726-728):**
```typescript
body: JSON.stringify({
  sessionKey: spellingSessionKey,
  imageUrl: resizedSpellingImageUrl  // ← Forces re-download!
})
```

Both `generate-email-copy-early` and `qa-spelling-check-early` then fetch the image independently, adding 22+ seconds each.

### Issue 2: Slow Initial Image Fetch

The initial fetch went from ~1s to ~23s. Potential causes:
- Cloudinary transformation being processed on-demand (not cached)
- Network issues
- Large transformation parameters

### Issue 3: Sync Fallback Re-downloads Again

When early copy times out (12s limit), the sync fallback at line 969-975 calls `generateCopy()` which fetches the image a THIRD time.

## Solution - Three Fixes

### Fix 1: Pass imageBase64 Instead of imageUrl (CRITICAL)

Modify `startEarlyGeneration` to accept and pass `imageBase64`:

**process-campaign-queue/index.ts:**

```typescript
// Change function signature (line 86-92)
async function startEarlyGeneration(
  supabase: any,
  imageUrl: string,
  imageBase64: string,  // ← ADD THIS
  brandContext: { name: string; domain: string } | null,
  brandId: string | null,
  copyExamples: any
): Promise<string> {
  ...
  body: JSON.stringify({
    sessionKey,
    imageUrl: resizedImageUrl,
    imageBase64: imageBase64,  // ← ADD THIS
    brandContext: brandContext || { name: 'Unknown', domain: null },
    brandId: brandId || null,
    copyExamples: copyExamples || null
  })
}
```

**Call site (line 707-713):**
```typescript
const earlySessionKey = await startEarlyGeneration(
  supabase,
  imageResult.imageUrl,
  imageResult.imageBase64,  // ← ADD THIS
  brandContext,
  brandId,
  copyExamples
);
```

**Spelling check (line 720-730):**
```typescript
fetch(spellingCheckUrl, {
  ...
  body: JSON.stringify({
    sessionKey: spellingSessionKey,
    imageUrl: resizedSpellingImageUrl,
    imageBase64: imageResult.imageBase64  // ← ADD THIS
  })
})
```

**generate-email-copy-early/index.ts (line 55, 361-403):**
```typescript
// Accept imageBase64 in input (line 55)
const { sessionKey, imageUrl, imageBase64, brandContext, brandId, copyExamples } = await req.json();

// Use it if provided (line 361-403)
let base64Data = imageBase64;

if (!base64Data && imageUrl) {
  console.log('[EARLY] No base64 provided, fetching from URL...');
  // existing fetch logic
} else if (base64Data) {
  console.log('[EARLY] Using provided base64, skipping fetch');
}
```

**qa-spelling-check-early/index.ts (line 15, 31-48):**
```typescript
// Accept imageBase64 in input (line 15)
const { sessionKey, imageUrl, imageBase64 } = await req.json();

// Use it if provided (line 31-48)
let base64Data = imageBase64;

if (!base64Data && imageUrl) {
  console.log('[QA-Early] No base64 provided, fetching from URL...');
  // existing fetch logic
} else if (base64Data) {
  console.log('[QA-Early] Using provided base64, skipping fetch');
}
```

### Fix 2: Add Detailed Timing Logs

Add timing breakdown to identify where the 23s delay occurs:

**process-campaign-queue/index.ts (lines 53-77):**
```typescript
async function fetchAndUploadImage(supabase: any, item: any) {
  console.log('[process] Step 1: Starting image fetch...');
  const step1Start = Date.now();
  
  if (item.image_url) {
    try {
      const resizedUrl = getResizedCloudinaryUrl(item.image_url, 600, 4000);
      
      // Log exact URL being fetched
      console.log('[process] Fetching URL:', resizedUrl);
      console.log('[process] Original URL:', item.image_url);
      
      const fetchStart = Date.now();
      const response = await fetch(resizedUrl);
      console.log('[process] HTTP fetch completed:', {
        status: response.status,
        contentLength: response.headers.get('content-length'),
        durationMs: Date.now() - fetchStart
      });
      
      const bufferStart = Date.now();
      const buffer = await response.arrayBuffer();
      console.log('[process] Buffer read:', {
        size: buffer.byteLength,
        durationMs: Date.now() - bufferStart
      });
      
      const base64Start = Date.now();
      const uint8Array = new Uint8Array(buffer);
      const CHUNK_SIZE = 32768;
      let binary = '';
      for (let i = 0; i < uint8Array.length; i += CHUNK_SIZE) {
        const chunk = uint8Array.subarray(i, Math.min(i + CHUNK_SIZE, uint8Array.length));
        binary += String.fromCharCode(...chunk);
      }
      const base64 = btoa(binary);
      console.log('[process] Base64 conversion:', {
        outputLength: base64.length,
        durationMs: Date.now() - base64Start
      });
      
      console.log('[process] Step 1 TOTAL:', Date.now() - step1Start, 'ms');
      return { imageUrl: item.image_url, imageBase64: base64 };
    } catch (err) {
      console.error('[process] Failed to fetch image:', err);
      return null;
    }
  }
  return null;
}
```

### Fix 3: Increase Poll Timeout and Simplify Fallback

**process-campaign-queue/index.ts (line 948):**
```typescript
// From
const maxWaitMs = 12000;

// To - give more time since early copy should complete fast now
const maxWaitMs = 20000;
```

Also, the sync fallback should NOT re-download the image. It should use the imageBase64 already in memory.

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/process-campaign-queue/index.ts` | Pass imageBase64 to async functions, add timing logs, increase poll timeout |
| `supabase/functions/generate-email-copy-early/index.ts` | Accept imageBase64, skip fetch if provided |
| `supabase/functions/qa-spelling-check-early/index.ts` | Accept imageBase64, skip fetch if provided |

## Expected Performance After Fixes

| Step | Before | After |
|------|--------|-------|
| Image fetch + base64 | 23s | ~23s (unchanged, but only happens ONCE) |
| Early copy (uses passed base64) | 22s | ~5s (just Claude call) |
| Spelling check (uses passed base64) | 20s | ~3s (just Haiku call) |
| Auto-slice | 19s | 19s (unchanged) |
| Poll timeout | 12s exceeded | N/A (early copy finishes in ~5s) |
| Sync fallback | 13s | N/A (not needed) |
| **Total** | **68s** | **~25-30s** |

The key insight is that **removing redundant downloads saves 40+ seconds**, even if the initial fetch is still slow.

## Verification Steps

After deployment, process a test campaign and check logs for:

1. **Step 1 timing breakdown** - HTTP fetch vs buffer vs base64 conversion
2. **Exact Cloudinary URL** - look for heavy transformations
3. **Early copy confirmation** - should log "Using provided base64, skipping fetch"
4. **Spelling check confirmation** - should log "Using provided base64, skipping fetch"
5. **Total time** - should be ~25-30s

