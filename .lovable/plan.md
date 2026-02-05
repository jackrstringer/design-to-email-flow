
# Fix: Claude Incorrectly Detecting Campaign Content as Footer

## Problem Summary

Claude is detecting footer ~45% of the way through the email, cutting off more than half of the marketing content. The "FOR HER" section header (with products below it) is being misidentified as footer content.

**Evidence from logs:**
- Original image: `601x6317` pixels
- Analyzed image: `381x4000` pixels
- Footer detected at: `1796px` in analyzed coordinates = **44.9%**
- Only 9 slices stored, ending with "for_her_header"
- Entire "FOR HER" product section + any actual footer content is lost

## Root Cause

The footer detection prompt is too aggressive. It lists "section headers" like "For Him" / "For Her" as potential navigation, and Claude is treating "FOR HER" as a navigation element (footer start).

From the prompt:
```
### Footer Starts at the FIRST of These:
...
4. **Horizontal nav links** - "Shop | About | Contact"
5. **Certification badges row** - B Corp, Vegan...
```

Claude may be interpreting "FOR HER" as navigation since it appears after a batch of products and is followed by another product grid.

## Solution

### 1. Strengthen "Marketing Content" Detection in Prompt

Update `auto-slice-v2/index.ts` to add explicit rules:

**Add "NOT footer" clarifications:**
```
### THESE ARE NOT FOOTER (Marketing Content):
- Section dividers like "FOR HIM", "FOR HER", "SHOP MEN", "SHOP WOMEN"
- Any section followed by products with prices
- Any section followed by "SHOP NOW" buttons
- Category headers within the email body
```

**Add a sanity check rule:**
```
### FOOTER DETECTION SANITY CHECK - CRITICAL:
- Footer should typically be in the LAST 30% of the image
- If you identify footer before 60% of the image height, RECONSIDER
- Look for actual footer signals: unsubscribe, address, social icons
- "FOR HIM" / "FOR HER" followed by product grids = NOT footer
```

### 2. Add Server-Side Footer Position Guardrail

In `process-campaign-queue/index.ts`, add a validation after receiving `auto-slice-v2` results:

```typescript
// If footer is detected in first 60% of image, it's likely wrong
const footerPercent = (footerStartY / analyzedHeight) * 100;
if (footerPercent < 60) {
  console.log(`[process] WARNING: Footer detected at ${footerPercent.toFixed(1)}% - seems too early`);
  // Option A: Override to imageHeight (no footer filtering)
  // Option B: Log warning but allow it
  // For now, override to imageHeight to prevent content loss
  footerStartY = result.imageHeight;
  console.log(`[process] Overriding footerStartY to imageHeight (${footerStartY}px) to preserve content`);
}
```

### 3. Better Section Context in Prompt

Add more explicit context about what marketing emails look like:

```
## EMAIL STRUCTURE PATTERNS

Typical marketing email structure:
1. Hero section (0-15%) - Logo, main image, headline
2. Product sections (15-70%) - Products with prices and "Shop Now" buttons
   - Often organized by category: "FOR HIM" / "FOR HER", "NEW ARRIVALS" / "SALE"
3. Footer (70-100%) - Social icons, navigation, legal text, unsubscribe

Category headers like "FOR HIM" or "FOR HER" are MARKETING CONTENT dividers,
NOT footer navigation. If you see products with prices after a header, it's NOT footer.
```

## Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/auto-slice-v2/index.ts` | Strengthen footer detection rules, add "NOT footer" examples |
| `supabase/functions/process-campaign-queue/index.ts` | Add 60% guardrail for footer position |

## Technical Details

### Change 1: Update Footer Detection Prompt (auto-slice-v2)

Add to the "FOOTER DETECTION - CRITICAL" section:

```markdown
### These are NOT footer (Keep in marketing content):

- **Category dividers**: "FOR HIM", "FOR HER", "SHOP MEN", "SHOP WOMEN", "NEW ARRIVALS", "SALE"
- **Any section followed by products with prices** ($XX, $XX.XX)
- **Any section followed by "SHOP NOW" or similar CTA buttons**
- **Lifestyle imagery sections** with promotional content

### Footer Position Sanity Check:

- Footer is typically in the **last 25-35%** of email height
- If you're identifying footer before 60% of the image, STOP and reconsider
- Look for **definitive footer signals**:
  - Unsubscribe / Manage Preferences text
  - Physical address
  - Social media icons (Instagram, Facebook, TikTok)
  - Dense legal/compliance text
  - Brand logo repeated at bottom
```

### Change 2: Add Server-Side Guardrail (process-campaign-queue)

After line ~219 where we get `footerStartY`:

```typescript
const footerStartY = result.footerStartY;
const footerStartPercent = footerStartY / result.imageHeight * 100;

// GUARDRAIL: If footer is detected in first 55% of image, it's likely wrong
// Marketing content often has category headers that look like nav
if (footerStartPercent < 55) {
  console.log(`[process] WARNING: Footer detected at ${footerStartPercent.toFixed(1)}% - too early, likely false positive`);
  console.log(`[process] Overriding footerStartY from ${footerStartY} to ${result.imageHeight} (full image)`);
  footerStartY = result.imageHeight;
}
```

## Expected Outcome

After this fix:
1. Claude will recognize "FOR HER" as a category divider, not footer navigation
2. Even if Claude makes a mistake, the 55% guardrail will prevent content loss
3. The full O'Neill campaign (including FOR HER products) will be processed

## Verification

1. Reprocess the O'Neill campaign
2. Confirm all product sections (FOR HIM + FOR HER) are included
3. Check that actual footer (social icons, legal text) is still correctly excluded
