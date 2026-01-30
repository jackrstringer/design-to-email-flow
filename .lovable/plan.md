
# Consolidate Auto-Slicing + Link Assignment into One Claude Call

## Problem Statement
The current pipeline makes two separate AI calls:
1. **auto-slice-v2** (~17s): Analyzes image, determines slice boundaries, identifies CTAs
2. **analyze-slices** (~17s): Re-analyzes the same slices for alt text and links

This is wasteful because both steps analyze the same visual content. We're paying for Claude to "look at" the email twice.

## Solution: Single Unified AI Call
Move link assignment INTO the auto-slice step. Claude already sees the full campaign image and identifies slice boundaries, CTAs, and content types. Adding link assignment at this stage is natural and eliminates the second AI round-trip.

---

## Architecture Changes

### 1. New Input Parameters for `auto-slice-v2`

```typescript
interface AutoSliceRequest {
  imageDataUrl: string;
  
  // NEW: Link Intelligence inputs
  brandId?: string;
  brandDomain?: string;
  linkIndex?: Array<{
    title: string;
    url: string;
    link_type: 'product' | 'collection' | 'page' | 'homepage';
  }>;
  defaultDestinationUrl?: string;  // For generic CTAs
  brandPreferenceRules?: Array<{
    name: string;
    destination_url: string;
  }>;
}
```

### 2. Enhanced Slice Output

```typescript
interface SliceOutput {
  yTop: number;
  yBottom: number;
  name: string;
  hasCTA: boolean;
  ctaText: string | null;
  horizontalSplit?: { columns: 2|3|4|5|6; gutterPositions: number[] };
  
  // NEW: Link Intelligence outputs
  isClickable: boolean;
  link: string | null;
  altText: string;
  linkSource: 'index' | 'default' | 'rule' | 'needs_search' | 'not_clickable';
}
```

### 3. New Top-Level Output Field

```typescript
interface AutoSliceV2Response {
  // ... existing fields ...
  
  // NEW: For reactive web search (rare)
  needsLinkSearch: Array<{
    sliceIndex: number;
    description: string;  // What product/collection couldn't be matched
  }>;
}
```

---

## Updated Claude Prompt (Addition)

After the existing slicing instructions, add a new section:

```
## LINK ASSIGNMENT

You are also responsible for assigning links to each slice.

### Available Brand Links
${linkIndex.map((l, i) => `${i + 1}. [${l.link_type}] "${l.title}" → ${l.url}`).join('\n')}

### Default Destination (for generic CTAs)
${defaultDestinationUrl}

### Brand-Specific Rules (check first)
${brandPreferenceRules.map(r => `- "${r.name}" → ${r.destination_url}`).join('\n')}

### Link Assignment Rules

1. **isClickable**: Same as hasCTA logic, plus:
   - Header logos → clickable (homepage)
   - Product images → clickable (product page)
   - Hero sections with buttons → clickable
   - Dividers, spacers, decorative elements → NOT clickable

2. **link** assignment priority:
   a. Check brand rules first - if slice matches a rule name, use that URL
   b. Check link index - find the best matching product/collection
   c. For generic CTAs (Shop Now, Learn More, etc.) → use defaultDestinationUrl
   d. If clickable but no match found → set linkSource: 'needs_search'

3. **altText**: Write concise, descriptive alt text (max 200 chars) capturing the marketing message. Include any visible product names or promotional text.

4. **linkSource**:
   - 'rule' → matched a brand-specific rule
   - 'index' → matched from the link index
   - 'default' → used the default destination URL
   - 'needs_search' → clickable but no match found (web search needed)
   - 'not_clickable' → slice is not clickable

### Output Format Update

Each section now includes:
{
  "name": "hero_section",
  "yTop": 0,
  "yBottom": 580,
  "hasCTA": true,
  "ctaText": "SHOP NOW",
  "horizontalSplit": null,
  "isClickable": true,
  "link": "https://brand.com/collections/summer",
  "altText": "Summer collection hero - Up to 30% off all beach essentials. Shop Now.",
  "linkSource": "index"
}

Also add at top level:
{
  "needsLinkSearch": [
    { "sliceIndex": 3, "description": "New XYZ Product - not found in link index" }
  ]
}
```

---

## Changes to `process-campaign-queue`

### Before calling auto-slice, fetch brand data:

