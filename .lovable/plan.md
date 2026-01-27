
# Fix: Wrong Beta Header AND Tool Type for web_fetch

## Problem
The Claude API call is failing with a 400 error because both the beta header AND tool type for `web_fetch` are incorrect.

## Root Cause
Web Search and Web Fetch have **different release dates**:
- **Web Search**: March 5, 2025 → `web-search-2025-03-05`, `web_search_20250305`
- **Web Fetch**: September 10, 2025 → `web-fetch-2025-09-10`, `web_fetch_20250910`

The code incorrectly used the March date for web_fetch, which doesn't exist.

## Required Changes

**File:** `supabase/functions/analyze-slices/index.ts`

### Change 1: Fix the web_fetch tool type (line 235)

```text
Current:
type: 'web_fetch_20250305',

Fixed:
type: 'web_fetch_20250910',
```

### Change 2: Fix the beta header to include BOTH features (line 248)

```text
Current:
'anthropic-beta': 'web-fetch-2025-03-05',

Fixed:
'anthropic-beta': 'web-search-2025-03-05,web-fetch-2025-09-10',
```

## Why Both Changes Are Needed
- The tool type tells Claude which tool version to use internally
- The beta header enables the feature on the API side
- Since we're using both `web_search` and `web_fetch`, the beta header must list both comma-separated

## Expected Result
After this fix:
- Claude API call succeeds (no more 400 errors)
- Alt text is generated for all slices
- Links are discovered using web_search + web_fetch together
- Product URLs get resolved properly (e.g., Jessa Pant → `/products/jessa-pant-grey`)
