
# Fix Link Quality and Footer Detection

## Root Causes Identified

### Issue 1: Links Not Finding Actual Product Pages
Looking at the logs and database:
- **JESSA PANT** → `https://iamgia.com/collections/sweats` (wrong - should be `/products/jessa-pant-grey`)
- **BLARE PANELLED SHORT** → `https://iamgia.com/collections/blare-set` (wrong)

Claude IS searching (logs show multiple search attempts), but it's settling for collection pages instead of finding the actual product URLs. The logs show:
```
Let me search for the exact "Jessa Pant" product (not "Jessica"):
Let me search for the actual product URLs:
Based on my searches, I can see t...
```

Claude stopped trying and accepted the collection page. The prompt doesn't clearly tell Claude to keep searching until it finds a `/products/` URL when a single product is visible.

### Issue 2: Footer Content is Being Included as Slices
The database shows the campaign has 17 slices, but slices 7-16 are ALL footer content:
- Slice 7-8: "Shop new arrivals", "Shop Instagram looks" (footer nav)
- Slice 9-10: "Afterpay", "Size guide" (footer nav)
- Slice 11-12: "Most wanted", "Blare collection" (footer nav)
- Slice 13: Footer legal text
- Slice 14-16: Social icons

The `footer_start_percent` is 69%, which is correct - the issue is that the slices BELOW the footer boundary are still being processed, cropped, uploaded, and analyzed.

The `auto-slice-v2` function correctly detects the footer at 932px, but `process-campaign-queue` is slicing and analyzing everything - including the footer content.

---

## Technical Solution

### Change 1: Exclude Footer Slices from Processing (process-campaign-queue)

**File:** `supabase/functions/process-campaign-queue/index.ts`

After auto-slicing, filter out any slices that fall within or below the footer boundary before cropping and uploading.

```typescript
// After autoSliceImage returns, filter slices to EXCLUDE footer content
const contentSlices = sliceResult.slices.filter(slice => {
  // Keep only slices that END at or before the footer start
  // (slices that are entirely above the footer)
  return slice.yBottom <= sliceResult.footerStartY;
});

console.log(`[process] Filtered ${sliceResult.slices.length} -> ${contentSlices.length} slices (excluding footer)`);

// Use contentSlices for cropping and analysis
```

This ensures:
- Footer nav rows are never uploaded
- Footer social icons are never analyzed
- Only marketing content is processed

### Change 2: Improve Product Link Discovery (analyze-slices)

**File:** `supabase/functions/analyze-slices/index.ts`

Strengthen the link instructions to tell Claude that when a specific product name is visible, it MUST find that product's actual page (not a collection). Add campaign context guidance for variants.

Update the LINKS section (lines 103-107) to:

```
**LINKS** - Find the real page for what's shown:
- Header logos -> brand homepage: https://${domain}/
- Single product visible (name like "JESSA PANT", "ISELA TOP") -> search for that product's page, not a collection
  - Search: site:${domain} products [product name]
  - The URL should contain /products/ for individual items
- Multiple products or general CTA -> find the appropriate collection
- Verify links exist with web search

When multiple color/size variants exist for a product:
- Look at the campaign image for context (what color is shown?)
- Pick the variant that matches what's visible in the email
- If unclear, pick the most common/default variant
```

This is natural language guidance, not mechanical rules - trusting Claude to understand the intent.

---

## Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/process-campaign-queue/index.ts` | Filter out slices that fall at or below `footerStartY` before cropping/uploading/analyzing |
| `supabase/functions/analyze-slices/index.ts` | Update LINKS section to emphasize finding product pages and using campaign context for variants |

---

## Expected Results

After these changes:
- **Footer content excluded**: Only 6-7 slices for this I AM GIA campaign (the actual marketing content)
- **Better product links**: Claude will search for `/products/jessa-pant-grey` instead of accepting `/collections/sweats`
- **Variant matching**: When multiple colors exist, Claude uses the campaign image to pick the right one

---

## Technical Details

### Footer Exclusion Logic
```typescript
// In cropAndUploadSlices or before calling it:
const footerStartY = sliceResult.footerStartY;
const contentSlices = sliceResult.slices.filter(s => s.yBottom <= footerStartY);
```

### Campaign Context for Variants
The `fullCampaignImage` is already passed to analyze-slices. Claude can see what color/style is being featured and use that context when multiple product variants exist.
