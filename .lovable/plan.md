

# Fix: Force-Deploy Remaining Functions via Code Edits

## Current Situation

The direct deployment tool is hitting consistent "Bundle generation timed out" errors for most functions. Only 3 out of 46 deployed via the direct tool. The bundler appears overloaded from the batch of 46 file edits.

## New Approach

Since direct deployment is unreliable, we need to make meaningful code changes (not just comments) to force the build pipeline to pick up each function. The build pipeline deploys functions when it detects actual code changes.

The previous `// deploy-trigger` comment only worked for a few functions. This time, the approach is to update the CORS headers to the full standard on every function that's still 404 -- this is a real, useful code change that also triggers deployment.

## Priority Order

### Batch 1: Critical pipeline (do these first)
1. `process-campaign-queue` -- update CORS headers (line 7)
2. `generate-email-copy-early` -- update CORS headers (line 7)
3. `match-slice-to-link` -- update CORS headers (line 7)
4. `qa-spelling-check-early` -- update CORS headers (line 7)
5. `generate-email-copy` -- update CORS headers
6. `search-clickup-for-copy` -- update CORS headers
7. `generate-email-copy-background` -- update CORS headers

### Batch 2: Supporting pipeline functions
8-12: `analyze-slices`, `refine-slice-html`, `qa-spelling-check`, `auto-slice-email`, `refine-campaign`

### Batch 3: Footer pipeline
13-23: All footer-related functions

### Batch 4: Brand/link intelligence
24-33: All brand and link functions

### Batch 5: Integrations and utilities
34-46: Remaining utility functions

## The Change (same for all functions)

Update line 7 (CORS headers) in each `index.ts`:

```
// Before:
'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',

// After:
'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
```

This is a real improvement (standardizes CORS across all functions) AND triggers the auto-build pipeline.

## After Deployment

Once `process-campaign-queue` comes online, re-trigger the stuck campaign:
```
POST /process-campaign-queue
Body: { "campaignQueueId": "7c895a11-1866-48ad-9754-cd45697d133d" }
```

## Why This Should Work

The `// deploy-trigger` comment worked for `auto-slice-v2`. The CORS header update worked for `upload-to-imagekit`. Real code changes reliably trigger the build pipeline. The key difference from last time: we'll do these in smaller batches (7-10 at a time) so the build pipeline isn't overwhelmed with 46 simultaneous deploys.

## Files Changed

All 43 remaining undeployed `index.ts` files -- CORS header update only (one line each).

