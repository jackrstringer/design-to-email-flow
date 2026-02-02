

# Limit Firecrawl Scraping to 100 URLs

## Summary

Change the Firecrawl Map API limit from 500 to 100 URLs maximum per crawl.

## Change

| File | Line | Change |
|------|------|--------|
| `supabase/functions/crawl-brand-site/index.ts` | 95 | Change `limit: 500` to `limit: 100` |

## Code Change

```typescript
// Line 93-97: Update the Map API call
body: JSON.stringify({
  url: `https://${domain}`,
  limit: 100,  // Changed from 500 to 100
  includeSubdomains: false
})
```

## Impact

- Crawls will now discover a maximum of 100 URLs per site
- Reduces Firecrawl API credit consumption
- Faster crawl completion times
- The edge function will be redeployed automatically

