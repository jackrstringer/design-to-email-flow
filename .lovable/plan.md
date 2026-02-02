

# Fix Image-Based Footer Processing Issues

## Problem Summary

Two issues were identified:

1. **Figma images not uploaded to Cloudinary**: When using a Figma link, the exported image URL (from `figma-alpha-api.s3.us-west-2.amazonaws.com`) is passed directly to the processing pipeline. The `generateSliceCropUrls` function expects a Cloudinary URL to generate crop transformations, causing all slices to have `imageUrl: null`.

2. **UI stuck at 70%**: The realtime subscription is receiving updates, but the component is re-rendering and causing the subscription to close/reopen rapidly. The job actually completed successfully (database shows 100%, `pending_review` status), but the UI didn't receive the final update.

---

## Root Cause Analysis

```text
CURRENT FLOW (Figma):

┌────────────────┐     ┌────────────────┐     ┌─────────────────────┐
│ Figma URL      │ ──► │ fetch-figma-   │ ──► │ S3 URL returned     │
│ (user input)   │     │ design         │     │ (figma-alpha-api...) │
└────────────────┘     └────────────────┘     └──────────┬──────────┘
                                                         │
                                                         ▼ WRONG!
                                              ┌─────────────────────┐
                                              │ Create job with     │
                                              │ S3 URL as image_url │
                                              └──────────┬──────────┘
                                                         │
                                                         ▼
                                              ┌─────────────────────┐
                                              │ process-footer-queue│
                                              │ tries to parse      │
                                              │ Cloudinary URL ──► ❌│
                                              └─────────────────────┘

CORRECT FLOW:

┌────────────────┐     ┌────────────────┐     ┌─────────────────────┐
│ Figma URL      │ ──► │ fetch-figma-   │ ──► │ S3 URL returned     │
│ (user input)   │     │ design         │     │                     │
└────────────────┘     └────────────────┘     └──────────┬──────────┘
                                                         │
                                                         ▼ NEW STEP
                                              ┌─────────────────────┐
                                              │ Upload S3 image to  │
                                              │ Cloudinary          │
                                              └──────────┬──────────┘
                                                         │
                                                         ▼
                                              ┌─────────────────────┐
                                              │ Create job with     │
                                              │ Cloudinary URL      │
                                              └──────────┬──────────┘
                                                         │
                                                         ▼
                                              ┌─────────────────────┐
                                              │ process-footer-queue│
                                              │ parses Cloudinary   │
                                              │ URL ──► ✓           │
                                              └─────────────────────┘
```

---

## Fixes Required

### Fix 1: Upload Figma Image to Cloudinary Before Processing

**File: `src/components/FooterBuilderModal.tsx`**

Update `handleImageFooterFigmaFetch` to upload the Figma image to Cloudinary:

```typescript
const handleImageFooterFigmaFetch = useCallback(async () => {
  if (!figmaUrl.trim()) {
    toast.error('Please enter a Figma URL');
    return;
  }

  setIsFetchingFigma(true);
  try {
    // Step 1: Fetch Figma design (gets S3 URL)
    const { data, error } = await supabase.functions.invoke('fetch-figma-design', {
      body: { figmaUrl }
    });

    if (error) throw error;
    if (!data.success || !data.exportedImageUrl) {
      throw new Error(data.error || 'Failed to fetch Figma design');
    }

    // Step 2: Upload to Cloudinary (NEW!)
    toast.info('Uploading image...');
    const { data: uploadData, error: uploadError } = await supabase.functions.invoke('upload-to-cloudinary', {
      body: { 
        imageUrl: data.exportedImageUrl,  // Pass URL instead of base64
        folder: `brands/${brand.domain}/footer-images`
      }
    });

    if (uploadError || !uploadData?.url) {
      throw new Error('Failed to upload image to Cloudinary');
    }

    // Step 3: Create job with Cloudinary URL
    const jobId = await createFooterJob({
      brandId: brand.id,
      source: 'figma',
      sourceUrl: figmaUrl,
      imageUrl: uploadData.url,  // Cloudinary URL instead of S3
      cloudinaryPublicId: uploadData.public_id,
      imageWidth: data.dimensions?.width || 600,
      imageHeight: data.dimensions?.height || 400,
    });
    
    // ...rest of function
  } catch (error) {
    // ...error handling
  }
}, [...]);
```

### Fix 2: Update upload-to-cloudinary to Accept URL

**File: `supabase/functions/upload-to-cloudinary/index.ts`**

The function currently accepts `imageData` (base64). Add support for `imageUrl` parameter that fetches and uploads from a URL:

```typescript
// Add to existing function
if (imageUrl) {
  // Fetch the image and upload directly
  const response = await fetch(imageUrl);
  const arrayBuffer = await response.arrayBuffer();
  const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
  // Upload to Cloudinary...
}
```

### Fix 3: Stabilize Realtime Subscription

**File: `src/hooks/useFooterProcessingJob.ts`**

The subscription is being recreated on every render because `options.onComplete` and `options.onError` are in the dependency array but are not stable references. Fix by using refs:

```typescript
export function useFooterProcessingJob(options: UseFooterProcessingJobOptions = {}) {
  // Store callbacks in refs to avoid re-subscribing
  const onCompleteRef = useRef(options.onComplete);
  const onErrorRef = useRef(options.onError);
  
  useEffect(() => {
    onCompleteRef.current = options.onComplete;
    onErrorRef.current = options.onError;
  }, [options.onComplete, options.onError]);

  useEffect(() => {
    if (!jobId) return;

    const channel = supabase
      .channel(`footer-job-${jobId}`)
      .on('postgres_changes', {...}, (payload) => {
        // Use refs instead of direct references
        if (updatedJob.status === 'pending_review') {
          onCompleteRef.current?.(updatedJob);
        }
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [jobId]);  // Remove options from dependencies
}
```

### Fix 4: Handle Non-Cloudinary URLs in Edge Function

**File: `supabase/functions/process-footer-queue/index.ts`**

Add a fallback in `generateSliceCropUrls` to handle non-Cloudinary URLs by uploading them first or returning the original slices with a warning:

```typescript
function generateSliceCropUrls(...) {
  // Try to parse Cloudinary URL
  const match = originalImageUrl.match(/(https:\/\/res\.cloudinary\.com\/...)/);
  
  if (!match) {
    // If not Cloudinary, we can't crop - need to upload first
    // For now, mark slices as needing processing
    console.warn('[process-footer] Image not on Cloudinary, crop URLs unavailable');
    
    // Return slices without crop URLs - frontend should handle this
    return slices.map((slice, i) => ({
      ...slice,
      imageUrl: null,
      needsUpload: true,  // Signal to frontend
      // ... other fields
    }));
  }
  // ... existing logic
}
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/FooterBuilderModal.tsx` | Upload Figma image to Cloudinary before creating job |
| `src/hooks/useFooterProcessingJob.ts` | Stabilize subscription by using refs for callbacks |
| `supabase/functions/upload-to-cloudinary/index.ts` | Add support for uploading from URL (not just base64) |
| `supabase/functions/process-footer-queue/index.ts` | Add warning/fallback for non-Cloudinary URLs |

---

## Expected Outcome

After these fixes:

1. Figma images will be uploaded to Cloudinary before processing
2. Slice crop URLs will be generated correctly
3. Realtime updates will be received reliably
4. UI will properly transition to the review step at 100%

