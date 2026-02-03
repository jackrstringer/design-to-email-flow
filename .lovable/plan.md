
# Fix Campaign Queue Processing Slowdown

## Problem Identified

The campaign queue is taking **54+ seconds** when it should take ~25 seconds. The bottleneck is the **ClickUp search running synchronously** before auto-slicing begins.

### Current Flow (Slow)
```text
figma-ingest (2.4s)
    ↓
fetch image (8s) 
    ↓
fire early copy (async) ✓
fire spelling check (async) ✓
    ↓
await ClickUp search (blocking) ← BOTTLENECK
    ↓
auto-slice (18s)
    ↓
poll for results (12s)
```

Total: **54+ seconds**

### Timeline Evidence
- figma-ingest completes at 22:28:12
- ClickUp/auto-slice starts at 22:28:34  
- **22 second unexplained gap!**

The ClickUp search itself only takes 1.6s, but something is causing a massive delay before it even starts. Looking at the code, the issue is that the ClickUp search is awaited synchronously, blocking the pipeline.

## Solution

Make the ClickUp search **fire-and-forget async** like early copy generation, then merge results at the end:

1. Fire ClickUp search as non-blocking (like early copy)
2. Continue immediately to auto-slice
3. Collect ClickUp results at the end when merging all copy sources

### Fixed Flow (Fast)
```text
figma-ingest (2.4s)
    ↓
fetch image (8s)
    ↓
fire early copy (async) ✓
fire spelling check (async) ✓
fire ClickUp search (async) ← NEW: Non-blocking
    ↓
auto-slice (18s) ← Starts immediately
    ↓
poll/merge results (3s)
```

Total: **~30 seconds**

## Implementation

### Changes to `supabase/functions/process-campaign-queue/index.ts`

**1. Add a new table or use existing early_generated_copy to store ClickUp results**

Actually, simpler: store ClickUp result in a variable that will be populated by a callback, and check it at the end.

**2. Change ClickUp search from blocking to async (lines 739-776)**

Before:
```typescript
if (clickupApiKey && clickupListId && item.source_url) {
  const clickupResponse = await fetch(clickupUrl, { ... });  // BLOCKING
  if (clickupResponse.ok) {
    const result = await clickupResponse.json();
    // ... process result
  }
}
```

After:
```typescript
// Store promise for later resolution
let clickupPromise: Promise<{...}> | null = null;

if (clickupApiKey && clickupListId && item.source_url) {
  console.log('[process] Step 1.5b: Firing async ClickUp search...');
  clickupPromise = (async () => {
    try {
      const response = await fetch(clickupUrl, { ... });
      if (response.ok) {
        return await response.json();
      }
    } catch (err) {
      console.error('[process] ClickUp search error:', err);
    }
    return null;
  })();  // Fire immediately, don't await
}

// Continue to auto-slice without waiting...
```

**3. Await the ClickUp promise at the end (around line 1063)**

```typescript
// Wait for ClickUp result before finalizing
if (clickupPromise) {
  console.log('[process] Awaiting ClickUp search result...');
  const clickupResult = await clickupPromise;
  if (clickupResult?.found) {
    clickupCopy = {
      subjectLine: clickupResult.subjectLine || null,
      previewText: clickupResult.previewText || null,
      taskId: clickupResult.taskId || null,
      taskUrl: clickupResult.taskUrl || null
    };
  }
}
```

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/process-campaign-queue/index.ts` | Make ClickUp search non-blocking, await at end |

## Expected Performance Improvement

| Metric | Before | After |
|--------|--------|-------|
| Total processing time | 54s | ~28-32s |
| Time to auto-slice start | 25s | 8s |
| Bottleneck removed | ClickUp blocking | N/A |

## Technical Notes

- The ClickUp search only takes 1.6s, but blocking means auto-slice can't start until it completes
- Early copy generation is already 28s - by making ClickUp async, auto-slice runs in parallel with it
- The final merge step already handles priority: ClickUp > Figma provided > AI generated
