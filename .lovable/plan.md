
# Fix: Slice Y-Positioning Mismatch - IMPLEMENTED

## Root Cause (Fixed)

The slicing coordinates were misaligned because of a dimension mismatch between:
1. **What Claude analyzes**: The resized image (e.g., 454×5000) after `c_limit,w_600,h_5000`
2. **What `cropSlicesViaCloudinary` was using for cropping**: Original image dimensions (e.g., 600×6610)

Without scaling, Y coordinates from the AI (in analyzed-image-space) were applied directly to the original image, causing slices to appear too high.

## Solution Implemented

### Changes Made to `supabase/functions/process-campaign-queue/index.ts`:

1. **`autoSliceImage()` now returns analyzed dimensions**
   - Returns `{ slices, footerStartPercent, analyzedWidth, analyzedHeight }`
   - `analyzedWidth`/`analyzedHeight` are the actual dimensions Claude analyzed

2. **`cropSlicesViaCloudinary()` accepts both dimension sets and scales coordinates**
   - New signature: `(originalImageUrl, sliceBoundaries, originalWidth, originalHeight, analyzedWidth, analyzedHeight)`
   - Calculates scale factors: `scaleX = originalWidth / analyzedWidth`, `scaleY = originalHeight / analyzedHeight`
   - Scales all Y coordinates (`yTop`, `yBottom`) and X coordinates (for multi-column slices)
   - Stored slice coordinates are now in original-image-space

3. **`fetchSliceDataUrlsForAnalysis()` updated for consistency**
   - Now correctly handles slices with original-image-space coordinates
   - Scales back to AI-analysis-space when generating crop URLs for the resized image

4. **Call site updated**
   - Passes `sliceResult.analyzedWidth` and `sliceResult.analyzedHeight` to `cropSlicesViaCloudinary`

## Expected Result

- Claude says "5-column block at y=3361" (in 5000px-tall analyzed image)
- System scales to y = 3361 × (6610/5000) = 4443px for original 600×6610 image
- Cloudinary crops at the correct position
- Slices display correctly in UI
