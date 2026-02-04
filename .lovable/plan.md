

# Emergency Fix: Broken Pipeline + Simplified Link Strategy

## What Broke

The edge functions were **not deployed** after code changes. The pipeline was stuck at `analyzing_image` (15%) because `auto-slice-v2` was running old code or failing silently.

**Status**: Functions are now deployed. The current campaign should start progressing.

## Your Two Key Points (Will Implement Now)

### 1. Inject Maximum Links (Not Artificial Caps)

Current: Fetching 100 products + 50 collections = 150 total
Claude's context: ~200k tokens = easily handles 1000+ links

**Change**: Remove artificial limits. Fetch ALL healthy links for the brand (up to 1000). Claude can handle it.

```
// BEFORE (arbitrary limits)
.limit(100)  // products
.limit(50)   // collections

// AFTER (maximize context)
.limit(500)  // products - most we'd realistically have
.limit(500)  // collections/nav - get everything
```

### 2. Simplify Fallback: No Match = Web Search (Immediately)

Current flow is overcomplicated:
1. Check brand cache
2. Try Shopify predictive search  
3. Try Firecrawl Map
4. Only then give up

**Simplified flow**:
1. Auto-slice assigns link from index (if perfect match exists)
2. If `linkSource: 'needs_search'` or validation flags it as imperfect
3. **Immediately use web search** via Firecrawl Search endpoint
4. Done

No intermediate caching layers, no Shopify-specific code paths. Just:
- Perfect match in index? Use it.
- No perfect match? Web search.

### 3. Remove Deterministic Validator Complexity

The validator I added checks for:
- Product content matched to collection URL
- Year mismatches (2025 vs 2024)
- Multi-column shared collection links

This adds complexity. Instead:
- Trust the improved prompts in `auto-slice-v2` and `match-slice-to-link`
- If Claude says `needs_search`, use web search
- Don't second-guess Claude's assignments with regex heuristics

## Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/process-campaign-queue/index.ts` | Remove 100/50 limits, simplify link resolution flow |
| `supabase/functions/resolve-slice-links/index.ts` | Simplify to just Firecrawl Search (remove Shopify path) |

## Immediate Actions

1. The campaign should now progress (functions deployed)
2. Simplify the link fetching to get ALL links
3. Simplify resolver to just use web search when needed

