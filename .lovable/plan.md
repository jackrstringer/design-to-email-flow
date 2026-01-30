
# Replace Sitemap Import with Firecrawl Site Crawling

## Problem
The current sitemap + nav crawling approach has significant limitations:
- **Sitemaps are often incomplete** - typically only include products/collections
- **Nav extraction only gets top-level links** - misses nested pages
- **JavaScript menus don't get parsed** - basic regex can't see dynamic content
- **Nested pages get missed** - no deep crawling capability

## Solution
Replace the sitemap-based approach with **Firecrawl**, which:
- Crawls entire sites starting from the homepage
- Handles JavaScript-rendered content
- Discovers ALL pages, not just what's in the sitemap
- Returns structured data with titles already extracted

**FIRECRAWL_API_KEY is already configured** in the project secrets.

---

## Architecture Overview

```text
Current Flow:
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ trigger-sitemap │ ──► │  import-sitemap  │ ──► │ brand_link_index│
│     -import     │     │ (sitemap + nav)  │     │    (database)   │
└─────────────────┘     └──────────────────┘     └─────────────────┘

New Flow:
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  trigger-site   │ ──► │ crawl-brand-site │ ──► │ brand_link_index│
│     -crawl      │     │   (Firecrawl)    │     │    (database)   │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

---

## Implementation Details

### 1. Create New Edge Function: `crawl-brand-site`

This function will:
1. Accept `brand_id`, `domain`, and `job_id`
2. Call Firecrawl's `/crawl` endpoint to start a site crawl
3. Poll for completion (Firecrawl crawls are async)
4. Process results: filter, categorize, and extract page metadata
5. Generate embeddings for all discovered pages
6. Insert into `brand_link_index`

**Key Firecrawl API usage:**
```typescript
// Start crawl
const crawlResponse = await fetch('https://api.firecrawl.dev/v1/crawl', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    url: `https://${domain}`,
    limit: 200,  // Max pages
    scrapeOptions: {
      formats: ['markdown'],
      onlyMainContent: true
    }
  })
});

// Poll for results
const statusResponse = await fetch(`https://api.firecrawl.dev/v1/crawl/${crawlId}`, {
  headers: { 'Authorization': `Bearer ${FIRECRAWL_API_KEY}` }
});
```

### 2. Update `trigger-sitemap-import` to Support Domain-Only Crawling

**Changes:**
- Rename conceptually to "site crawl" (keep function name for compatibility)
- Make `sitemap_url` optional - if not provided, use domain-based crawling
- Add `crawling` status to the running statuses check
- Call `crawl-brand-site` instead of `import-sitemap` when using Firecrawl

```typescript
// If sitemap_url provided: legacy sitemap import
// If only domain: use Firecrawl crawl
if (sitemap_url) {
  // Call import-sitemap (legacy path)
} else {
  // Call crawl-brand-site (Firecrawl path)
}
```

### 3. Update UI: Remove Sitemap URL Requirement

The import modal will change from:
- "Enter sitemap URL" input field
- To: Simple "Crawl Site" button (domain is already known from brand)

**UI Changes in `SitemapImportCard.tsx`:**
- Remove the sitemap URL input field
- Change button text from "Import" to "Crawl Site"
- Update dialog text: "We'll discover all products, collections, and pages on your site"
- Keep ability to enter sitemap URL as an "advanced option" (optional)

### 4. Update Job Status Messages

Add new status for the crawling phase:
```typescript
case 'crawling':
  return 'Discovering all pages...';
case 'generating_embeddings':
  return 'Processing page titles...';
```

### 5. Update Types and Hook

**`SitemapImportJob` status type:**
Add `'crawling'` to the status union.

**`useSitemapImport` hook:**
- Add `'crawling'` to the list of running statuses for polling
- Update mutation to optionally pass domain-only (no sitemap URL)

---

## File Changes Summary

| File | Action | Changes |
|------|--------|---------|
| `supabase/functions/crawl-brand-site/index.ts` | **Create** | New Firecrawl-based crawling function |
| `supabase/functions/trigger-sitemap-import/index.ts` | **Modify** | Support domain-only crawling, call crawl-brand-site |
| `supabase/config.toml` | **Modify** | Add `crawl-brand-site` function config |
| `src/components/brand/SitemapImportCard.tsx` | **Modify** | Remove sitemap URL input, update UI text |
| `src/hooks/useSitemapImport.ts` | **Modify** | Add 'crawling' status, support domain-only trigger |
| `src/types/link-intelligence.ts` | **Modify** | Add 'crawling' to status union |

---

## Coverage Comparison

| Approach | Coverage |
|----------|----------|
| Sitemap only | Products, collections (if in sitemap) |
| Sitemap + nav | + Top-level nav links |
| **Firecrawl** | **Everything: products, collections, all pages, nested pages, footer links, etc.** |

---

## Technical Details

### Firecrawl Polling Strategy
Firecrawl crawls are async. The function will:
1. Start crawl, receive `crawl_id`
2. Poll every 5 seconds for up to 5 minutes
3. Update job progress in real-time (`urls_found`, `urls_processed`)
4. Handle `completed`, `failed`, and timeout states

### Page Categorization
```typescript
let linkType = 'page';
if (url.includes('/products/')) linkType = 'product';
else if (url.includes('/collections/')) linkType = 'collection';
// All other pages remain as 'page' type
```

### Skip Patterns
Keep existing skip patterns for utility pages:
```typescript
const skipPatterns = [
  '/cart', '/account', '/login', '/checkout', 
  '/search', '/policies', '/apps/', '/admin', '/password'
];
```

---

## Expected Results

For eskiin.com:

| Approach | URLs Found |
|----------|-----------|
| Current (sitemap + nav) | ~26-35 |
| Firecrawl | ~100-200 (all discoverable pages) |

Firecrawl will find `/pages/recipes`, `/pages/our-story`, `/pages/faq`, and everything else linked anywhere on the site - including footer links, nested product pages, and JavaScript-rendered navigation items.
