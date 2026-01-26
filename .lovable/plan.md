

# Fix: Force Cloudinary to Actually Resize AI Images

## Problem

The 1x exported images already fit within `c_limit,w_600,h_7900` constraints, so Cloudinary doesn't resize them. No resize = no file size reduction = 4MB PNGs that exceed Claude's 5MB base64 limit.

## Solution

Reduce the max height constraint from 7900 to 5000 pixels. This forces Cloudinary to actually resize tall images, which re-encodes them and dramatically reduces file size.

## Changes

### File: `supabase/functions/process-campaign-queue/index.ts`

Update `getResizedCloudinaryUrl` - change `h_7900` to `h_5000`:

```typescript
// Line ~55
return `${before}c_limit,w_${maxWidth},h_${maxHeight}/${after}`;
```

And update the call site from:
```typescript
const aiResizedUrl = getResizedCloudinaryUrl(item.image_url, 600, 7900);
```
To:
```typescript
const aiResizedUrl = getResizedCloudinaryUrl(item.image_url, 600, 5000);
```

### File: `supabase/functions/generate-email-copy-early/index.ts`

Same change - update the resize call from:
```typescript
finalImageUrl = getResizedCloudinaryUrl(imageUrl, 600, 7900);
```
To:
```typescript
finalImageUrl = getResizedCloudinaryUrl(imageUrl, 600, 5000);
```

## Result

A 600×6610 image will now be resized to ~454×5000, reducing file size from ~4MB to ~1-2MB, well under Claude's limit.

