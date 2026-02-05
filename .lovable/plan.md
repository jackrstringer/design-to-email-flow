
# Migration Plan: Cloudinary → ImageKit

## Problem Summary
Figma exports at 2x scale cause campaigns to exceed **10MB**, which hits Cloudinary's free-tier upload limit. ImageKit allows **25MB** on the free tier, solving this bottleneck.

## Credentials Required

You'll need these 3 ImageKit credentials:
1. **IMAGEKIT_PRIVATE_KEY** - Found in Dashboard → Developer Options
2. **IMAGEKIT_URL_ENDPOINT** - Your ImageKit URL endpoint (e.g., `https://ik.imagekit.io/your_id`)

---

## Migration Scope

### Files to Create
| File | Purpose |
|------|---------|
| `supabase/functions/upload-to-imagekit/index.ts` | New upload function using ImageKit REST API |

### Edge Functions to Update (8 files)
| File | Change |
|------|--------|
| `supabase/functions/figma-ingest/index.ts` | Switch from `upload-to-cloudinary` to `upload-to-imagekit` |
| `supabase/functions/process-campaign-queue/index.ts` | Update `getResizedCloudinaryUrl` to handle both Cloudinary and ImageKit URLs |
| `supabase/functions/upload-social-icon/index.ts` | Use ImageKit for social icon uploads |
| `supabase/functions/invert-logo/index.ts` | Use ImageKit for inverted logo uploads |
| `supabase/functions/process-brand-logo/index.ts` | Use ImageKit for logo processing |
| `supabase/functions/auto-slice-footer/index.ts` | Update crop URL generation for ImageKit |
| `supabase/functions/process-footer-queue/index.ts` | Update resize URL function |
| `supabase/functions/generate-email-copy-early/index.ts` | Update resize URL function |

### Frontend Components to Update (12 files)
| File | Change |
|------|--------|
| `src/hooks/useBrandAssets.ts` | Change to `upload-to-imagekit` |
| `src/hooks/useDomCapture.ts` | Change to `upload-to-imagekit` |
| `src/hooks/useScreenCapture.ts` | Change to `upload-to-imagekit` |
| `src/components/AssetCollectionModal.tsx` | Change to `upload-to-imagekit` |
| `src/components/BrandSetupModal.tsx` | Change to `upload-to-imagekit` |
| `src/components/FooterBuilderModal.tsx` | Change to `upload-to-imagekit` |
| `src/components/brand/BrandIdentitySection.tsx` | Change to `upload-to-imagekit` |
| `src/components/brand/BrandIdentityCompact.tsx` | Change to `upload-to-imagekit` |
| `src/components/dashboard/BrandOnboardingModal.tsx` | Change to `upload-to-imagekit` |
| `src/components/dashboard/CampaignCreator.tsx` | Change to `upload-to-imagekit` |
| `src/components/dashboard/NewBrandModal.tsx` | Change to `upload-to-imagekit` |
| `src/components/queue/TestUploadModal.tsx` | Change to `upload-to-imagekit` |
| `src/pages/SimpleUpload.tsx` | Change to `upload-to-imagekit` |

---

## Technical Implementation

### 1. New Upload Function: `upload-to-imagekit`

```typescript
// ImageKit Upload API
// Endpoint: https://upload.imagekit.io/api/v1/files/upload
// Auth: Basic Auth with privateKey

const formData = new FormData();
formData.append('file', base64DataOrUrl);  // Supports base64 or URL
formData.append('fileName', `upload_${timestamp}.png`);
formData.append('folder', folder);

const response = await fetch('https://upload.imagekit.io/api/v1/files/upload', {
  method: 'POST',
  headers: {
    'Authorization': `Basic ${btoa(IMAGEKIT_PRIVATE_KEY + ':')}`
  },
  body: formData
});

// Response: { fileId, name, url, width, height, filePath, ... }
```

**Return format** (same as Cloudinary for compatibility):
```json
{
  "url": "https://ik.imagekit.io/{id}/path/to/file.png",
  "publicId": "fileId_from_imagekit",
  "width": 600,
  "height": 4000
}
```

### 2. URL Transformation Function (Dual-CDN Support)

Create a unified function that handles both Cloudinary and ImageKit URLs:

