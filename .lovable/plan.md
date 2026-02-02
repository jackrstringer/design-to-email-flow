
# Fix Link Crawling: Better Error Handling + Use Map API

## Problem Summary

The link crawling is failing immediately due to **two issues**:

1. **Firecrawl credits exhausted** - The API returns a 402 error: "Insufficient credits to perform this request"
2. **Silent failures** - The error message isn't being shown to users; jobs just get marked as "failed" without clear feedback

The current implementation uses Firecrawl's **Crawl API** which:
- Scrapes full page content (markdown) for every page
- Consumes many more credits per URL
- Takes longer to complete

## Root Cause

From the logs:
```
Firecrawl API error: 402 {"success":false,"error":"Insufficient credits..."}
```

The `crawl-brand-site` function calls `/v1/crawl` with `formats: ['markdown']` which downloads full content for each page. This is expensive and unnecessary for link discovery.

---

## Solution

### Phase 1: Switch to Firecrawl Map API (Much Cheaper)

Firecrawl's **Map API** (`/v1/map`) is designed specifically for URL discovery:
- Returns only URLs (no content scraping)
- Up to 5,000 URLs per call
- Uses significantly fewer credits
- Returns results immediately (no polling needed)

This is perfect for our use case - we just need to discover URLs, then generate embeddings from page titles.

### Phase 2: Better Error Messages

When Firecrawl fails (402, 429, etc.), show the user a clear error with actionable guidance:
- "Firecrawl credits exhausted" → Show upgrade prompt
- "Rate limited" → Show retry guidance
- Generic errors → Show the actual error message

### Phase 3: Live Progress Updates

Currently `urls_found` stays at 0 until the entire crawl completes. With the Map API, we get all URLs in a single response, so we can immediately update the count.

---

## Implementation Details

### Update crawl-brand-site to Use Map API

```typescript
// BEFORE: Crawl API (expensive, slow)
const crawlResponse = await fetch(`${FIRECRAWL_API_URL}/crawl`, {
  method: 'POST',
  body: JSON.stringify({
    url: `https://${domain}`,
    limit: 200,
    scrapeOptions: { formats: ['markdown'] }  // Downloads full content!
  })
});
// Then poll for completion...

// AFTER: Map API (cheap, fast)
const mapResponse = await fetch(`${FIRECRAWL_API_URL}/map`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${FIRECRAWL_API_KEY}` },
  body: JSON.stringify({
    url: `https://${domain}`,
    limit: 500,  // Max URLs to return
    includeSubdomains: false
  })
});

const mapResult = await mapResponse.json();
// mapResult.links is an array of all discovered URLs - no polling needed!
```

### Better Error Handling with User-Friendly Messages

```typescript
if (!mapResponse.ok) {
  const errorData = await mapResponse.json();
  
  let userMessage = 'Failed to crawl site';
  if (mapResponse.status === 402) {
    userMessage = 'Firecrawl API credits exhausted. Please upgrade your plan at firecrawl.dev/pricing';
  } else if (mapResponse.status === 429) {
    userMessage = 'Rate limited by Firecrawl. Please try again in a few minutes.';
  } else if (errorData.error) {
    userMessage = errorData.error;
  }
  
  // Save the user-friendly error to the job
  await supabase
    .from('sitemap_import_jobs')
    .update({ 
      status: 'failed',
      error_message: userMessage
    })
    .eq('id', job_id);
  
  throw new Error(userMessage);
}
```

### Immediate URLs Found Update

With Map API, we get all URLs instantly:

```typescript
const mapResult = await mapResponse.json();
const allUrls = mapResult.links || [];

// Update immediately with count
await supabase
  .from('sitemap_import_jobs')
  .update({ 
    status: 'generating_embeddings',
    urls_found: allUrls.length,
    updated_at: new Date().toISOString()
  })
  .eq('id', job_id);

console.log(`[crawl-brand-site] Map found ${allUrls.length} URLs`);
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/crawl-brand-site/index.ts` | Replace Crawl API with Map API, better error messages, immediate URL count update |
| `src/components/brand/SitemapImportCard.tsx` | Show error_message more prominently for failed jobs |

---

## New crawl-brand-site Flow

```text
1. User clicks "Crawl Site"
2. trigger-sitemap-import creates job, calls crawl-brand-site
3. crawl-brand-site calls Firecrawl Map API (single request, ~1-3 seconds)
4. Map API returns list of all discovered URLs
5. Immediately update job with urls_found count
6. Filter URLs (skip /cart, /account, etc.)
7. Fetch page titles via lightweight HEAD requests or scrape metadata
8. Generate embeddings in batches
9. Save to brand_link_index
10. Mark job complete
```

---

## Expected Outcome

1. **Credits issue visible**: If Firecrawl is out of credits, user sees clear message
2. **Faster discovery**: Map API returns URLs in seconds vs minutes for Crawl
3. **Lower cost**: Map uses ~1/10th the credits of Crawl
4. **Immediate feedback**: URLs found count updates instantly after Map call
5. **Better errors**: All API errors shown to user with actionable guidance

---

## Immediate Fix for Credits Issue

You need to add credits to your Firecrawl account at https://firecrawl.dev/pricing. Once that's done, the Map API will work and be much more efficient with credits.
