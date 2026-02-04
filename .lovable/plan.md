# Enhanced Link Intelligence System

## ✅ IMPLEMENTED

### Fix 1: Two-Category Link Strategy
**File:** `supabase/functions/crawl-brand-site/index.ts`

- **Phase 1 - Navigation & Collections (UNCAPPED)**
  - Search term: `collections categories navigation menu`
  - Limit: 5000 (get all nav structure)
  - Filters out product URLs to keep only pages/collections
  
- **Phase 2 - Products (Smart 100 cap)**
  - Search term: `products best sellers new arrivals featured popular trending sale`
  - Limit: 100 (capped to keep index manageable)
  - Prioritizes from relevant collections instead of random products

- **Result:** Unlimited nav/collections + 100 priority products

---

### Fix 2: Date/Version Matching in Prompts
**Files:** 
- `supabase/functions/match-slice-to-link/index.ts`
- `supabase/functions/auto-slice-v2/index.ts`

Added explicit rules to reject year/date mismatches:
- "Winter 2025" is NOT the same as "Winter 2024"
- If slice says "2025" but link says "2024", that is NOT a match
- When exact dated version isn't available, set `linkSource: 'needs_search'`

---

### Fix 3: Weekly Re-crawl Automation
**New File:** `supabase/functions/weekly-link-recrawl/index.ts`

- Finds brands where `last_crawled_at` is null or > 7 days old
- Triggers `crawl-brand-site` for each with staggered timing (2s delay)
- Updates `brands.last_crawled_at` on successful crawl

**Database Migration:**
- Added `last_crawled_at TIMESTAMPTZ` column to `brands` table

**Note:** Cron job needs to be scheduled manually in Supabase dashboard:
```sql
SELECT cron.schedule(
  'weekly-link-recrawl',
  '0 3 * * 0',  -- Every Sunday at 3am UTC
  $$SELECT net.http_post(
    url := 'https://esrimjavbjdtecszxudc.supabase.co/functions/v1/weekly-link-recrawl',
    headers := '{"Authorization": "Bearer [YOUR_SERVICE_ROLE_KEY]"}'::jsonb
  )$$
);
```

---

## Expected Behavior

| Slice Content | Index State | Result |
|---------------|-------------|--------|
| "Shop Winter 2025" | Only has `winter-2024` link | `linkSource: 'needs_search'` → web search finds `/collections/winter-2025` |
| "FWC Cruz Snow Jacket" product image | Only collection URLs | `linkSource: 'needs_search'` → web search finds exact product URL |
| "Shop Our Winter Collection" | Has `mens-winter-jackets` collection | `linkSource: 'index'` → uses collection URL |
| Generic "SHOP NOW" button | Default URL configured | `linkSource: 'default'` → uses default destination |

---

## Files Modified

| File | Changes |
|------|---------|
| `supabase/functions/crawl-brand-site/index.ts` | Restructured to uncapped nav + 100 smart products |
| `supabase/functions/match-slice-to-link/index.ts` | Added date/version matching rules to prompts |
| `supabase/functions/auto-slice-v2/index.ts` | Added date/version matching to link assignment |
| `supabase/functions/weekly-link-recrawl/index.ts` | NEW - Weekly automation function |
| Database | Added `last_crawled_at` column to brands table |