```typescript
function getResizedImageUrl(url: string, maxWidth: number, maxHeight: number): string {
  // Handle ImageKit URLs
  if (url.includes('ik.imagekit.io')) {
    // ImageKit format: https://ik.imagekit.io/{id}/path/to/file.png
    // Transform: https://ik.imagekit.io/{id}/tr:w-600,h-7900,c-at_max/path/to/file.png
    const match = url.match(/(https:\/\/ik\.imagekit\.io\/[^/]+)\/(.+)/);
    if (match) {
      const [, base, path] = match;
      return `${base}/tr:w-${maxWidth},h-${maxHeight},c-at_max/${path}`;
    }
    return url;
  }
  
  // Handle Cloudinary URLs (existing logic)
  if (url.includes('cloudinary.com')) {
    const uploadIndex = url.indexOf('/upload/');
    if (uploadIndex === -1) return url;
    const before = url.substring(0, uploadIndex + 8);
    const after = url.substring(uploadIndex + 8);
    return `${before}c_limit,w_${maxWidth},h_${maxHeight}/${after}`;
  }
  
  return url;
}
```

### 3. Crop URL Generation for Slices

```typescript
function generateSliceCropUrl(baseUrl: string, x: number, y: number, w: number, h: number): string {
  // ImageKit crop: tr:x-0,y-100,w-600,h-200,cm-extract
  if (baseUrl.includes('ik.imagekit.io')) {
    const match = baseUrl.match(/(https:\/\/ik\.imagekit\.io\/[^/]+)\/(.+)/);
    if (match) {
      const [, base, path] = match;
      return `${base}/tr:x-${x},y-${y},w-${w},h-${h},cm-extract,q-90,f-jpg/${path}`;
    }
  }
  
  // Cloudinary crop (existing)
  if (baseUrl.includes('cloudinary.com')) {
    // ... existing logic
  }
  
  return baseUrl;
}
```

### 4. ImageKit Transformation Reference

| Operation | Cloudinary | ImageKit |
|-----------|------------|----------|
| Resize (fit) | `c_limit,w_600,h_4000` | `tr:w-600,h-4000,c-at_max` |
| Crop | `c_crop,x_0,y_100,w_600,h_200` | `tr:x-0,y-100,w-600,h-200,cm-extract` |
| Quality | `q_90` | `q-90` |
| Format | `f_jpg` | `f-jpg` |
| Negate | `e_negate` | `e-negative` (or handled differently) |

---

## Migration Strategy

### Phase 1: Create Upload Function + Request Secrets
1. Create `upload-to-imagekit` edge function
2. Add to `supabase/config.toml`
3. Request ImageKit secrets from you
4. Test with a sample upload

### Phase 2: Update Campaign Pipeline (Critical Path)
1. Update `figma-ingest` to use new function
2. Update `process-campaign-queue` with dual-CDN URL transformer
3. Update `generateSliceCropUrls` for ImageKit
4. Test full campaign processing

### Phase 3: Update Remaining Functions
1. Update `upload-social-icon` and `invert-logo`
2. Update `process-brand-logo`
3. Update footer-related functions

### Phase 4: Update Frontend
1. Search-and-replace `upload-to-cloudinary` → `upload-to-imagekit` across all frontend files
2. Test all upload flows

---

## Backward Compatibility

- **Existing Cloudinary URLs in database will still work** - they remain on Cloudinary CDN
- **URL transformation functions will detect CDN and apply correct syntax**
- **New uploads go to ImageKit; old assets stay on Cloudinary**
- Keep Cloudinary secrets temporarily for existing assets

---

## Config Changes

Add to `supabase/config.toml`:
```toml
[functions.upload-to-imagekit]
verify_jwt = false
```

---

## Testing Checklist

1. Upload a 2x Figma frame (>10MB) - should succeed on ImageKit
2. Verify crop URLs work for slices
3. Verify resize URLs work for AI analysis
4. Test social icon upload
5. Test logo upload/invert
6. Test frontend upload flows (brand setup, test upload modal, etc.)

---

## Estimated Changes
- **1 new file** (upload-to-imagekit)
- **8 edge functions** updated
- **13 frontend files** updated (mostly find-replace)
- **1 config file** updated

Ready to proceed once you provide the ImageKit credentials.
