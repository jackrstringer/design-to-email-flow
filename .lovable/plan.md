

# Fix Image-Based Footer Processing Pipeline

## Problem Summary

The image-based footer processing is failing due to two bugs:

1. **MIME Type Mismatch**: `process-footer-queue` hardcodes `image/png` when calling `auto-slice-v2`, but the actual image is a JPEG. Claude's API returns a 400 error.

2. **Missing Cloudinary Crop URLs**: When the image comes from Figma (S3 URL) without being uploaded to Cloudinary first, the `generateSliceCropUrls` function cannot parse the URL and returns `imageUrl: null` for all slices.

---

## Root Causes

### Bug 1: Hardcoded MIME Type

In `supabase/functions/process-footer-queue/index.ts` line 115:

```typescript
// WRONG: Always sends image/png regardless of actual format
imageDataUrl: `data:image/png;base64,${imageBase64}`,
```

The image is a JPEG (from Cloudinary URL `...jh0sr0mi1rxcfiez7atx.jpg`) but we're telling Claude it's a PNG. Claude validates this and returns:

```
"Image does not match the provided media type image/png"
```

### Bug 2: Figma S3 URLs Not Uploaded to Cloudinary

When using a Figma link, the image URL is an S3 URL:
```
https://figma-alpha-api.s3.us-west-2.amazonaws.com/images/...
```

The `generateSliceCropUrls` function tries to parse this as a Cloudinary URL and fails:
```typescript
const match = originalImageUrl.match(/(https:\/\/res\.cloudinary\.com\/...)/);
// match === null for S3 URLs
```

Result: All slices have `imageUrl: null` and the Review step shows empty image placeholders.

---

## Fixes Required

### Fix 1: Detect MIME Type from Image Data

**File: `supabase/functions/process-footer-queue/index.ts`**

Add a function to detect the image type from the base64 magic bytes:

```typescript
function detectMimeType(base64: string): string {
  // Decode first few bytes to check magic bytes
  const binaryStr = atob(base64.substring(0, 20));
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  
  // PNG: 89 50 4E 47
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
    return 'image/png';
  }
  // JPEG: FF D8 FF
  if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
    return 'image/jpeg';
  }
  // WebP: 52 49 46 46 ... 57 45 42 50
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
    return 'image/webp';
  }
  
  // Fallback: guess from Cloudinary URL extension
  return 'image/jpeg';
}
```

Then update the `autoSliceFooter` call:

```typescript
const mimeType = detectMimeType(imageBase64);
console.log(`[process-footer] Detected MIME type: ${mimeType}`);

body: JSON.stringify({
  imageDataUrl: `data:${mimeType};base64,${imageBase64}`,
  // ... rest unchanged
})
```

### Fix 2: Ensure Figma Images Are Uploaded to Cloudinary First

The frontend (`FooterBuilderModal.tsx`) must upload the Figma S3 URL to Cloudinary BEFORE creating the processing job. This was partially implemented but not consistently applied.

**File: `src/components/FooterBuilderModal.tsx`**

Update `handleImageFooterFigmaFetch`:

```typescript
const handleImageFooterFigmaFetch = async () => {
  // Step 1: Fetch Figma design (gets S3 URL)
  const { data, error } = await supabase.functions.invoke('fetch-figma-design', {
    body: { figmaUrl }
  });
  
  // Step 2: Upload S3 URL to Cloudinary
  const { data: uploadData } = await supabase.functions.invoke('upload-to-cloudinary', {
    body: { 
      imageUrl: data.exportedImageUrl,
      folder: `brands/${brand.domain}/footer-images`
    }
  });
  
  // Step 3: Create job with Cloudinary URL
  const jobId = await createFooterJob({
    imageUrl: uploadData.url,  // Cloudinary URL, not S3
    cloudinaryPublicId: uploadData.public_id,
    // ...
  });
};
```

### Fix 3: Validate Cloudinary URL Before Processing

**File: `supabase/functions/process-footer-queue/index.ts`**

Add validation at the start:

```typescript
// Validate image is on Cloudinary (required for crop URLs)
if (!job.image_url.includes('cloudinary.com')) {
  console.error('[process-footer] Image must be hosted on Cloudinary');
  await updateJob(supabase, jobId, {
    status: 'failed',
    error_message: 'Image must be uploaded to Cloudinary first'
  });
  return new Response(
    JSON.stringify({ success: false, error: 'Image not on Cloudinary' }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/process-footer-queue/index.ts` | Add MIME type detection, validate Cloudinary URL |
| `src/components/FooterBuilderModal.tsx` | Ensure Figma images are uploaded to Cloudinary before job creation |

---

## Technical Summary

The pipeline architecture is correct - the problem is two small bugs:

1. **MIME type detection**: Detect from image bytes instead of hardcoding `image/png`
2. **Cloudinary requirement**: Validate that the image URL is a Cloudinary URL (required for server-side cropping)

After these fixes:
- JPEGs will be sent to Claude with the correct MIME type
- Figma images will be uploaded to Cloudinary before processing
- Slice crop URLs will be generated correctly
- The Review step will display the sliced images with editable links/alt text

