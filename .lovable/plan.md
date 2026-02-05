

# Fix: Category Section Link Matching

## Problem Summary

The AI correctly identifies category sections (JACKETS, SNOWPANTS, FLEECE) but assigns incorrect links:

| Slice | Correct Link | What System Did | Why Wrong |
|-------|--------------|-----------------|-----------|
| JACKETS | `/collections/mens-winter-jackets` | `https://oneillcanada.com` (homepage) | Fell back to default |
| SNOWPANTS | `/collections/*snowpants*` | `/products/anvil-pants_4550...` | Web search returned random product |
| FLEECE | `/collections/mens-hoodies-fleece` | `/collections/mens-hoodies-...` | Matched "hoodies" not "fleece" |

The brand link index HAS the correct URLs:
- `Mens Winter Jackets` → `/collections/mens-winter-jackets`
- `Collection: Mens Snowpants` → `/collections/sale-all/collection:-mens-snowpants`
- `Mens Hoodies Fleece` → `/collections/mens-hoodies-fleece`

## Root Causes

### 1. Claude prompt doesn't emphasize category-to-collection matching
The current prompt tells Claude to match specific products to product URLs, but doesn't guide it to match category SECTIONS to collection URLs.

### 2. `resolve-slice-links` returns any product URL, not the correct collection
When Claude flags `needs_search`, the fallback:
- Runs web search for the slice description
- Returns the FIRST result that has `/products/` or is on-domain
- Doesn't prioritize `/collections/` for category sections
- Doesn't validate if the returned URL actually matches what was searched

### 3. No semantic matching for category keywords
"JACKETS" should fuzzy-match "Winter Jackets", "Ladies Jackets", etc. but the current list-based matching requires more exact title matches.

## The Fix

### Fix 1: Enhance Claude Prompt for Category Sections

In `auto-slice-v2/index.ts`, add explicit guidance for matching category sections to collections:

```
### CATEGORY SECTION LINK MATCHING

When a slice shows a CATEGORY HEADER (e.g., "JACKETS", "SNOWPANTS", "FLEECE", "NEW ARRIVALS"):

1. This is a COLLECTION slice, NOT a product slice
2. Search the available links for collection URLs containing that category keyword:
   - "JACKETS" → look for links with "jacket" in title or URL
   - "SNOWPANTS" → look for links with "snowpant" or "snow-pant"
   - "FLEECE" → look for links with "fleece"
   - "NEW ARRIVALS" → look for links with "new" or "arrivals"

3. Prefer collection URLs (/collections/) over product URLs (/products/)

4. If multiple collections match, prefer:
   - Gender-neutral or "all" collections
   - Collections without "sale" or "on-sale" prefix
   - Shorter URL paths

5. If NO collection matches the category keyword, use linkSource: 'needs_search'
   - Do NOT fall back to homepage
   - Do NOT use a random product URL
```

### Fix 2: Improve `resolve-slice-links` for Category Searches

Update the search logic to:

1. **Detect category-type queries** (short, 1-2 words like "JACKETS")
2. **Search for collection URLs specifically**: `"jackets collection site:domain.com"`
3. **Prioritize `/collections/` URLs over `/products/`**
4. **Validate the returned URL actually contains the category keyword**

```typescript
// In resolve-slice-links/index.ts

async function searchForProductUrl(domain: string, query: string, imageUrl?: string): Promise<string | null> {
  // ... existing code ...
  
  // Detect if this is a category search (short query, likely a section header)
  const isCategorySearch = cleanQuery.split(/\s+/).length <= 2 && 
                           cleanQuery.length < 20 &&
                           !cleanQuery.toLowerCase().includes('product');
  
  // For category searches, explicitly search for collections
  const searchQuery = isCategorySearch 
    ? `${cleanQuery} collection site:${domain}`
    : `${cleanQuery} site:${domain}`;
  
  console.log(`[resolve] Search type: ${isCategorySearch ? 'CATEGORY' : 'product'}, query: "${searchQuery}"`);
  
  // ... fetch results ...
  
  // For category searches, ONLY accept collection URLs
  if (isCategorySearch) {
    for (const result of results) {
      const url = result.url || '';
      // Must be a collection URL AND contain the category keyword
      if (url.includes('/collections/') && 
          url.toLowerCase().includes(cleanQuery.toLowerCase().split(/\s+/)[0])) {
        const cleaned = cleanUrl(url);
        console.log(`[resolve] Found matching collection: ${cleaned}`);
        return cleaned;
      }
    }
    // If no collection found, return null - don't fall back to random product
    console.log(`[resolve] No matching collection found for category "${cleanQuery}"`);
    return null;
  }
  
  // ... existing product URL logic ...
}
```

### Fix 3: Add Category Keyword Validation

Before accepting a resolved URL, validate it actually matches:

```typescript
function validateCategoryMatch(query: string, url: string): boolean {
  const keywords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const urlLower = url.toLowerCase();
  
  // At least one keyword should appear in the URL
  return keywords.some(keyword => urlLower.includes(keyword));
}
```

## Files to Modify

1. **`supabase/functions/auto-slice-v2/index.ts`**
   - Add "Category Section Link Matching" section to the prompt (~line 1560)
   - Explicitly instruct Claude to match category headers to collection URLs

2. **`supabase/functions/resolve-slice-links/index.ts`**
   - Detect category vs product searches
   - Use different search strategies for each
   - Validate returned URLs contain the searched keyword
   - Return null instead of random URL when no match found

## Expected Behavior After Fix

| Slice | AI Analysis | Link Resolution |
|-------|-------------|-----------------|
| JACKETS | `linkSource: 'index'` → `/collections/mens-winter-jackets` | Direct match from index |
| SNOWPANTS | `linkSource: 'needs_search'` → resolved | `/collections/*snowpants*` via category search |
| FLEECE | `linkSource: 'index'` → `/collections/mens-hoodies-fleece` | Direct match from index |

## Technical Details

The key insight is distinguishing between:
- **Product slices**: Specific product images with names → need exact product URLs
- **Category slices**: Section headers like "JACKETS" → need collection URLs

The current system treats both the same way, leading to:
1. Claude using homepage as fallback for categories (since no exact product match)
2. Web search returning random products instead of collections
3. URL validation not checking if the result actually matches the query

