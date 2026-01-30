

# Wire Up Link Intelligence to Slice Analysis Pipeline

## Overview
Replace the expensive web search for every slice with instant matching against the pre-indexed brand links. This will significantly reduce processing time (from 20+ seconds to 3-8 seconds for indexed brands).

---

## Current Flow

```text
analyze-slices → Claude with web_search tool → finds URLs (20+ seconds)
```

## New Flow

```text
1. Campaign context analysis (quick Claude call)
2. Slice descriptions (simplified Claude call - no web search)
3. Match descriptions against brand_link_index (instant vector/list lookup)
4. Apply brand preferences for generic CTAs
5. Only web search fallback if no match + high product churn
6. Save any discovered URLs to index (reactive learning)
```

---

## Files to Create/Update

| File | Action | Description |
|------|--------|-------------|
| `supabase/functions/match-slice-to-link/index.ts` | CREATE | New edge function - core matching logic |
| `supabase/functions/analyze-slices/index.ts` | UPDATE | Add campaign context, use index-first matching |
| `supabase/migrations/*.sql` | CREATE | Add `match_brand_links` Postgres function for vector search |
| `supabase/config.toml` | UPDATE | Add new edge function config |

---

## Part 1: Database Function for Vector Search

Create a new migration to add the `match_brand_links` function:

```sql
CREATE OR REPLACE FUNCTION public.match_brand_links(
  query_embedding extensions.vector(1536),
  match_brand_id UUID,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  url TEXT,
  title TEXT,
  link_type TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    brand_link_index.id,
    brand_link_index.url,
    brand_link_index.title,
    brand_link_index.link_type,
    1 - (brand_link_index.embedding <=> query_embedding) AS similarity
  FROM brand_link_index
  WHERE brand_link_index.brand_id = match_brand_id
    AND brand_link_index.is_healthy = true
    AND brand_link_index.embedding IS NOT NULL
  ORDER BY brand_link_index.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
```

---

## Part 2: New Edge Function - `match-slice-to-link`

This function handles the core matching logic with size-based routing:

**Input:**
```typescript
interface MatchSliceInput {
  brand_id: string;
  slice_description: string;
  campaign_context: {
    campaign_type: string;
    primary_focus: string;
    detected_products: string[];
    detected_collections: string[];
  };
  is_generic_cta: boolean;
}
```

**Logic Flow:**
1. **Generic CTAs first** - Check brand preferences rules, then default destination
2. **Small catalog (<50 links)** - Pass full list to Claude Haiku for matching
3. **Large catalog (50+ links)** - Vector search + Claude confirmation

**Output:**
```typescript
interface MatchResult {
  url: string | null;
  source: 'brand_rule' | 'brand_default' | 'index_list_match' | 'vector_high_confidence' | 'vector_claude_confirmed' | 'no_match' | 'no_index';
  confidence: number;
  link_id?: string; // For usage tracking
}
```

---

## Part 3: Update `analyze-slices`

### New Two-Phase Approach

**Phase 1: Campaign Context (Single Claude Call)**
```typescript
// Add to beginning of function
const campaignContextPrompt = `
Analyze this email campaign image:

1. Campaign type: product_launch | collection_highlight | sale_promo | brand_general
2. Primary focus (e.g., "Summer Collection", "New Protein Formula")
3. Detected products/collections

Respond in JSON:
{
  "campaign_type": "...",
  "primary_focus": "...",
  "detected_products": [...],
  "detected_collections": [...]
}
`;
```

**Phase 2: Simplified Slice Descriptions (No Web Search)**

Remove web_search and web_fetch tools from the Claude call. Instead, ask Claude only to:
- Generate alt text for each slice
- Determine if slice is clickable
- Identify if slice is a generic CTA ("Shop Now", "Learn More", etc.)
- Describe what the slice shows (for matching)

```typescript
const sliceDescriptionPrompt = `
For each slice, provide:
- altText: Max 200 chars, capture marketing message
- isClickable: true/false
- isGenericCta: true if "Shop Now", "Learn More", etc. without specific product
- description: Brief description for product matching

