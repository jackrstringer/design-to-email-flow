
# Parallelize Link Matching Calls

## Problem
The `matchSlicesViaIndex` function processes slices sequentially, waiting for each `match-slice-to-link` call to complete before starting the next. With 4 clickable slices at ~4.5 seconds each, this adds 18 seconds to the pipeline.

## Current Code (Sequential)

```typescript
// Lines 544-610 in analyze-slices/index.ts
const analyses: SliceAnalysis[] = [];

for (const slice of sliceDescriptions) {
  if (!slice.isClickable) {
    analyses.push({ ...not_clickable_result });
    continue;
  }

  // Each call waits for the previous one to complete
  const matchResponse = await fetch(`${supabaseUrl}/functions/v1/match-slice-to-link`, {...});
  // ... process response
  analyses.push(result);
}
```

## Solution (Parallel)

Replace the sequential loop with `Promise.all()` to run all matching calls simultaneously:

```typescript
const matchPromises = sliceDescriptions.map(async (slice): Promise<SliceAnalysis> => {
  if (!slice.isClickable) {
    return {
      index: slice.index,
      altText: slice.altText,
      suggestedLink: null,
      isClickable: false,
      linkVerified: false,
      linkSource: 'not_clickable'
    };
  }

  try {
    const matchResponse = await fetch(`${supabaseUrl}/functions/v1/match-slice-to-link`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        brand_id: brandId,
        slice_description: slice.description,
        campaign_context: campaignContext || getDefaultCampaignContext(),
        is_generic_cta: slice.isGenericCta
      }),
    });

    if (matchResponse.ok) {
      const matchResult: MatchResult = await matchResponse.json();
      console.log(`Slice ${slice.index}: ${matchResult.source} (${matchResult.url || 'no match'})`);
      return {
        index: slice.index,
        altText: slice.altText,
        suggestedLink: matchResult.url,
        isClickable: true,
        linkVerified: matchResult.confidence > 0.8,
        linkSource: matchResult.source
      };
    } else {
      console.error(`match-slice-to-link error for slice ${slice.index}:`, await matchResponse.text());
      return {
        index: slice.index,
        altText: slice.altText,
        suggestedLink: null,
        isClickable: true,
        linkVerified: false,
        linkSource: 'error'
      };
    }
  } catch (error) {
    console.error(`Error matching slice ${slice.index}:`, error);
    return {
      index: slice.index,
      altText: slice.altText,
      suggestedLink: null,
      isClickable: true,
      linkVerified: false,
      linkSource: 'error'
    };
  }
});

const analyses = await Promise.all(matchPromises);
```

---

## File to Update

| File | Changes |
|------|---------|
| `supabase/functions/analyze-slices/index.ts` | Replace sequential for-loop (lines 544-610) with parallel Promise.all pattern |

---

## Expected Performance Improvement

| Metric | Before | After |
|--------|--------|-------|
| 4 clickable slices | 18s (sequential) | ~4.5s (parallel) |
| Total campaign time | 48s | ~34s |
| Speedup | - | ~30% faster |

---

## Technical Notes

- All 4 matching calls will execute concurrently
- Each call still takes ~4.5s, but they overlap instead of running back-to-back
- Error handling is preserved - individual failures won't break the batch
- Results maintain correct order via `.map()` index preservation
- The high-churn fallback logic after matching remains unchanged
