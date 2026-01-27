
# Fix Product Link Quality and Alt Text CTA Logic

## Problem Analysis

Two issues identified in `supabase/functions/analyze-slices/index.ts`:

1. **Artificial search limit of 5** (line 222) - Not enough searches to find each product's actual `/products/` URL
2. **Overly broad "Click to shop" instruction** (line 73) - Tells Claude to add CTA text even when no button is visible

## Solution

### Change 1: Remove Web Search Limit

**Line 222** - Change from 5 to unlimited (or very high number)

```typescript
// Current
max_uses: 5,

// New - let Claude search as much as needed to find correct links
max_uses: 50,
```

This allows Claude to search for each product individually and verify links exist.

### Change 2: Rewrite Alt Text Instructions to Require Visible CTA

**Lines 70-85** - Replace the alt text section with explicit CTA detection rules:

```
**ALT TEXT** (max 200 chars) - Capture the marketing message:
- If there's a headline, offer text, body copy visible -> capture the key message
- Include any visible text that communicates value (discounts, product benefits, urgency, etc.)

CTA TEXT RULES (CRITICAL):
- ONLY include "Click to shop" / "Click to [action]" when there is a VISIBLE CTA BUTTON in the slice
- A CTA button is a distinct rectangular/pill element with action text like "SHOP NOW", "BUY", "ORDER", "ADD TO CART"
- Product name/price text alone (like "JESSA PANT - $99") is NOT a CTA - do not add "Click to shop"
- If the slice just shows a product image with its name, describe the product without "Click to shop"

Examples:
- Product image showing "JESSA PANT" with no button -> "Jessa Pant."
- Product with visible "SHOP NOW" button -> "Jessa Pant. Click to shop now."
- Hero headline "New Arrivals" with no button -> "New Arrivals."
- Hero with "SHOP THE COLLECTION" button -> "New Arrivals. Click to shop the collection."
- Solid color divider -> "" (empty)
```

### Change 3: Prioritize Product URLs Over Collections

**Lines 101-108** - Rewrite link instructions to be product-first:

```
**LINKS** - Find the EXACT product page, not collections:
- For header_logo slices or standalone brand logos -> use brand homepage: https://${domain}/
- For slices showing a SPECIFIC PRODUCT (name visible like "JESSA PANT"):
  - Search: "site:${domain}/products/ [product name]" to find the direct product page
  - Product pages (/products/jessa-pant-grey) are ALWAYS preferred over collection pages
  - NEVER link a single-product slice to a collection - find the actual product URL
- For slices showing MULTIPLE products or general CTAs -> find the appropriate collection
- Use web search to verify URLs exist - search as many times as needed
- Homepage is LAST RESORT (except for header logos)

PRODUCT LINK PRIORITY:
1. /products/[exact-product-slug] - BEST (e.g., /products/jessa-pant-grey)
2. /collections/[category] - Only for multi-product slices
3. Homepage - Only if nothing else found

For the Jessa Pant example: search "site:iamgia.com products jessa pant" -> find https://iamgia.com/products/jessa-pant-grey
```

## File Changes

| File | Change |
|------|--------|
| `supabase/functions/analyze-slices/index.ts` | 1. Increase max_uses from 5 to 50 (line 222) |
| `supabase/functions/analyze-slices/index.ts` | 2. Rewrite alt text section to require visible CTA for "Click to shop" (lines 70-85) |
| `supabase/functions/analyze-slices/index.ts` | 3. Rewrite link section to prioritize /products/ URLs (lines 101-108) |

## Expected Results

After these changes:
- **JESSA PANT** slice -> Links to `https://iamgia.com/products/jessa-pant-grey` (not `/collections/sweats`)
- **BLARE PANELLED SHORT** -> Links to the actual product page
- Product images without visible buttons -> Alt text like "Jessa Pant." (no "Click to shop")
- Product images WITH visible "SHOP NOW" button -> Alt text like "Jessa Pant. Click to shop now."

Claude will search as many times as needed in a single pass to find all correct links.
