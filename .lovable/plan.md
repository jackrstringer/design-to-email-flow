

# Simplify the Link Instructions

## Problem
I over-prompted the link section. Claude doesn't need numbered priority lists and detailed search strategies - it found `/products/jessa-pant-grey` instantly when asked naturally.

## Solution
Replace the verbose instructions with a simple, natural directive.

### Current (lines 103-116) - Too Much:
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
```

### New (simple and natural):
```
**LINKS** - Find the real page for what's shown:
- Header logos -> brand homepage: https://${domain}/
- Single product visible -> find that product's actual page (use web search)
- Multiple products or general CTA -> find the appropriate collection
- Verify links exist with web search
```

## File Change

| File | Change |
|------|--------|
| `supabase/functions/analyze-slices/index.ts` | Replace lines 103-116 with 4-line simple version |

