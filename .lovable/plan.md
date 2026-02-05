

# Fix: Deploy `upload-to-imagekit` (the ACTUAL missing function)

## What's Actually Happening

The logs prove `figma-ingest` **is deployed and working**. Here's the actual error chain:

```
Figma Plugin
    |
    v
figma-ingest (200 OK, runs fine)
    |
    v  calls upload-to-imagekit internally
upload-to-imagekit → 404 NOT FOUND (not deployed)
    |
    v
"ImageKit upload failed" → 0 campaigns created → plugin shows error
```

The smoking gun from the logs:
```
ERROR [figma-ingest] ImageKit upload failed: {"code":"NOT_FOUND","message":"Requested function was not found"}
INFO  [figma-ingest] Created 0 campaigns
```

This happens every time. The function code exists at `supabase/functions/upload-to-imagekit/index.ts`, it's in `config.toml`, secrets are configured — it simply was never deployed.

## The Fix

Deploy `upload-to-imagekit`. That's it. One function deployment.

To ensure the deploy succeeds (given the bundler timeout issues seen with `figma-ingest`), also make a small code update to standardize the CORS headers — this ensures the build pipeline picks it up.

### Changes to `supabase/functions/upload-to-imagekit/index.ts`

Line 5 — update CORS headers to the full standard:
```typescript
// Before:
'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',

// After:
'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
```

Then deploy the function directly.

## Verification

After deployment:
- `POST /upload-to-imagekit` with `{}` should return `400` ("No image data or URL provided") instead of `404`
- `figma-ingest` will then successfully upload images and create campaign queue entries
- The Figma plugin "Send" flow will work end-to-end

## File Changed

- `supabase/functions/upload-to-imagekit/index.ts` (line 5 only)
