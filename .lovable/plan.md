

# Fix Link Intelligence Pipeline - Critical Bug Fixes

## Problem Summary

The most recent campaign took **75 seconds** and produced **0 links** for any slice. Investigation reveals two critical bugs:

### Bug 1: `brandId` Not Passed to analyze-slices

**Location:** `supabase/functions/process-campaign-queue/index.ts` line 365-370

```typescript
// Current (BROKEN):
body: JSON.stringify({
  slices: sliceInputs,
  brandDomain,
  fullCampaignImage: resizedFullImageUrl,
  knownProductUrls
  // ❌ brandId is missing!
})
```

**Effect:** 
- analyze-slices receives `brandId: 'none'`
- Cannot look up brand's link index
- Falls back to legacy web-search mode
- Legacy mode is also broken (returns no links)

### Bug 2: Invalid Claude Model Name

The model `claude-haiku-4-5-20250929` does not exist. Logs show:
```
Anthropic API error: model: claude-haiku-4-5-20250929 - not_found_error
```

This affects:
- `qa-spelling-check-early` 
- `analyze-slices` (context analysis)
- `match-slice-to-link` (list matching)

### Bug 3: Legacy Web Search Fallback is Broken

When `brandId` is missing, the code falls to `matchSlicesViaWebSearch()` which:
1. Doesn't include web_search tools in the Claude call (those were stripped for index mode)
2. Returns `suggestedLink: null` for all slices
3. The prompt only asks for descriptions, not links

---

## Timeline Analysis (Most Recent Campaign)

| Time | Step | Duration | Issue |
|------|------|----------|-------|
| 05:16:18 | Start processing | - | - |
| 05:16:35 | Auto-slice | 17s | OK |
| 05:17:00 | Analyze slices started | - | brandId missing! |
| 05:17:01 | Phase 2 (slice descriptions) | - | Used Sonnet (slow) because useIndexMatching=false |
| 05:17:31 | Phase 3 (matching) | 30s | No index, legacy path broken |
| 05:17:33 | Complete | 75s total | 0 links produced |

**Why it was slow:** 
- Without brandId, `useIndexMatching = false`
- Used `claude-sonnet-4-5` with web search tools (30s)
- But web search didn't produce links because the prompt/response handling is broken for that path

---

## Fixes Required

### Fix 1: Pass brandId to analyze-slices

**File:** `supabase/functions/process-campaign-queue/index.ts`

```typescript
body: JSON.stringify({
  slices: sliceInputs,
  brandDomain,
  brandId,  // ← ADD THIS
  fullCampaignImage: resizedFullImageUrl,
  knownProductUrls
})
```

### Fix 2: Update Model Names

Replace `claude-haiku-4-5-20250929` with the correct model name `claude-3-5-haiku-20241022` in:
- `supabase/functions/analyze-slices/index.ts` (3 occurrences)
- `supabase/functions/match-slice-to-link/index.ts` (2 occurrences)  
- `supabase/functions/qa-spelling-check-early/index.ts` (1 occurrence)

### Fix 3: Fix Legacy Web Search Fallback

**File:** `supabase/functions/analyze-slices/index.ts`

The `matchSlicesViaWebSearch` function needs to properly extract `suggestedLink` from the Claude response. Currently it ignores the web search results.

```typescript
// In matchSlicesViaWebSearch, parse the full response which includes suggestedLink
const analyses: SliceAnalysis[] = slices.map((_, i) => {
  const desc = sliceDescriptions.find(d => d.index === i);
  return {
    index: i,
    altText: desc?.altText || '',
    suggestedLink: (desc as any)?.suggestedLink || null,  // ← Extract from response
    isClickable: desc?.isClickable ?? false,
    linkVerified: (desc as any)?.linkVerified ?? false,
    linkSource: 'web_search'
  };
});
```

---

## Expected Results After Fix

| Scenario | Before | After |
|----------|--------|-------|
| Brand with indexed links (26 links) | 75s, 0 links | 5-10s, links matched |
| Brand without index | 75s, 0 links | 20-30s, links via web search |
| Model errors | Fails silently | Works correctly |

---

## Files to Update

| File | Changes |
|------|---------|
| `supabase/functions/process-campaign-queue/index.ts` | Add `brandId` to analyze-slices call |
| `supabase/functions/analyze-slices/index.ts` | Fix model name (3 places), fix legacy fallback |
| `supabase/functions/match-slice-to-link/index.ts` | Fix model name (2 places) |
| `supabase/functions/qa-spelling-check-early/index.ts` | Fix model name (1 place) |

---

## Testing Plan

After fixes are deployed:
1. Reprocess the same campaign (eskiin brand)
2. Expected: 
   - Processing time ~5-10 seconds for analysis step
   - Slices should have links matched from the 26 indexed URLs
   - Alt text should be populated correctly

