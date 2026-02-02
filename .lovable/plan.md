
# Fix Footer Processing Pipeline - Proper Slicing, Links, and Alt-Text

## Problem Summary

The footer processing pipeline is broken:

1. **Incorrect fine_print detection**: Claude is labeling early sections as "fine_print" even when there's no legal text in the image
2. **Over-aggressive filtering**: The `legalCutoffY` filter removes valid slices (CTAs, social icons) because they're below the incorrectly-detected "legal" boundary
3. **Missing link intelligence**: Footers don't use the same `analyze-slices` pipeline as campaigns, resulting in no proper link matching or alt-text generation
4. **No social link prefilling**: Brand's saved social links aren't used to auto-populate social icon columns

**Evidence from logs:**
```
Sliced into 7 sections
Found fine_print slice at Y=112-193  ← WRONG - no fine print in image!
Filtered 6 -> 1 slices (excluding legal section)  ← Lost everything
```

---

## Root Cause Analysis

### 1. Footer Prompt Misidentifies Fine Print

The `buildFooterPrompt` in `auto-slice-v2` instructs Claude to always find a "fine_print" section, but the O'Neill footer image has NO legal text. Claude still labels something as "fine_print" because the prompt says it "MUST be at the bottom."

### 2. Filtering Logic Breaks on Missing Fine Print

In `process-footer-queue`, line 400:
```typescript
const filteredSlices = legalCutoffY 
  ? slices.filter(slice => slice.yBottom <= legalCutoffY)
  : slices;
```

This filters out everything below Y=112, leaving only the tiny logo slice.

### 3. Footer Skips Link Intelligence Pipeline

Campaigns go through:
1. `auto-slice-v2` (slicing + raw link hints)
2. `analyze-slices` (embedding matching + AI link verification + alt-text)

Footers only do step 1 and skip `analyze-slices` entirely. The comment at line 683-685 says:
```typescript
// auto-slice-v2 should have already assigned altText and links when link intelligence was used
// If not, we could call analyze-slices here, but for now we trust auto-slice-v2
```

But `auto-slice-v2` isn't doing proper link matching for footers!

---

## Solution

### Phase 1: Fix Fine Print Detection Logic

**File: `supabase/functions/auto-slice-v2/index.ts`**

Modify `buildFooterPrompt` to make fine_print OPTIONAL:

```text
### FINE PRINT SECTION (may not be present)

The **fine_print** section contains legal/compliance content. Look for ANY of these:
- "Unsubscribe" or "Manage Preferences" text
- Physical mailing address (city, state, zip code)
- "© 2024 Brand Name" or "All rights reserved"

**IMPORTANT**: Only create a "fine_print" slice if you actually see legal/compliance text.
If no fine print is visible, DO NOT create a fine_print slice - the system will append
a legal section automatically.
```

Update output rules:
```text
## Output Rules:
- If fine print is detected → include "fine_print" as last section
- If NO fine print detected → omit fine_print entirely, last visible section becomes final slice
- footerStartY = imageHeight in all cases (entire image is footer)
```

### Phase 2: Fix Filtering Logic in process-footer-queue

**File: `supabase/functions/process-footer-queue/index.ts`**

Change the filtering approach:

1. If `fine_print` slice exists → remove it and use its yTop for legalSection
2. If NO `fine_print` slice → keep ALL slices, create default legalSection to append

```typescript
// Find the fine_print slice from Claude's output
const finePrintSlice = sliceResult.slices.find((s: any) => 
  s.name?.toLowerCase() === 'fine_print'
);

let legalSection: LegalSectionData | null = null;
let imageSlices = sliceResult.slices;

if (finePrintSlice) {
  // Footer HAS fine print - remove it from image slices, convert to HTML
  imageSlices = sliceResult.slices.filter((s: any) => s !== finePrintSlice);
  legalSection = {
    yStart: finePrintSlice.yTop,
    backgroundColor: '#1a1a1a',
    textColor: '#ffffff',
    detectedElements: []
  };
  console.log(`[process-footer] Fine print detected, removed from ${sliceResult.slices.length} slices`);
} else {
  // NO fine print - keep ALL slices, append legal section at end
  imageSlices = sliceResult.slices;
  legalSection = {
    yStart: sliceResult.imageHeight, // Appends AFTER all slices
    backgroundColor: '#1a1a1a',
    textColor: '#ffffff',
    detectedElements: []
  };
  console.log(`[process-footer] No fine print detected, keeping all ${imageSlices.length} slices`);
}
```

Remove the secondary filter in `generateSliceCropUrls`:
```typescript
// REMOVE this filtering - it's now handled above
// const filteredSlices = legalCutoffY 
//   ? slices.filter(slice => slice.yBottom <= legalCutoffY)
//   : slices;
```

### Phase 3: Add analyze-slices Call for Link Intelligence

**File: `supabase/functions/process-footer-queue/index.ts`**

After generating crop URLs, call `analyze-slices` just like `process-campaign-queue` does:

