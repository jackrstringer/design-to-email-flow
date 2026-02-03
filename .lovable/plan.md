
# Fix Campaign Queue Processing Time (42s → ~25s)

## Problem Identified

The campaign queue is taking **42+ seconds** when it was ~20 seconds on Jan 30th. The bottleneck is an **inefficient base64 conversion loop** in `process-campaign-queue`.

### Current Timeline
```text
0-12s    Fetch image + convert to base64 (SLOW - O(n²) loop!)
12-13s   Fire early copy, ClickUp, spelling check
13-32s   Auto-slice (19s - normal)
32-42s   Poll for early copy (9s - waiting because copy started late)
```

### Root Cause

The `fetchAndUploadImage` function uses an O(n²) string concatenation pattern:

```typescript
// SLOW: O(n²) due to string += in loop
let binary = '';
for (let i = 0; i < uint8Array.length; i++) {
  binary += String.fromCharCode(uint8Array[i]);  // Creates new string each iteration!
}
const base64 = btoa(binary);
```

For a 1MB+ image (1200x6116 at ~860KB), this loop runs ~860,000 times, creating a new string object each iteration. String concatenation in JavaScript is O(n), making this O(n²) overall.

### Why Jan 30th Was Faster

Other edge functions have been updated to use chunked conversion, but `process-campaign-queue` was missed. The optimized pattern (used in `generate-email-copy-early`, `auto-slice-v2`):

```typescript
// FAST: O(n) chunked approach
const CHUNK_SIZE = 32768;
let base64Data = '';
for (let i = 0; i < uint8Array.length; i += CHUNK_SIZE) {
  const chunk = uint8Array.subarray(i, Math.min(i + CHUNK_SIZE, uint8Array.length));
  base64Data += String.fromCharCode(...chunk);
}
const base64 = btoa(base64Data);
```

## Solution

### Change 1: Fix base64 conversion in `fetchAndUploadImage`

Replace the slow loop with chunked conversion:

```typescript
// Replace lines 64-69 in fetchAndUploadImage
const CHUNK_SIZE = 32768;
let binary = '';
for (let i = 0; i < uint8Array.length; i += CHUNK_SIZE) {
  const chunk = uint8Array.subarray(i, Math.min(i + CHUNK_SIZE, uint8Array.length));
  binary += String.fromCharCode(...chunk);
}
const base64 = btoa(binary);
```

## Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/process-campaign-queue/index.ts` | Fix base64 conversion from O(n²) to O(n) |

## Expected Performance Improvement

| Metric | Before | After |
|--------|--------|-------|
| Image fetch + base64 | 12s | <1s |
| Early copy fires at | 12s | <1s |
| Total processing time | 42s | ~25s |

The 12-second delay was cascading through the entire pipeline. Early copy generation was firing 12 seconds late, meaning the 8.6 second polling was mostly waiting for a task that started late. With this fix:

1. Early copy fires immediately after image fetch (~1s)
2. Auto-slice starts at ~1s instead of ~13s
3. Both run in parallel for ~19 seconds
4. Copy is ready when auto-slice completes (no polling delay)

## Technical Details

The chunked approach is faster because:
- Spread operator `...chunk` converts the entire chunk at once
- Only ~26 string concatenations for 860KB image vs 860,000
- Each chunk creates one intermediate string, not 860,000
