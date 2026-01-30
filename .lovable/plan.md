
# Experiment: Dynamic Model Selection in auto-slice-v2

## Overview
Add conditional model selection to `auto-slice-v2` that uses the faster Claude Haiku model for brands with a populated link index, while keeping Sonnet for brands without. The Vision API does the heavy lifting (OCR, object detection, logo detection, edge detection), so Claude's role is to interpret structured data rather than do raw image analysis.

## Hypothesis
For indexed brands, Claude receives:
- Structured Vision API data (paragraphs, objects, logos, edges)
- A curated link index to match against
- Clear rules for slicing and linking

This is essentially a structured reasoning task, which Haiku handles well.

## Changes

### 1. Update `askClaude` Function Signature

**Location:** Line 626-633

Add a `claudeModel` parameter to pass the selected model:

```typescript
async function askClaude(
  imageBase64: string,
  mimeType: string,
  rawData: RawVisionData,
  claudeModel: string,  // NEW: Model to use
  linkIndex?: LinkIndexEntry[],
  defaultDestinationUrl?: string,
  brandPreferenceRules?: BrandPreferenceRule[]
): Promise<...>
```

### 2. Add Model Selection Logic in Main Handler

**Location:** After line 1379 (after logging link intelligence status)

```typescript
// Determine if we can use the fast model
const hasEnoughLinks = hasLinkIndex && linkIndex.length >= 5;

// Haiku for indexed brands (structured reasoning on Vision data)
// Sonnet for non-indexed brands (may need more complex analysis)
const claudeModel = hasEnoughLinks 
  ? 'claude-3-5-haiku-20241022'
  : 'claude-sonnet-4-5';

console.log('[auto-slice-v2] Model selection:', { 
  claudeModel, 
  linkCount: hasLinkIndex ? linkIndex.length : 0, 
  reason: hasEnoughLinks ? 'indexed brand - using fast model' : 'no index - using full model'
});
```

### 3. Update Claude API Call

**Location:** Line 1234

Change from hardcoded model:
```typescript
// Before
model: "claude-sonnet-4-5",

// After
model: claudeModel,
```

### 4. Pass Model to askClaude

**Location:** Line 1439-1446

Update the function call to pass the selected model:

```typescript
const claudeResult = await askClaude(
  resized.base64, 
  resized.mimeType, 
  scaledRawData,
  claudeModel,  // NEW: Pass selected model
  hasLinkIndex ? linkIndex : undefined,
  defaultDestinationUrl,
  brandPreferenceRules
);
```

### 5. Add Quality Logging

**Location:** After line 1493 (after slices are created)

```typescript
// Quality check logging for model comparison
console.log('[auto-slice-v2] Result quality check:', {
  model: claudeModel,
  sliceCount: slices.length,
  slicesWithLinks: slices.filter(s => s.link).length,
  slicesClickable: slices.filter(s => s.isClickable).length,
  needsLinkSearch: claudeResult.needsLinkSearch?.length || 0
});
```

## File Changes Summary

| File | Changes |
|------|---------|
| `supabase/functions/auto-slice-v2/index.ts` | Add model selection logic, update askClaude signature, add quality logging |

## Expected Improvement

| Metric | Sonnet (non-indexed) | Haiku (indexed) |
|--------|---------------------|-----------------|
| Latency | ~15-20s | ~5-8s |
| Cost | ~$0.03/call | ~$0.003/call |

## Rollback

If quality degrades for indexed brands, simply change the threshold from `>= 5` to a higher number, or revert to always using Sonnet.

## Quality Monitoring

The new logging will output for every call:
```
[auto-slice-v2] Model selection: { claudeModel: 'claude-3-5-haiku-20241022', linkCount: 47, reason: 'indexed brand - using fast model' }
[auto-slice-v2] Result quality check: { model: 'claude-3-5-haiku-20241022', sliceCount: 8, slicesWithLinks: 6, slicesClickable: 7, needsLinkSearch: 1 }
```

This allows comparing:
- **slicesWithLinks** - How many slices have matched links (higher = better matching)
- **slicesClickable** - How many slices Claude identified as clickable
- **needsLinkSearch** - How many slices need fallback web search (lower = better)
