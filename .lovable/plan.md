

# Prioritize Navigation/Collections Over Products in Crawl

## Summary

Use the Firecrawl Map API's `search` parameter to prioritize important navigation links (collections, categories) before filling the remaining quota with product pages.

## Current Behavior

- Single Map API call with `limit: 100`
- Gets whatever URLs Firecrawl finds first (often many products)
- May miss important collection pages if the site has 500+ URLs

## New Behavior: Two-Phase Discovery

### Phase 1: Grab All Navigation/Collection Links (Unlimited)

First Map call uses `search` to filter for collection/category pages:

```typescript
// Phase 1: Get all collections/categories (no limit needed - typically < 50)
const navResponse = await fetch(`${FIRECRAWL_API_URL}/map`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${FIRECRAWL_API_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url: `https://${domain}`,
    search: 'collections',  // Firecrawl filters/prioritizes URLs containing this
    limit: 100,  // Grab up to 100 nav/collection links
    includeSubdomains: false
  })
});
```

### Phase 2: Fill Remaining With Products

Second Map call gets products, limited to fill the remaining quota:

```typescript
// Calculate remaining quota
const remainingQuota = Math.max(0, 100 - navLinks.length);

if (remainingQuota > 0) {
  const productResponse = await fetch(`${FIRECRAWL_API_URL}/map`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${FIRECRAWL_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: `https://${domain}`,
      search: 'products',  // Focus on product pages
      limit: remainingQuota,
      includeSubdomains: false
    })
  });
}
```

### Credit Cost

- **Current**: 1 credit (single map call)
- **New**: 2 credits (two map calls)
- **Benefit**: Much better coverage of important navigation pages

## Implementation

**File: `supabase/functions/crawl-brand-site/index.ts`**

```typescript
// Phase 1: Discover navigation/collection pages first
console.log(`[crawl-brand-site] Phase 1: Discovering collection/nav pages`);

const navResponse = await fetch(`${FIRECRAWL_API_URL}/map`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    url: `https://${domain}`,
    search: 'collections',
    limit: 100,
    includeSubdomains: false
  })
});

// ... error handling ...

const navData = await navResponse.json();
const navUrls: string[] = navData.links || [];
console.log(`[crawl-brand-site] Found ${navUrls.length} collection/nav URLs`);

// Phase 2: Fill remaining quota with products
const MAX_TOTAL = 100;
const navFiltered = navUrls.filter(url => !shouldSkipUrl(url) && url.includes(domain));
const remainingQuota = Math.max(0, MAX_TOTAL - navFiltered.length);

let productUrls: string[] = [];
if (remainingQuota > 0) {
  console.log(`[crawl-brand-site] Phase 2: Discovering up to ${remainingQuota} product pages`);
  
  const productResponse = await fetch(`${FIRECRAWL_API_URL}/map`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      url: `https://${domain}`,
      search: 'products',
      limit: remainingQuota,
      includeSubdomains: false
    })
  });
  
  if (productResponse.ok) {
    const productData = await productResponse.json();
    productUrls = (productData.links || []).filter(url => 
      !shouldSkipUrl(url) && url.includes(domain)
    );
    console.log(`[crawl-brand-site] Found ${productUrls.length} product URLs`);
  }
}

// Merge and deduplicate (nav links take priority)
const allUrls = [...new Set([...navFiltered, ...productUrls])];
console.log(`[crawl-brand-site] Total unique URLs: ${allUrls.length}`);
```

## Expected Outcome

For a typical e-commerce site with 200 products and 30 collections:

| Scenario | Old (Single Call) | New (Two Calls) |
|----------|-------------------|-----------------|
| Collections found | ~10-20 | 30 (all) |
| Products found | ~80-90 | 70 (fills quota) |
| Total | 100 | 100 |
| API Credits | 1 | 2 |

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/crawl-brand-site/index.ts` | Add two-phase Map API calls: collections first, then products |

