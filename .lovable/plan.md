

# Fix: Allow Images Over 4000px by Separating AI Resize from Full-Res Slicing

## Root Cause

In `supabase/functions/process-campaign-queue/index.ts`, the `fetchAndUploadImage` function (lines 65-100) resizes the image to a maximum height of **4000px** before converting it to base64:

```typescript
// Line 78
const resizedUrl = getResizedCloudinaryUrl(item.image_url, 600, 4000);
```

This resized image is then used for:
1. **AI auto-slicing** (via `auto-slice-v2`)
2. **Slice cropping for Klaviyo** (via `cropAndUploadSlices`)

The original design intent was:
- **AI processing**: Use a resized image (within 8000px limit)
- **Slice cropping**: Use full-resolution image for high-quality Klaviyo output

Currently, both operations use the 4000px-capped image, which:
- Fails for images taller than 4000px (the symptom you're seeing)
- Produces lower-quality slices for Klaviyo even when it works

## Why This Broke

The 4000px limit was added as a memory optimization ("prevents memory issues with large images"), but it's too restrictive. The `auto-slice-v2` function already has its own resizing logic (`resizeImageForClaude` at line 448) that handles images up to 7900px. The downstream slice cropping should use full resolution.

## Solution

Modify `process-campaign-queue/index.ts` to use **two separate image fetches**:

| Purpose | Max Height | Used By |
|---------|------------|---------|
| AI Analysis | 7900px | `auto-slice-v2`, `analyze-slices`, `generate-email-copy-early` |
| Slice Cropping | No limit (full-res) | `cropAndUploadSlices` |

## Technical Changes

### File: `supabase/functions/process-campaign-queue/index.ts`

**Change 1**: Update `fetchAndUploadImage` to return both a resized version for AI and the original URL for slicing

```typescript
// Current (line 78):
const resizedUrl = getResizedCloudinaryUrl(item.image_url, 600, 4000);

// New approach:
// For AI: resize to 7900px (matches auto-slice-v2 internal limit)
const aiResizedUrl = getResizedCloudinaryUrl(item.image_url, 600, 7900);
// For slicing: use original URL (full resolution)
const originalUrl = item.image_url;
```

**Change 2**: Modify the function signature and return value

```typescript
// Returns both:
// - imageBase64ForAI: Resized for AI processing (7900px max)  
// - imageBase64FullRes: Full resolution for slice cropping
// - imageUrl: Original Cloudinary URL

async function fetchAndUploadImage(
  supabase: any,
  item: any
): Promise<{ 
  imageUrl: string; 
  imageBase64ForAI: string; 
  imageBase64FullRes: string 
} | null>
```

**Change 3**: Fetch the full-res image for slice cropping

After fetching the AI-resized version, also fetch the original for cropping:
```typescript
// For AI analysis
const aiResponse = await fetch(aiResizedUrl);
const aiBase64 = ...;

// For slice cropping (full res)
const fullResResponse = await fetch(originalUrl);
const fullResBase64 = ...;
```

**Change 4**: Update callsites to use appropriate version

- `autoSliceImage()` → use `imageBase64ForAI`
- `detectBrand()` → use `imageBase64ForAI` 
- `cropAndUploadSlices()` → use `imageBase64FullRes`

## Why This Works

1. **AI functions get 7900px max** - Well within Claude's 8000px limit
2. **Slice cropping gets full resolution** - High-quality output for Klaviyo
3. **`auto-slice-v2` internal resize is redundant but harmless** - Its `resizeImageForClaude` will detect image already fits and pass through
4. **Memory is manageable** - Full-res is only decoded once for cropping, not held in memory during AI calls

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/process-campaign-queue/index.ts` | Update `fetchAndUploadImage` to return both AI-sized and full-res base64; update callsites to use appropriate version |

## Alternative Considered

Could increase the 4000px limit to 7900px for everything, but this would:
- Still limit slice quality unnecessarily
- Use more memory than needed for AI calls
- Not match the original design intent

Fetching twice (AI-sized + full-res) is the correct pattern matching the frontend `CampaignCreator.tsx` behavior.

