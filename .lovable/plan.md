

# Enhanced Link Intelligence System

## Problems Identified

### 1. Single 100-Link Cap Problem
**Current**: Both collections and products share a single 100-link cap
```typescript
const MAX_TOTAL = 100;
// Phase 1: collections (takes first ~60-80)
// Phase 2: products (only gets remaining 20-40)
```
**Result**: O'Neill Canada has 100 collection URLs and 0 product URLs

### 2. Random Product Selection
**Current**: The `search: 'products'` query doesn't prioritize relevant products
**Problem**: A brand with 2000 products gets random ones, not best sellers or new arrivals

### 3. No Weekly Re-crawl
**Current**: Links are only crawled once, manually triggered
**Problem**: Seasonal links become stale - "Winter 2024" exists but "Winter 2025" doesn't

### 4. AI Forcing Wrong Links
**Current Example**: Button says "Shop Winter 2025" but AI matched to "Winter 2024" URL because that's what was indexed
**Root Cause**: The prompts don't explicitly tell Claude to reject version/date mismatches

---

## Solution: Two-Category Link Strategy

### Category 1: Navigation & Collections (UNCAPPED)
- All nav items, collections, category pages
- These rarely change and are essential for proper routing
- Crawl ALL of them without limit

### Category 2: Products (Capped at 100, Smart Selection)
- Prioritize from relevant collections: "best-sellers", "new-arrivals", "featured"
- Cap at 100 to keep index manageable
- Re-crawl weekly to stay current

---

## Implementation Plan

### Fix 1: Restructure `crawl-brand-site/index.ts`

**Phase 1 - Navigation/Collections (NO LIMIT)**
```typescript
// Crawl all navigation and collection pages
const navResponse = await fetch(`${FIRECRAWL_API_URL}/map`, {
  body: JSON.stringify({
    url: `https://${domain}`,
    search: 'collections categories navigation menu',
    limit: 5000,  // High limit - get all nav structure
    includeSubdomains: false
  })
});

// Filter to only collections/pages (not products)
const navUrls = navData.links.filter(url => 
  !url.includes('/products/') && !shouldSkipUrl(url)
);
```

**Phase 2 - Products (Smart 100 cap)**
```typescript
// Priority collections for product discovery
const PRIORITY_COLLECTIONS = [
  'best-sellers', 'bestsellers', 'top-sellers',
  'new-arrivals', 'new', 'just-in', 'latest',
  'featured', 'popular', 'trending',
  'sale', 'clearance'
];

// Search for products from priority collections first
const productResponse = await fetch(`${FIRECRAWL_API_URL}/map`, {
  body: JSON.stringify({
    url: `https://${domain}`,
    search: 'products best sellers new arrivals featured',
    limit: 100,
    includeSubdomains: false
  })
});

// Only keep actual product URLs
const productUrls = productData.links.filter(url => 
  url.includes('/products/') && !shouldSkipUrl(url)
).slice(0, 100);
```

**Final Storage**
- Store nav/collections with `link_type: 'collection'` or `'page'`
- Store products with `link_type: 'product'`
- Total: uncapped collections + 100 products

### Fix 2: Weekly Re-crawl Automation

**Add `last_crawled_at` column to brands table**
```sql
ALTER TABLE brands ADD COLUMN last_crawled_at TIMESTAMPTZ;
```

**Create `weekly-link-recrawl` edge function**
```typescript
// Triggered by Supabase cron job weekly
serve(async (req) => {
  // Find brands that need re-crawling (7+ days old or never crawled)
  const { data: brands } = await supabase
    .from('brands')
    .select('id, domain')
    .or('last_crawled_at.is.null,last_crawled_at.lt.' + sevenDaysAgo);
  
  for (const brand of brands) {
    // Trigger crawl for each brand (stagger to avoid rate limits)
    await supabase.functions.invoke('trigger-sitemap-import', {
      body: { brand_id: brand.id, domain: brand.domain }
    });
  }
});
```

**Add Supabase cron job**
```sql
SELECT cron.schedule(
  'weekly-link-recrawl',
  '0 3 * * 0',  -- Every Sunday at 3am
  $$SELECT net.http_post(
    url := 'https://esrimjavbjdtecszxudc.supabase.co/functions/v1/weekly-link-recrawl',
    headers := '{"Authorization": "Bearer [service_key]"}'::jsonb
  )$$
);
```

### Fix 3: Stricter Date/Version Matching in Prompts

**Update `match-slice-to-link/index.ts` prompt (lines 232-247)**
```typescript
const prompt = `A slice of an email shows: "${sliceDescription}"

Here are all known product/collection links for this brand:
${linkList}

Which link is the CORRECT match for what's shown in the slice?

CRITICAL MATCHING RULES:
1. If the slice shows a SPECIFIC PRODUCT, you MUST find that exact product URL
2. A collection URL is NOT a valid match for a specific product
3. DATE/VERSION MATTERS: "Winter 2025" is NOT the same as "Winter 2024"
   - If slice says "2025" but link says "2024", that is NOT a match
   - If slice mentions a specific year/season, the link MUST match that year/season
4. "Related" is NOT "correct" - a jacket is not the winter-jackets collection
5. If the EXACT link isn't available (right product, right year), respond "none"

Response:
- ONLY the number if you find the EXACT correct link (matching product AND any dates/versions)
- "none" if the specific product/page isn't in the list (even if a similar but wrong version exists)`;
```

**Also update `auto-slice-v2/index.ts` link assignment rules (lines 1470-1503)**
Add to the CRITICAL rules:
```
- DATE/VERSION MATCHING: If the slice mentions "Winter 2025", do NOT use a "Winter 2024" link
- Years, seasons, and versions must match EXACTLY - a 2024 link is WRONG for 2025 content
- When the exact dated version isn't available, set linkSource: 'needs_search'
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/crawl-brand-site/index.ts` | Restructure to uncapped nav + 100 smart products |
| `supabase/functions/match-slice-to-link/index.ts` | Add date/version matching rules to prompts |
| `supabase/functions/auto-slice-v2/index.ts` | Add date/version matching to link assignment |
| NEW: `supabase/functions/weekly-link-recrawl/index.ts` | Weekly automation function |
| Database migration | Add `last_crawled_at` to brands, add cron job |

---

## Expected Outcomes

### Before
- 100 total links (mostly collections, few products)
- No date awareness - "2024" matches "2025"
- Links become stale after initial crawl
- AI forces through wrong links

### After
- Unlimited collections + 100 priority products
- Strict date/version matching - mismatches trigger `needs_search`
- Weekly automated refresh keeps links current
- AI correctly rejects wrong links and triggers web search fallback

### For O'Neill Canada Example
1. "Shop Winter 2025" button would see "Winter 2024" in index
2. Date mismatch detected → `linkSource: 'needs_search'`
3. Web search finds actual `winter-2025` collection URL
4. Correct link used in final HTML

