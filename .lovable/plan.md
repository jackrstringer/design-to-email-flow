
# Fix Image Footer Studio: Incorrect Links + Missing Slice

## Problems Identified

### Problem 1: Links Show `https://null/collections/...`

**Root Cause**: The `process-footer-queue` function doesn't pass the brand's domain to `analyze-slices`. It sets `brandDomain: null` (line 788), so when the web search fallback constructs URLs, it uses `null` as the domain.

**Evidence from logs**:
```
[analyze-slices] Starting { brandDomain: null }
```

**The Fix**: Fetch the brand's `domain` field and pass it to `analyze-slices`:

```typescript
// In process-footer-queue/index.ts, line 586-587
const { data: brand } = await supabase
  .from('brands')
  .select('website_url, link_preferences, domain')  // ADD domain
  .eq('id', job.brand_id)
  .single();

// Store domain for later use
const brandDomain = brand?.domain || null;

// Then at line 788-789
body: JSON.stringify({
  slices: sliceInputs,
  brandDomain: brandDomain,  // PASS the actual domain
  brandId: job.brand_id,
  fullCampaignImage: resizedImageUrl
})
```

### Problem 2: Missing "SALE FOR HER" Slice (Black Button at Bottom)

**Root Cause**: Looking at the slices data from the database, there are only 6 image slices before the social icons. The image shows:
1. Logo
2. "Founded by Jack O'Neill" tagline  
3. SHOP FOR HIM button
4. SHOP FOR HER button
5. SALE FOR HIM button (black)
6. SALE FOR HER button (black)  <-- This one is missing/merged
7. Social icons

The auto-slice-v2 function is incorrectly slicing - it's creating only 6 sections when there should be 7 (before social icons).

**The Fix**: This is a Claude vision interpretation issue. The footer prompt needs to emphasize detecting ALL visible CTA buttons, even if they have similar styling. We should add a rule to the footer slicing prompt in `auto-slice-v2`:

Add to the footer prompt rules:
```
### RULE 6: SEPARATE BUTTONS BY CONTENT
If there are multiple buttons with similar styling but different text (e.g., "SHOP FOR HIM" and "SHOP FOR HER", or "SALE FOR HIM" and "SALE FOR HER"), each button MUST be a separate slice. Never merge buttons with different text content.
```

### Problem 3: Remove Preview Section

The user mentioned removing a "preview section" - this refers to removing unnecessary UI elements. Looking at the ImageFooterStudio component, there's a Legal Section Editor at the bottom that shows settings. If the user wants a cleaner view, we could make this collapsible or remove redundant preview display.

---

## Implementation

### Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/process-footer-queue/index.ts` | Fetch `domain` from brands table, pass to analyze-slices |
| `supabase/functions/auto-slice-v2/index.ts` | Add Rule 6 to footer prompt about separating buttons by text content |

### Code Changes

**1. process-footer-queue/index.ts** - Fix domain passing:

At line 586-587, add `domain` to the SELECT:
```typescript
const { data: brand } = await supabase
  .from('brands')
  .select('website_url, link_preferences, domain')
  .eq('id', job.brand_id)
  .single();
```

Store the domain after the query:
```typescript
let brandDomain: string | null = null;
if (brand) {
  defaultDestinationUrl = brand.website_url || null;
  brandDomain = brand.domain || null;  // ADD THIS
  const prefs = brand.link_preferences as any;
  brandPreferenceRules = prefs?.rules || [];
}
```

At line 787-791, pass the domain:
```typescript
body: JSON.stringify({
  slices: sliceInputs,
  brandDomain: brandDomain,  // Use actual domain
  brandId: job.brand_id,
  fullCampaignImage: resizedImageUrl
})
```

**2. auto-slice-v2/index.ts** - Add button separation rule to footer prompt:

In the `buildFooterPrompt` function (around line 754), add a new rule:

```
### RULE 6: SEPARATE BUTTONS BY TEXT CONTENT
If there are multiple buttons with similar styling but DIFFERENT TEXT (e.g., "SHOP FOR HIM" and "SHOP FOR HER", or "SALE FOR HIM" and "SALE FOR HER"), each button MUST be a separate slice. 
- Count the number of distinct button texts visible
- Create one slice per unique button
- Never merge buttons with different calls-to-action
```

Also update the checklist:
```
☐ Each distinct button text has its own slice (never merge "SHOP FOR HIM" with "SHOP FOR HER")
```

---

## Technical Details

### Why brandDomain is null

In `process-footer-queue`, line 788:
```typescript
brandDomain: null, // Will be fetched inside analyze-slices
```

This comment is misleading - `analyze-slices` does NOT fetch the domain from the database. It only computes domain from passed `brandDomain` or `brandUrl`. Since both are null/undefined, the domain remains null.

### Why Links Show https://null/

In `analyze-slices` legacy web search mode (line 366-370):
```typescript
Brand: ${domain || 'Unknown'}
...
- Header logos -> brand homepage: https://${domain}/
```

When domain is null, this becomes `https://null/` and Claude returns paths like `/collections/mens` which get concatenated incorrectly.

### Expected Outcome After Fix

1. Links will use `oneillcanada.com` domain: `https://oneillcanada.com/collections/mens`
2. All 7 CTA buttons will be detected as separate slices (including both SALE buttons)
3. The footer will render correctly with all clickable sections