```typescript
// === STEP 5: Analyze slices for links and alt-text (like campaigns) ===
await updateJob(supabase, jobId, {
  processing_step: 'analyzing_slices',
  processing_percent: 75
});

const analyzeUrl = Deno.env.get('SUPABASE_URL') + '/functions/v1/analyze-slices';
const resizedImageUrl = getResizedCloudinaryUrl(job.image_url, 600, 7900);

const sliceInputs = processedSlices.map((slice, index) => ({
  imageUrl: slice.imageUrl,
  index,
  column: slice.column,
  totalColumns: slice.totalColumns,
  rowIndex: slice.rowIndex
}));

const analyzeResponse = await fetch(analyzeUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
  },
  body: JSON.stringify({
    slices: sliceInputs,
    brandDomain: brand?.domain || null,
    brandId: job.brand_id,
    fullCampaignImage: resizedImageUrl
  })
});

if (analyzeResponse.ok) {
  const { analyses } = await analyzeResponse.json();
  // Merge analysis back into slices
  const analysisByIndex = new Map(analyses.map((a: any) => [a.index, a]));
  processedSlices = processedSlices.map((slice, i) => {
    const analysis = analysisByIndex.get(i);
    return {
      ...slice,
      altText: analysis?.altText || slice.altText || `Footer section ${i + 1}`,
      link: analysis?.suggestedLink || slice.link || null,
      isClickable: analysis?.isClickable ?? slice.isClickable ?? true,
      linkVerified: analysis?.linkVerified || false
    };
  });
  console.log(`[process-footer] Analyzed ${analyses.length} slices for links/alt-text`);
}
```

### Phase 4: Social Link Prefilling

**File: `supabase/functions/process-footer-queue/index.ts`**

After slice analysis, prefill social icon links from brand's saved social_links:

```typescript
// === STEP 5.5: Prefill social icon links from brand ===
const { data: brandData } = await supabase
  .from('brands')
  .select('social_links')
  .eq('id', job.brand_id)
  .single();

const socialLinks = brandData?.social_links || [];
const socialPlatformUrls = new Map<string, string>();
for (const social of socialLinks) {
  if (social.platform && social.url) {
    socialPlatformUrls.set(social.platform.toLowerCase(), social.url);
  }
}

// Match social icon slices to platform URLs
for (const slice of processedSlices) {
  if (slice.name?.toLowerCase().includes('social')) {
    // Try to match by alt text or position
    const altLower = (slice.altText || '').toLowerCase();
    for (const [platform, url] of socialPlatformUrls) {
      if (altLower.includes(platform) && !slice.link) {
        slice.link = url;
        slice.linkSource = 'social_profile';
        console.log(`[process-footer] Prefilled ${platform} link: ${url}`);
        break;
      }
    }
  }
}
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/auto-slice-v2/index.ts` | Make fine_print detection optional in footer prompt |
| `supabase/functions/process-footer-queue/index.ts` | Fix filtering logic, add analyze-slices call, add social link prefill |

---

## Expected Outcome After Fix

For the O'Neill footer image (no fine print):

**Before:**
- 1 slice (logo only)
- No links or alt-text
- legal_cutoff_y: 112 (wrong)

**After:**
- 6-7 slices (logo, CTAs, social icons)
- Proper alt-text from analyze-slices
- Links matched via brand_link_index
- Social icons linked to Instagram/Facebook from brand.social_links
- Legal HTML appended at the end

---

## Technical Details

### Process Flow After Fix

```text
1. Upload footer image
2. process-footer-queue starts
3. auto-slice-v2 (isFooterMode=true):
   - Slices entire image
   - If fine_print text visible → label it
   - If no fine_print → don't force-create one
4. process-footer-queue receives slices:
   - If fine_print slice exists → remove it, set legalSection.yStart
   - If no fine_print slice → keep all, append legalSection at end
5. Generate crop URLs for all image slices
6. Call analyze-slices:
   - Embedding match against brand_link_index
   - AI generates alt-text
   - Links verified via HTTP 200
7. Prefill social icon links from brand.social_links
8. Save to footer_processing_jobs
9. User reviews in ImageFooterStudio
```

### Footer Prompt Changes

Key changes to `buildFooterPrompt`:

```diff
- ### FINE PRINT SECTION (will become HTML):
+ ### FINE PRINT SECTION (may or may not be present):

- **CRITICAL**: Name this slice exactly "fine_print" - it will be converted to editable HTML text with Klaviyo merge tags.
+ If you detect legal/compliance content (unsubscribe, address, copyright), 
+ name that slice "fine_print" and it will be converted to HTML.
+ 
+ If there is NO legal/compliance text visible, DO NOT create a fine_print slice.
+ The system will automatically append a legal section after all image slices.

## Output Rules:
- - Last section (fine_print) yBottom MUST equal imageHeight
+ - If fine_print detected: it should be the last slice
+ - If NO fine_print: last visible section ends the slices array
  - footerStartY = imageHeight (entire image is footer)
```