```typescript
// Fetch link intelligence data before auto-slice
let linkIndex: Array<{title: string; url: string; link_type: string}> = [];
let defaultDestinationUrl: string | null = null;
let brandPreferenceRules: Array<{name: string; destination_url: string}> = [];

if (brandId) {
  // Fetch healthy links from brand_link_index
  const { data: links } = await supabase
    .from('brand_link_index')
    .select('title, url, link_type')
    .eq('brand_id', brandId)
    .eq('is_healthy', true)
    .order('use_count', { ascending: false })
    .limit(100);  // Cap at 100 links to keep prompt reasonable
  
  linkIndex = links || [];
  
  // Fetch brand preferences
  const { data: brand } = await supabase
    .from('brands')
    .select('link_preferences, domain')
    .eq('id', brandId)
    .single();
  
  const prefs = brand?.link_preferences || {};
  defaultDestinationUrl = prefs.default_destination_url || `https://${brand?.domain}`;
  brandPreferenceRules = prefs.rules || [];
}
```

### Pass to auto-slice:

```typescript
const sliceResult = await autoSliceImage(
  imageResult.imageBase64,
  item.image_width || 600,
  item.image_height || 2000,
  // NEW: Link intelligence parameters
  brandId,
  brandContext?.domain || null,
  linkIndex,
  defaultDestinationUrl,
  brandPreferenceRules
);
```

### After auto-slice, handle web search fallbacks (rare):

```typescript
// Handle slices that need web search (only for products not in index)
if (sliceResult.needsLinkSearch && sliceResult.needsLinkSearch.length > 0) {
  console.log(`[process] ${sliceResult.needsLinkSearch.length} slices need web search`);
  
  for (const missing of sliceResult.needsLinkSearch) {
    // Only trigger web search for high-churn brands
    if (linkPreferences?.product_churn === 'high') {
      const searchResult = await webSearchForLink(missing.description, brandContext?.domain);
      if (searchResult.url) {
        sliceResult.slices[missing.sliceIndex].link = searchResult.url;
        sliceResult.slices[missing.sliceIndex].linkSource = 'web_search';
        
        // Reactive indexing - save for future campaigns
        await supabase.from('brand_link_index').upsert({
          brand_id: brandId,
          url: searchResult.url,
          title: missing.description,
          link_type: 'product',
          source: 'ai_discovered',
          is_healthy: true
        });
      }
    }
  }
}
```

### Skip analyze-slices for brands with link indexes:

```typescript
// Slices already have links from auto-slice - skip analyze-slices for indexed brands
if (linkIndex.length > 0) {
  console.log('[process] Using links from auto-slice (indexed brand)');
  currentSlices = uploadedSlices; // Already have altText and links
} else {
  // Legacy fallback for brands without link indexes
  console.log('[process] Falling back to analyze-slices (no link index)');
  const enrichedSlices = await analyzeSlices(
    supabase,
    uploadedSlices,
    imageResult.imageUrl,
    brandContext?.domain || null,
    item.brand_id || null
  );
  currentSlices = enrichedSlices || uploadedSlices;
}
```

---

## Model Selection Strategy

```typescript
// For eskiin-like brands (indexed, low churn): Use Haiku for speed
// For high-churn brands: Use Sonnet with web search capability

const hasCompleteIndex = linkIndex.length > 0 && 
  linkPreferences?.product_churn !== 'high';

const model = hasCompleteIndex 
  ? 'claude-3-5-haiku-20241022'  // Fast, no web tools needed
  : 'claude-sonnet-4-5';          // Full capability with web search
```

---

## Performance Impact

### Expected Timing for eskiin (26 indexed links):

| Step | Before | After |
|------|--------|-------|
| auto-slice | 17s | 15-18s (slightly more work) |
| analyze-slices | 17s | 0s (skipped) |
| match-slice-to-link | 4s | 0s (eliminated) |
| **Total** | **38s** | **15-18s** |

**Net savings: ~50% faster pipeline**

### Why It Works:
1. Claude already analyzes the full image for slicing
2. Adding link assignment is marginal extra work (list matching)
3. Eliminates entire analyze-slices Claude call
4. Eliminates all match-slice-to-link calls
5. No extra API latency for link matching

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/auto-slice-v2/index.ts` | Add link intelligence to prompt, update input/output types, add needsLinkSearch |
| `supabase/functions/process-campaign-queue/index.ts` | Fetch link index before auto-slice, pass to function, handle needsLinkSearch, skip analyze-slices for indexed brands |
| `src/types/slice.ts` | Update `AutoSliceV2Response` interface with new fields |

### Files to Keep (Legacy Fallback)
- `supabase/functions/analyze-slices/index.ts` - Keep for brands without link indexes
- `supabase/functions/match-slice-to-link/index.ts` - Keep for reactive indexing/web search

---

## Migration Strategy

1. **Phase 1**: Update auto-slice-v2 to accept and use link index (if provided)
2. **Phase 2**: Update process-campaign-queue to fetch and pass link data
3. **Phase 3**: Add conditional skip of analyze-slices for indexed brands
4. **Phase 4**: Monitor and verify performance gains

No breaking changes - unindexed brands continue using legacy path.

---

## Summary

Consolidating link assignment into auto-slice eliminates redundant AI processing. For brands with indexed links (like eskiin), this should cut total processing time from ~48s to ~20s - a 60% improvement achieved by removing the second Claude round-trip entirely.
