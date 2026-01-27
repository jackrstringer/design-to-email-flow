
# Fix Link Discovery - Enable Web Fetch + Learning System

## Root Cause Identified

**We're only using `web_search`, but native Claude uses `web_search` + `web_fetch` together.**

Here's what native Claude did (from your screenshot):
1. `web_search` returned collections and irrelevant results (same bad results we get)
2. Claude **fetched the actual page** (`Fetched Sweats`) 
3. Extracted `/products/jessa-pant-grey` from the page HTML

Our system only has `web_search` enabled, so Claude can only work with search result snippets. It can never fetch the actual pages to find embedded product URLs.

---

## Technical Solution

### Change 1: Enable `web_fetch` Tool in analyze-slices

**File:** `supabase/functions/analyze-slices/index.ts`

Add the `web_fetch` tool alongside `web_search`:

```typescript
tools: [
  {
    type: 'web_search_20250305',
    name: 'web_search',
    max_uses: 50,
  },
  {
    type: 'web_fetch_20250910',
    name: 'web_fetch',
    max_uses: 10,
    allowed_domains: [domain], // Only fetch from brand domain
  }
]
```

Also add the required beta header:
```typescript
headers: {
  'Content-Type': 'application/json',
  'x-api-key': ANTHROPIC_API_KEY,
  'anthropic-version': '2023-06-01',
  'anthropic-beta': 'web-fetch-2025-09-10',
}
```

Update the prompt to guide Claude to fetch pages when needed:
```
**LINKS** - Find the real page for what's shown:
- Header logos -> brand homepage: https://${domain}/
- Single product visible (name like "JESSA PANT") -> find the actual product page:
  1. Search: site:${domain} [product name]
  2. If search only returns collections, FETCH the most relevant collection page
  3. Extract the actual /products/[product-name] URL from the page content
  4. The final link MUST contain /products/ for individual items
- Multiple products or general CTA -> find the appropriate collection
```

### Change 2: Brand Learning System (URL Map)

**File:** `supabase/functions/analyze-slices/index.ts`

Accept brand's known URLs as input and save new discoveries.

Input addition:
```typescript
const { slices, brandUrl, brandDomain, fullCampaignImage, knownProductUrls } = await req.json();
```

Prompt addition:
```
KNOWN PRODUCT URLs for this brand (use these first before searching):
${knownProductUrls ? JSON.stringify(knownProductUrls, null, 2) : 'None available yet'}

If you discover a new product URL that works, include it in your response so we can learn it.
```

Output addition - return discovered URLs:
```typescript
{
  analyses: [...],
  discoveredUrls: [
    { productName: "Jessa Pant", url: "https://iamgia.com/products/jessa-pant-grey" },
    { productName: "Blare Panelled Short", url: "https://iamgia.com/products/blare-panelled-short-red" }
  ]
}
```

**File:** `supabase/functions/process-campaign-queue/index.ts`

After analyze-slices returns, save discovered URLs to the brand:

```typescript
// After analyzeSlices returns:
if (result.discoveredUrls && result.discoveredUrls.length > 0 && brandId) {
  const { data: brand } = await supabase
    .from('brands')
    .select('all_links')
    .eq('id', brandId)
    .single();
  
  const existingLinks = brand?.all_links || {};
  const productUrls = existingLinks.productUrls || {};
  
  for (const discovery of result.discoveredUrls) {
    productUrls[discovery.productName.toLowerCase()] = discovery.url;
  }
  
  await supabase
    .from('brands')
    .update({ all_links: { ...existingLinks, productUrls } })
    .eq('id', brandId);
  
  console.log(`[process] Saved ${result.discoveredUrls.length} discovered URLs to brand`);
}
```

When calling analyze-slices, pass known URLs:
```typescript
const brandLinks = brand?.all_links?.productUrls || {};
const knownProductUrls = Object.entries(brandLinks).map(([name, url]) => ({ name, url }));
```

---

## Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/analyze-slices/index.ts` | Add `web_fetch` tool + beta header, accept/return product URL discoveries |
| `supabase/functions/process-campaign-queue/index.ts` | Pass known URLs to analyze-slices, save discovered URLs to brands table |

---

## Why This Will Work

1. **Web Fetch**: Claude can now do exactly what native Claude did - search, then fetch the actual page content to find the real product URLs buried in the HTML

2. **Learning**: Over time, each brand builds a map of `product name -> URL`. Future campaigns skip the search/fetch entirely and use the cached URL

3. **Domain Restriction**: `allowed_domains: [domain]` ensures Claude only fetches from the brand's site (security + relevance)

---

## Expected Results

After this change, for the I.AM.GIA campaign:
- Claude searches for "Jessa Pant site:iamgia.com"
- Search returns collections (same as before)
- Claude **fetches** the Sweats collection page
- Extracts `/products/jessa-pant-grey` from the HTML
- Returns correct link

Next time "Jessa Pant" appears:
- We pass `knownProductUrls: [{ name: "jessa pant", url: "https://iamgia.com/products/jessa-pant-grey" }]`
- Claude uses the cached URL immediately
- No search/fetch needed
