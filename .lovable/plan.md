
# Add Navigation Crawling to Sitemap Import

## Problem
Sitemaps typically only include `/products/*` and `/collections/*` URLs. Important pages that appear in the site navigation (like `/pages/recipes`, `/pages/our-story`, `/pages/faq`) are often missing from sitemaps but are crucial destinations for email campaigns.

## Solution
After parsing the sitemap, crawl the brand's homepage to extract navigation links. These are the pages the brand considers important enough to put in their main nav.

---

## Implementation Details

### 1. Add Navigation Extraction Function

```typescript
async function extractNavLinks(domain: string): Promise<Array<{ url: string; title: string; link_type: string }>> {
  try {
    const homepageUrl = `https://${domain}`;
    const response = await fetchWithTimeout(homepageUrl, 15000);
    if (!response.ok) return [];
    
    const html = await response.text();
    const navLinks: Array<{ url: string; title: string; link_type: string }> = [];
    
    // Extract anchor tags from HTML
    const linkRegex = /<a[^>]*href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi;
    let match;
    
    while ((match = linkRegex.exec(html)) !== null) {
      let url = match[1];
      const title = match[2].trim();
      
      // Skip invalid links
      if (!title || url.startsWith('#') || url.startsWith('javascript:') || url.startsWith('mailto:')) continue;
      
      // Convert relative URLs to absolute
      if (url.startsWith('/')) url = `https://${domain}${url}`;
      
      // Only same-domain links
      if (!url.includes(domain)) continue;
      
      // Skip utility pages
      const skipPatterns = ['/cart', '/account', '/login', '/checkout', '/search', '/policies', '/apps/'];
      if (skipPatterns.some(p => url.includes(p))) continue;
      
      // Categorize
      let linkType = 'page';
      if (url.includes('/products/')) linkType = 'product';
      else if (url.includes('/collections/')) linkType = 'collection';
      
      navLinks.push({ url, title, linkType });
    }
    
    // Deduplicate
    const seen = new Set<string>();
    return navLinks.filter(link => {
      if (seen.has(link.url)) return false;
      seen.add(link.url);
      return true;
    });
  } catch (error) {
    console.error('[import-sitemap] Failed to crawl nav:', error);
    return [];
  }
}
```

### 2. Update Import Flow

After sitemap parsing, merge navigation links:

```typescript
// Existing: Parse sitemap
const allUrls = await parseSitemap(sitemapXml, baseUrl);

// NEW: Also crawl homepage navigation
await supabase.from('sitemap_import_jobs').update({ status: 'crawling_nav' }).eq('id', job_id);
console.log('[import-sitemap] Crawling homepage navigation...');
const navLinks = await extractNavLinks(domain);
console.log(`[import-sitemap] Found ${navLinks.length} navigation links`);

// Merge URLs - nav links may have better titles
const urlMap = new Map<string, { url: string; link_type: string; title?: string; source: string }>();

// Add sitemap URLs
for (const url of filteredSitemapUrls) {
  urlMap.set(url.url, { ...url, source: 'sitemap' });
}

// Add/enhance with nav links (page types that sitemap missed)
for (const navLink of navLinks) {
  if (!urlMap.has(navLink.url)) {
    urlMap.set(navLink.url, { 
      url: navLink.url, 
      link_type: navLink.linkType, 
      title: navLink.title,
      source: 'navigation' 
    });
  }
}
```

### 3. Update SKIP_PATTERNS

Remove pages from the skip list that we now want to capture:

```typescript
// BEFORE: Skipping useful pages
const SKIP_PATTERNS = [
  '/cart', '/checkout', '/account', '/login', '/register', '/password',
  '/policies', '/pages/faq', '/pages/contact', '/pages/about',  // ← Remove these
  '/blogs/', '/apps/', '/admin', '/api/', '/sitemap',
  '/search', '/wishlist', '/compare',
];

// AFTER: Only skip utility pages
const SKIP_PATTERNS = [
  '/cart', '/checkout', '/account', '/login', '/register', '/password',
  '/policies', '/apps/', '/admin', '/api/', '/sitemap',
  '/search', '/wishlist', '/compare',
];
```

### 4. Update categorizeUrl to Include Pages

```typescript
function categorizeUrl(url: string): 'product' | 'collection' | 'page' | null {
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes('/products/')) return 'product';
  if (lowerUrl.includes('/collections/')) return 'collection';
  if (lowerUrl.includes('/pages/')) return 'page';  // NEW: Include pages
  return null;
}
```

### 5. Add New Job Status

Update the status enum to include `crawling_nav`:

| Status | Description |
|--------|-------------|
| pending | Job created, waiting to start |
| parsing | Parsing sitemap XML |
| **crawling_nav** | **NEW: Extracting navigation links from homepage** |
| fetching_titles | Fetching page titles for URLs |
| generating_embeddings | Creating vector embeddings |
| complete | Done |
| failed | Error occurred |

### 6. Update UI Status Message

```typescript
case 'crawling_nav':
  return 'Discovering navigation links...';
```

### 7. Track Page Count Separately

Add `page_urls_count` to the job completion data:

```typescript
const productCount = allLinks.filter(l => l.link_type === 'product').length;
const collectionCount = allLinks.filter(l => l.link_type === 'collection').length;
const pageCount = allLinks.filter(l => l.link_type === 'page').length;

// Update job
await supabase.from('sitemap_import_jobs').update({
  status: 'complete',
  product_urls_count: productCount,
  collection_urls_count: collectionCount,
  // Note: page_urls_count would need schema update, or combine in collection count for now
});
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/import-sitemap/index.ts` | Add `extractNavLinks()` function, update SKIP_PATTERNS, update `categorizeUrl()`, integrate nav crawling into flow |
| `src/hooks/useSitemapImport.ts` | Add `crawling_nav` to polling status list |
| `src/components/brand/SitemapImportCard.tsx` | Add status message for `crawling_nav` |
| `src/types/link-intelligence.ts` | Add `crawling_nav` to `SitemapImportJob` status union |

---

## Expected Results

For eskiin.com:

| Source | URLs Found |
|--------|-----------|
| Sitemap | ~25 (products + collections) |
| Navigation | +5-10 (pages like Recipes, Our Story, FAQ) |
| **Total** | ~30-35 indexed links |

This ensures important pages like `/pages/recipes` get captured even when missing from the sitemap.
