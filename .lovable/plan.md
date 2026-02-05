

# Fix: Deploy `figma-ingest` (Bundle Timeout Workaround)

## Current Status

- `get-klaviyo-lists` -- FIXED, now deployed and responding
- `get-segment-size` -- FIXED, now deployed and responding
- `figma-ingest` -- STILL DOWN, direct deploy times out consistently

## Root Cause

The direct deployment tool's bundler is timing out specifically on `figma-ingest`. This is NOT a code issue (the function is structurally identical to 20+ others that deploy fine). It's an infrastructure-level bundler cache/state issue.

## The Fix

Make a small but meaningful code update to `figma-ingest/index.ts` so that the normal build pipeline picks it up and deploys it automatically. Two changes:

### 1. Update CORS headers to the full standard set

Current:
```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
```

Updated (matching the project-wide standard):
```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};
```

### 2. Pin the `esm.sh` import version (for bundler stability)

Current:
```typescript
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
```

Updated (pinned to specific version like `push-to-klaviyo` uses):
```typescript
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
```

Pinning the version prevents the bundler from having to resolve the `@2` semver range, which may be what's causing the timeout.

### 3. After the file edit, attempt direct deploy again

The build pipeline should automatically deploy, but we'll also retry `supabase--deploy_edge_functions` after the edit to confirm.

## Verification

After deployment:
- POST to `/figma-ingest` with `{}` body should return `401` ("Plugin token is required") instead of `404` ("NOT_FOUND")
- The Figma plugin should be able to send campaigns again

## File Changed

- `supabase/functions/figma-ingest/index.ts` (lines 2 and 4-7)

