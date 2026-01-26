
# Fix: Slice Y-Positioning Mismatch After Height Constraint Change

## Root Cause Analysis

The slicing coordinates are misaligned because of a dimension mismatch between:

1. **What Claude analyzes**: The resized image (454×5000) after `c_limit,w_600,h_5000`
2. **What `cropSlicesViaCloudinary` uses for cropping**: Original image dimensions (600×6610)

When `auto-slice-v2` receives the base64 image, it reads the TRUE dimensions from the header (454×5000 - the resized version). It returns Y coordinates based on those dimensions. But `cropSlicesViaCloudinary` then uses `item.image_width` (600) and `item.image_height` (6610) to crop the original image - without scaling the coordinates.

**Example of the bug:**
- Claude says "5-column block at y=3361" (in the 5000px-tall analyzed image)
- This should be at y = 3361 × (6610/5000) = **4443px** in the original image
- But without scaling, we crop at y=3361 in the 6610px image = wrong position

## Solution

Scale the slice coordinates returned by `auto-slice-v2` to match the original image dimensions before cropping.

### Changes Required

**File: `supabase/functions/process-campaign-queue/index.ts`**

#### 1. Capture Analyzed Image Dimensions from auto-slice-v2 Response

The `auto-slice-v2` response already includes `imageWidth` and `imageHeight` - these are the dimensions of the image Claude actually analyzed. We need to use these for scaling.

```typescript
// After calling autoSliceImage:
const sliceResult = await autoSliceImage(...);

// sliceResult contains:
// - slices: coordinates in AI-analyzed image space (e.g., 454×5000)
// - imageWidth/imageHeight from auto-slice-v2 response (e.g., 454, 5000)
```

#### 2. Modify autoSliceImage to Return Analyzed Dimensions

Update `autoSliceImage()` return type to include the actual analyzed dimensions:

```typescript
async function autoSliceImage(
  imageBase64: string,
  imageWidth: number,
  imageHeight: number
): Promise<{ 
  slices: any[]; 
  footerStartPercent: number;
  analyzedWidth: number;   // Actual dimensions Claude analyzed
  analyzedHeight: number; 
} | null>
```

Return the response's `imageWidth`/`imageHeight` (which are the actual analyzed dimensions):

```typescript
return {
  slices: result.slices || [],
  footerStartPercent,
  analyzedWidth: result.imageWidth,   // e.g., 454
  analyzedHeight: result.imageHeight  // e.g., 5000
};
```

#### 3. Scale Coordinates in cropSlicesViaCloudinary

Pass both the analyzed dimensions (from AI) and original dimensions (from queue item) to `cropSlicesViaCloudinary`. Scale coordinates before cropping:

```typescript
async function cropSlicesViaCloudinary(
  originalImageUrl: string,
  sliceBoundaries: any[],
  originalWidth: number,      // 600 (from item.image_width)
  originalHeight: number,     // 6610 (from item.image_height)
  analyzedWidth: number,      // 454 (from auto-slice-v2)
  analyzedHeight: number      // 5000 (from auto-slice-v2)
): Promise<any[]>
```

Inside the function, scale each coordinate:

```typescript
// Calculate scale factors
const scaleX = originalWidth / analyzedWidth;   // 600/454 = 1.32
const scaleY = originalHeight / analyzedHeight; // 6610/5000 = 1.32

// For each slice, scale the Y coordinates
const yTop = Math.round(slice.yTop * scaleY);
const yBottom = Math.round(slice.yBottom * scaleY);
const sliceHeight = yBottom - yTop;

// For multi-column slices, scale X positions too
const xLeft = Math.round(xBoundaries[col] * scaleX);
const colWidth = Math.round((xBoundaries[col + 1] - xBoundaries[col]) * scaleX);
```

#### 4. Update Call Site

```typescript
const uploadedSlices = await cropSlicesViaCloudinary(
  imageResult.imageUrl,
  sliceResult.slices,
  item.image_width || 600,        // Original dimensions
  item.image_height || 2000,
  sliceResult.analyzedWidth,      // Analyzed dimensions
  sliceResult.analyzedHeight
);
```

### Also Fix: fetchSliceDataUrlsForAnalysis

This function also needs the same scaling logic. Currently it calculates:

```typescript
const scaledY = Math.round(slice.yTop * scale);
```

But `slice.yTop` is already in the analyzed image space. The function should:
1. Use the analyzed dimensions to generate crop URLs for analysis
2. OR scale to original and then back (currently tries to do this but has the wrong base)

Actually, looking more carefully, this function is trying to crop from a **resized** Cloudinary URL. The logic should be:
- The `slice.yTop` is in analyzed-image-space (e.g., 5000px tall)
- We're cropping from a Cloudinary URL that's been resized with `c_limit,w_600,h_5000`
- So the coordinates should already align - but we need to ensure consistency

The safest fix is to ensure `fetchSliceDataUrlsForAnalysis` uses the same analyzed dimensions.

## Summary of Changes

| File | Change |
|------|--------|
| `supabase/functions/process-campaign-queue/index.ts` | 1. Update `autoSliceImage()` to return `analyzedWidth`/`analyzedHeight` |
| | 2. Update `cropSlicesViaCloudinary()` to accept both original and analyzed dimensions |
| | 3. Add coordinate scaling in `cropSlicesViaCloudinary()` before cropping |
| | 4. Update `fetchSliceDataUrlsForAnalysis()` to use analyzed dimensions for consistency |
| | 5. Update call sites to pass new parameters |

## Expected Result

After this fix:
- Claude analyzes a 454×5000 image and returns y=3361 for the 5-column block
- The system scales this to y = 3361 × (6610/5000) = 4443 for the original 600×6610 image
- Cloudinary crops at the correct position
- Slices display in the correct location in the UI
