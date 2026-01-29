

# Pipeline Performance Optimization: Remove Brand Detection + Async Spelling Check

## Overview
Two targeted changes to improve pipeline performance:
1. **Remove brand detection** from pipeline (brand is now always manually selected)
2. **Move spelling check to async parallel** (same pattern as early copy generation)

---

## Change 1: Remove Brand Detection from Pipeline

### Current Behavior
- `detect-brand-from-image` runs in `Promise.all` with `auto-slice-v2` (lines 856-868)
- If no `brand_id` is provided from plugin, it tries to auto-detect
- The function fetches all user brands, sends image to Claude Sonnet 4 with web_search

### New Behavior
- Remove the `detectBrand()` call entirely from the Promise.all
- If `brand_id` is null from plugin payload, leave it null (no auto-detect)
- Keep the `detect-brand-from-image` edge function file intact for future use

### Files to Modify

**`supabase/functions/process-campaign-queue/index.ts`**:
- Remove the `detectBrand` function call at lines 856-868
- Remove the `detectBrand` helper function definition (lines 143-197) - optional, can keep for reference
- Simplify the parallel block to only run auto-slice
- Remove the brand detection result handling (lines 870-888)

```typescript
// BEFORE (lines 856-868):
const brandDetectionPromise = !brandId 
  ? detectBrand(supabase, imageResult.imageBase64)
  : Promise.resolve(brandId);

const slicePromise = autoSliceImage(...);

const [detectedBrandId, sliceResult] = await Promise.all([brandDetectionPromise, slicePromise]);

// AFTER:
// Just run auto-slice directly, brand_id comes from plugin only
const sliceResult = await autoSliceImage(
  imageResult.imageBase64,
  item.image_width || 600,
  item.image_height || 2000
);

// Brand is already set from plugin (item.brand_id), no detection needed
```

---

## Change 2: Move Spelling Check to Async Parallel

### Current Behavior
- `qa-spelling-check` runs synchronously at Step 6 (lines 1019-1031)
- Uses Claude Sonnet 4 (`claude-sonnet-4-20250514`)
- Blocks pipeline for ~3-5 seconds

### New Behavior
- Create new `qa-spelling-check-early` edge function (Haiku, faster)
- Fire immediately after image upload (same pattern as `generate-email-copy-early`)
- Store results in new `early_spelling_check` table
- Poll for results at end of pipeline
- Keep existing `qa-spelling-check` as fallback

### Database Migration

**New table: `early_spelling_check`**:
```sql
CREATE TABLE public.early_spelling_check (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_key TEXT NOT NULL UNIQUE,
  image_url TEXT,
  spelling_errors JSONB DEFAULT '[]'::jsonb,
  has_errors BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '1 hour')
);

-- RLS policies (same pattern as early_generated_copy)
ALTER TABLE early_spelling_check ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert early spelling check" 
  ON early_spelling_check FOR INSERT 
  WITH CHECK (true);

CREATE POLICY "Anyone can read early spelling check by session key" 
  ON early_spelling_check FOR SELECT 
  USING (true);

CREATE POLICY "Anyone can delete expired spelling check" 
  ON early_spelling_check FOR DELETE 
  USING (expires_at < now());
```

### New Edge Function: `qa-spelling-check-early`

**Location**: `supabase/functions/qa-spelling-check-early/index.ts`

**Pattern**: Same as `generate-email-copy-early`:
- Accepts `sessionKey` and `imageUrl`
- Uses **Claude Haiku** (`claude-haiku-4-5-20250929`) - faster, cheaper
- Stores results in `early_spelling_check` table
- Returns immediately with `{ success: true, sessionKey }`

```typescript
// Key differences from qa-spelling-check:
// 1. Model: claude-haiku-4-5-20250929 (not Sonnet)
// 2. Stores results in early_spelling_check table
// 3. Takes imageUrl (not base64) and fetches internally
```

### Modify `process-campaign-queue`

**Fire early spelling check (after Step 1, ~line 801)**:
```typescript
// Fire early spelling check immediately (same pattern as early copy)
const spellingSessionKey = crypto.randomUUID();
const spellingCheckUrl = Deno.env.get('SUPABASE_URL') + '/functions/v1/qa-spelling-check-early';
fetch(spellingCheckUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
  },
  body: JSON.stringify({
    sessionKey: spellingSessionKey,
    imageUrl: getResizedCloudinaryUrl(imageResult.imageUrl, 600, 7900)
  })
}).catch(err => console.log('[process] Early spelling check triggered:', err?.message || 'ok'));
```

**Poll for results (replace Step 6, ~lines 1019-1031)**:
```typescript
// Poll for early spelling check results (max 8 seconds, 2s intervals)
let spellingResult = { hasErrors: false, errors: [] };
const spellingPollStart = Date.now();
const maxSpellingWaitMs = 8000;

while (Date.now() - spellingPollStart < maxSpellingWaitMs) {
  const { data } = await supabase
    .from('early_spelling_check')
    .select('*')
    .eq('session_key', spellingSessionKey)
    .single();
  
  if (data) {
    spellingResult = {
      hasErrors: data.has_errors || false,
      errors: data.spelling_errors || []
    };
    console.log('[process] Early spelling check ready after', Date.now() - spellingPollStart, 'ms');
    break;
  }
  await new Promise(r => setTimeout(r, 2000));
}

// Fallback to sync if needed
if (!spellingResult && Date.now() - spellingPollStart >= maxSpellingWaitMs) {
  console.log('[process] Early spelling not ready, falling back to sync...');
  spellingResult = await qaSpellingCheck(imageResult.imageBase64);
}
```

### Update `supabase/config.toml`

Add new function:
```toml
[functions.qa-spelling-check-early]
verify_jwt = false
```

---

## Summary of Changes

| File | Action |
|------|--------|
| `supabase/functions/process-campaign-queue/index.ts` | Remove brand detection calls, add early spelling check fire + poll |
| `supabase/functions/qa-spelling-check-early/index.ts` | **CREATE** - New async spelling check with Haiku |
| `supabase/config.toml` | Add `qa-spelling-check-early` function |
| Database migration | Create `early_spelling_check` table with RLS |

## Expected Performance Impact

| Before | After | Savings |
|--------|-------|---------|
| Brand detection: ~5-8s (parallel with slice) | Removed | ~0s (brand selection is manual) |
| Spelling check: ~3-5s (blocking at end) | Runs parallel with entire pipeline | ~3-5s saved |

**Total expected time savings**: ~3-5 seconds per campaign (spelling check no longer blocks)

