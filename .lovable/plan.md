

# Fix: MIME Type Bug Causing 30s Stall at 65%

## Root Cause

The `generate-email-copy-early` function always fails because the orchestrator passes `imageBase64` but not the `mimeType`. The early copy function defaults to `image/png`, but ImageKit converts images to JPEG during resize. Anthropic rejects the mismatch with a 400 error, and no result is ever saved. The orchestrator then wastes 30 seconds polling for results that will never appear, before falling back to synchronous generation.

This is a one-line omission in the orchestrator and a one-line fix in the early copy function.

## Expected Impact

- Current pipeline: ~72 seconds (30s wasted polling)
- After fix: ~35-40 seconds (early copy finishes during auto-slice, polling finds it immediately)
- The 65% stall disappears entirely

## ClickUp Search

Already confirmed: `include_closed=false` is set. Only open tasks are searched. No change needed here.

## Changes

### File 1: `supabase/functions/process-campaign-queue/index.ts`

**What**: Pass `mimeType` to `startEarlyGeneration` so it reaches the early copy function.

- Update `startEarlyGeneration` function signature to accept `mimeType: string` parameter
- Pass `mimeType` in the request body to `generate-email-copy-early`
- Update the call site (around line 812) to pass `imageResult.mimeType`

### File 2: `supabase/functions/generate-email-copy-early/index.ts`

**What**: Accept `mimeType` from the request body and use it instead of hardcoding `image/png`.

- Line 75: Add `mimeType` to destructured request body
- Line 383: Change `let contentType = 'image/png'` to `let contentType = mimeType || 'image/png'` so when base64 is provided directly, the correct MIME type is used

### File 3: `supabase/functions/process-campaign-queue/index.ts` (polling timeout)

**What**: Reduce the polling timeout from 30s to 15s as a safety net. If early copy is working, it completes in ~10s. If it fails, we don't want to waste more than 15s before falling back.

- Line 1258: Change `const maxWaitMs = 30000` to `const maxWaitMs = 15000`

## Summary of Edits

| File | Line(s) | Change |
|------|---------|--------|
| `process-campaign-queue/index.ts` | ~143 | Add `mimeType: string` to `startEarlyGeneration` params |
| `process-campaign-queue/index.ts` | ~161 | Add `mimeType: mimeType` to request body |
| `process-campaign-queue/index.ts` | ~812-815 | Pass `imageResult.mimeType` to the function call |
| `generate-email-copy-early/index.ts` | 75 | Add `mimeType` to destructured params |
| `generate-email-copy-early/index.ts` | 383 | Use `mimeType` parameter instead of hardcoded `'image/png'` |
| `process-campaign-queue/index.ts` | 1258 | Reduce polling timeout from 30s to 15s |

3 files touched, ~6 lines changed. No new dependencies, no schema changes.
