

# Add Diagnostic Logging to Link Intelligence Pipeline

## Purpose
Debug why campaigns are taking 45+ seconds and producing no links despite having 26 indexed links and configured preferences.

---

## Logging Points in `analyze-slices`

### 1. Function Entry (Line ~75)
```typescript
console.log('[analyze-slices] Starting', {
  brandId: brandId || 'none',
  sliceCount: slices.length,
  hasBrandId: !!brandId,
  brandDomain: domain
});
```

### 2. After Link Index Check (Line ~107)
```typescript
console.log('[analyze-slices] Link index check', {
  brandId,
  hasLinkIndex,
  linkCount: count || 0,
  hasPreferences: !!linkPreferences,
  defaultUrl: linkPreferences?.default_destination_url || 'none',
  ruleCount: linkPreferences?.rules?.length || 0,
  usingIndexPath: hasLinkIndex && Boolean(brandId)
});
```

### 3. After Campaign Context Analysis (Line ~116)
```typescript
console.log('[analyze-slices] Campaign context', {
  campaign_type: campaignContext?.campaign_type,
  primary_focus: campaignContext?.primary_focus,
  detected_products: campaignContext?.detected_products?.length || 0,
  detected_collections: campaignContext?.detected_collections?.length || 0
});
```

### 4. After Getting Slice Descriptions (after Line ~132)
```typescript
console.log('[analyze-slices] Slice descriptions received');
sliceDescriptions.forEach((slice, i) => {
  console.log(`[analyze-slices] Slice ${i}`, {
    isClickable: slice.isClickable,
    isGenericCta: slice.isGenericCta,
    description: slice.description?.substring(0, 80),
    altText: slice.altText?.substring(0, 50)
  });
});
```

### 5. After Link Matching (before return, Line ~166)
```typescript
console.log('[analyze-slices] Link matching complete', {
  slicesWithLinks: analyses.filter(r => r.suggestedLink).length,
  slicesWithoutLinks: analyses.filter(r => !r.suggestedLink).length,
  clickableWithoutLinks: analyses.filter(r => r.isClickable && !r.suggestedLink).length,
  linkSources: analyses.map(r => r.linkSource)
});
```

---

## Logging Points in `match-slice-to-link`

### 1. Function Entry (Line ~64)
```typescript
console.log('[match-slice-to-link] Starting', {
  brandId: brand_id,
  isGenericCta: is_generic_cta,
  description: slice_description?.substring(0, 80),
  campaignType: campaign_context?.campaign_type,
  primaryFocus: campaign_context?.primary_focus
});
```

### 2. After Brand Preferences Lookup (Line ~86)
```typescript
console.log('[match-slice-to-link] Brand preferences', {
  brandFound: !!brand,
  hasDefaultUrl: !!preferences?.default_destination_url,
  defaultUrl: preferences?.default_destination_url?.substring(0, 60),
  ruleCount: preferences?.rules?.length || 0,
  rules: preferences?.rules?.map(r => r.name) || []
});
```

### 3. After Link Index Fetch (Line ~141)
```typescript
console.log('[match-slice-to-link] Link index', {
  totalLinks: linkIndex?.length || 0,
  healthyLinks: healthyLinks.length,
  matchingStrategy: healthyLinks.length < 50 ? 'claude_list' : 'vector_search'
});
```

### 4. Final Match Result (Line ~176)
```typescript
console.log('[match-slice-to-link] Final result', {
  matchedUrl: matchResult.url?.substring(0, 60) || 'none',
  source: matchResult.source,
  confidence: matchResult.confidence.toFixed(2),
  linkId: matchResult.link_id || 'none'
});
```

---

## Files to Update

| File | Changes |
|------|---------|
| `supabase/functions/analyze-slices/index.ts` | Add 5 logging points |
| `supabase/functions/match-slice-to-link/index.ts` | Add 4 logging points |

---

## Expected Diagnostic Output

After reprocessing, logs will show:

```
[analyze-slices] Starting { brandId: 'abc-123', sliceCount: 15, hasBrandId: true }
[analyze-slices] Link index check { hasLinkIndex: true, linkCount: 26, usingIndexPath: true }
[analyze-slices] Campaign context { campaign_type: 'product_launch', primary_focus: '...' }
[analyze-slices] Slice 0 { isClickable: true, isGenericCta: false, description: '...' }
...
[match-slice-to-link] Starting { brandId: 'abc-123', isGenericCta: false, description: '...' }
[match-slice-to-link] Brand preferences { hasDefaultUrl: true, ruleCount: 2 }
[match-slice-to-link] Link index { healthyLinks: 26, matchingStrategy: 'claude_list' }
[match-slice-to-link] Final result { matchedUrl: 'https://...', source: 'index_list_match' }
...
[analyze-slices] Link matching complete { slicesWithLinks: 12, slicesWithoutLinks: 3 }
```

This will reveal:
1. Whether `brandId` is being passed correctly
2. Whether link index is being found
3. Whether slice descriptions are being generated correctly
4. Whether matching is being called and what results it returns
5. Where the pipeline is failing

---

## Summary

Add comprehensive logging at 9 strategic points across both edge functions to trace the complete flow from input to final link matching results.