DO NOT search for links - just describe what you see.
`;
```

**Phase 3: Link Matching (Call `match-slice-to-link`)**

After getting descriptions, call the new matching function for each clickable slice:

```typescript
const results = await Promise.all(
  sliceDescriptions.map(async (slice) => {
    if (!slice.isClickable) {
      return { ...slice, suggestedLink: null, linkSource: 'not_clickable' };
    }
    
    const match = await matchSliceToLink({
      brand_id: brandId,
      slice_description: slice.description,
      campaign_context: campaignContext,
      is_generic_cta: slice.isGenericCta
    });
    
    return {
      ...slice,
      suggestedLink: match.url,
      linkSource: match.source,
      linkVerified: match.confidence > 0.8
    };
  })
);
```

---

## Part 4: Web Search Fallback (Only for High Churn Brands)

If no match is found and brand has `product_churn: 'high'` in link_preferences:

```typescript
if (!match.url && brand.link_preferences?.product_churn === 'high') {
  // Fall back to web search (existing logic)
  const webResult = await webSearchForLink(slice.description, brand.domain);
  
  if (webResult.url) {
    // Reactive indexing - save for next time
    await addToLinkIndex({
      brand_id: brandId,
      url: webResult.url,
      title: slice.description,
      link_type: 'product',
      source: 'ai_discovered'
    });
  }
}
```

---

## Part 5: Usage Tracking

When a link from the index is used, update its stats:

```typescript
// In match-slice-to-link, after finding a match:
if (match.link_id) {
  await supabase
    .from('brand_link_index')
    .update({
      last_used_at: new Date().toISOString(),
      use_count: supabase.sql`use_count + 1`
    })
    .eq('id', match.link_id);
}
```

---

## Performance Expectations

| Scenario | Before | After |
|----------|--------|-------|
| Small brand (indexed) | 20s | 3-5s |
| Large brand (indexed) | 20s | 5-8s |
| New brand (no index) | 20s | 20s (first time) |
| High churn brand | 20s | 10-15s (some web searches) |

---

## Technical Details

### Small Catalog Matching (< 50 links)

```typescript
async function matchViaClaudeList(sliceDescription: string, links: LinkIndexEntry[]) {
  const linkList = links.map((l, i) => `${i + 1}. ${l.title} → ${l.url}`).join('\n');
  
  const prompt = `
A slice shows: "${sliceDescription}"

Known product/collection links:
${linkList}

Which link best matches? Respond with just the number, or "none".
`;

  // Use Claude Haiku for speed
  const response = await callClaude(prompt, { model: 'claude-haiku-4-5-20250929' });
  // ... parse response
}
```

### Large Catalog Matching (50+ links)

```typescript
async function matchViaVectorSearch(brandId: string, sliceDescription: string) {
  // 1. Generate embedding for slice description
  const { embeddings } = await generateEmbedding({ texts: [sliceDescription] });
  
  // 2. Vector search for top 5 candidates
  const { data: candidates } = await supabase.rpc('match_brand_links', {
    query_embedding: embeddings[0],
    match_brand_id: brandId,
    match_count: 5
  });
  
  // 3. High confidence (>90%) - use directly
  if (candidates[0]?.similarity > 0.90) {
    return { url: candidates[0].url, source: 'vector_high_confidence', confidence: candidates[0].similarity };
  }
  
  // 4. Medium confidence (75-90%) - Claude picks from candidates
  if (candidates[0]?.similarity > 0.75) {
    return await claudePickFromCandidates(sliceDescription, candidates);
  }
  
  // 5. Low confidence - no match
  return { url: null, source: 'low_confidence', confidence: 0 };
}
```

---

## Changes Summary

1. **Create migration** - `match_brand_links` Postgres function
2. **Create `match-slice-to-link`** - New edge function for smart matching
3. **Update `analyze-slices`** - Two-phase approach (context + descriptions, then matching)
4. **Update `supabase/config.toml`** - Register new function
5. **Add reactive indexing** - Save newly discovered URLs from web search fallback

