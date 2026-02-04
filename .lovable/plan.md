
# Fix Link Matching: Product Slices Need Product URLs

## Problem Summary

The link matching logic is fundamentally broken. When Claude sees a specific product (e.g., "FWC Cruz Snow Jacket"), it matches to a collection URL (`/collections/mens-winter-jackets`) because:

1. **No distinction between product vs collection matching** - The prompt says "find the best match" but doesn't tell Claude that a collection is NOT a valid match for a specific product
2. **"Best match" ≠ "Correct match"** - A collection containing jackets is semantically related to a jacket, but it's the wrong link
3. **No web search fallback trigger** - Because Claude "found a match", `needs_search` is never set

### What Should Happen

| Slice Shows | Index Has | Correct Behavior |
|-------------|-----------|------------------|
| "FWC Cruz Snow Jacket" | No product URL for that jacket | `linkSource: 'needs_search'` → triggers web search for exact product |
| "FWC Cruz Snow Jacket" | Collection `mens-winter-jackets` | **NOT a match** - still set `needs_search` |
| "Shop Our Winter Collection" | Collection `mens-winter-jackets` | Valid match - use collection URL |
| Generic "SHOP NOW" | Default URL configured | Use default destination |

### What's Currently Happening

Claude matches "FWC Cruz Snow Jacket" to `mens-winter-jackets` collection because:
- The prompt says "find the best matching product/collection"
- Claude interprets "winter jacket" as related to "winter jackets collection"
- Since there's "a match", `needs_search` is never triggered

## Solution

Fix the prompts in two places:

### Fix 1: `auto-slice-v2/index.ts` - Link Assignment Section (lines 1445-1496)

The current prompt at line 1471-1472:
```
b. Check available brand links - find the best matching product/collection based on visible text and imagery
```

**Change to:**
```
b. Check available brand links - but ONLY match if the EXACT product/page exists:
   - If slice shows a SPECIFIC PRODUCT (e.g., "FWC Cruz Snow Jacket"), you MUST find that exact product URL
   - A collection URL (e.g., /collections/winter-jackets) is NOT a valid match for a specific product
   - Only match collection URLs when the slice is promoting a COLLECTION (e.g., "Shop Our Winter Collection")
   - When in doubt, set linkSource: 'needs_search' - it's better to trigger a web search than link to the wrong page
```

Also update line 1488-1489 from:
```
- Only use this for specific products not in the available links, NOT for generic CTAs
```

**Change to:**
```
- Use this whenever a SPECIFIC PRODUCT is visible but its exact URL is not in the available links
- A collection URL is NOT a substitute for a product URL
- If you see "Product X" but only have "/collections/category", that's NOT a match - add to needsLinkSearch
```

### Fix 2: `match-slice-to-link/index.ts` - matchViaClaudeList prompt (lines 232-240)

Current prompt:
```
Which link best matches what's shown in the slice? 
- Respond with ONLY the number (e.g., "3")
- If nothing matches well, respond "none"
- Be strict - only match if the product/collection name clearly relates to what's described
```

**Change to:**
```
Which link is the CORRECT match for what's shown in the slice?

CRITICAL MATCHING RULES:
- If the slice shows a SPECIFIC PRODUCT (e.g., "Cruz Snow Jacket"), you MUST find that exact product URL
- A collection URL (e.g., "/collections/winter-jackets") is NOT a valid match for a specific product
- Only match collection URLs when the slice promotes a COLLECTION (e.g., "Shop Our Winter Collection")
- "Related" is NOT the same as "correct" - a jacket is not the winter-jackets collection

Response:
- ONLY the number if you find the EXACT correct link
- "none" if the specific product/page isn't in the list (even if a related collection exists)
```

### Fix 3: Include `link_type` in the matching context

The current `matchViaClaudeList` doesn't show Claude whether each link is a `product` or `collection`. Add this context:

```typescript
const linkList = links.map((l, i) => 
  `${i + 1}. [${l.link_type}] ${l.title || 'Untitled'} → ${l.url}`
).join('\n');
```

This helps Claude understand: "I see 'product_image' in the slice but all these are `[collection]` type links - none of them are the right match."

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/auto-slice-v2/index.ts` | Update link assignment prompt (lines 1469-1496) |
| `supabase/functions/match-slice-to-link/index.ts` | Fix matchViaClaudeList prompt (lines 232-240), add link_type to list |

## Expected Behavior After Fix

| Slice Content | Index State | Result |
|---------------|-------------|--------|
| "FWC Cruz Snow Jacket" product image | Only collection URLs | `linkSource: 'needs_search'` → web search finds `/products/fwc-cruz-snow-jacket` |
| "Shop Our Winter Collection" | Has `mens-winter-jackets` collection | `linkSource: 'index'` → uses collection URL |
| Generic "SHOP NOW" button | Default URL configured | `linkSource: 'default'` → uses default destination |
| Header logo | Default URL configured | `linkSource: 'default'` → uses homepage |

## Why This Works

The key insight: **For brands with thousands of SKUs, we can't pre-index every product.** The system MUST:

1. Recognize when a specific product is shown
2. Acknowledge that a collection URL is not the right match
3. Trigger `needs_search` to find the exact product URL via web search

This way, even with an incomplete index (only collections), the system will still find correct product links on-demand.
