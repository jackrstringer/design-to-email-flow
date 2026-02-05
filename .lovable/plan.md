
# Fix: ImageKit Slice URLs Missing File Extension

## Problem
Images in the Campaign Queue preview are showing alt text instead of actual images because the ImageKit crop URLs are **missing the file extension**.

**Current broken URL in database:**
```
https://ik.imagekit.io/1juhajh5a/tr:x-0,y-0,w-601,h-139,cm-extract,q-90,f-jpg/campaign-queue/upload_1770305300132_ClE0jdJvs
```

**Required working URL:**
```
https://ik.imagekit.io/1juhajh5a/tr:x-0,y-0,w-601,h-139,cm-extract,q-90,f-jpg/campaign-queue/upload_1770305300132_ClE0jdJvs.png
```

## Root Cause
In `supabase/functions/process-campaign-queue/index.ts`, the regex extracts the path WITHOUT the extension:

```typescript
// Line 304
const ikMatch = originalImageUrl.match(/(https:\/\/ik\.imagekit\.io\/[^/]+)\/(.+)\.(png|jpg|jpeg|webp)/i);
// Group 2 = "campaign-queue/upload_1770305300132_ClE0jdJvs" (no .png)
// Group 3 = "png" (captured separately but never used!)

publicId = ikMatch[2]; // Missing extension!
```

Then when generating crop URL:
```typescript
return `${baseUrl}/tr:x-${xLeft},y-${yTop},w-${width},h-${height},cm-extract,q-90,f-jpg/${publicId}`;
// Missing .png at the end!
```

## The Fix

Update `generateSliceCropUrls` in `process-campaign-queue/index.ts` to include the file extension:

**Lines 302-322:**
```typescript
if (isImageKit) {
  // ImageKit format: https://ik.imagekit.io/{id}/path/to/file.png
  const ikMatch = originalImageUrl.match(/(https:\/\/ik\.imagekit\.io\/[^/]+)\/(.+)\.(png|jpg|jpeg|webp)/i);
  if (!ikMatch) {
    console.error('[process] Could not parse ImageKit URL:', originalImageUrl);
    // ... error handling
  }
  baseUrl = ikMatch[1];
  publicId = ikMatch[2];
  fileExtension = ikMatch[3]; // NEW: Capture extension
}
```

**Line 356 (generateCropUrl function):**
```typescript
function generateCropUrl(xLeft: number, yTop: number, width: number, height: number): string {
  if (isImageKit) {
    // Include file extension!
    return `${baseUrl}/tr:x-${xLeft},y-${yTop},w-${width},h-${height},cm-extract,q-90,f-jpg/${publicId}.${fileExtension}`;
  } else {
    return `${baseUrl}/c_crop,x_${xLeft},y_${yTop},w_${width},h_${height},q_90,f_jpg/${publicId}`;
  }
}
```

## Files to Modify

1. **`supabase/functions/process-campaign-queue/index.ts`**
   - Capture file extension from regex (line ~304)
   - Include extension in crop URL generation (line ~356)

2. **`supabase/functions/process-footer-queue/index.ts`**
   - Same fix for footer slice URLs

3. **`supabase/functions/auto-slice-footer/index.ts`**
   - Same fix for footer cropping

## Technical Details

All three files have the same pattern that needs fixing. The fix involves:

1. Add a `fileExtension` variable alongside `baseUrl` and `publicId`
2. Capture group 3 from the regex (the extension)
3. Append `.${fileExtension}` to the end of ImageKit crop URLs

## Expected Result

After this fix:
- Slice URLs will include `.png` extension
- Images will load correctly in the Campaign Queue preview
- No more alt text showing instead of images

## Testing Plan

1. Reprocess the O'Neill campaign
2. Verify slice URLs in database include file extension
3. Confirm images render in the Campaign Queue preview
