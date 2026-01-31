
# Fix Vision-Powered Footer Refinement for Accurate Element Sizing

## Problem Analysis

Based on the screenshot showing significant discrepancies between reference and render:

1. **Buttons are much narrower** in the rendered HTML vs reference
2. **Social icons are smaller** in the rendered HTML
3. **Text styling differs** (bold "SALE" vs regular weight)

The current implementation has these gaps:

| Component | Issue |
|-----------|-------|
| `footerVisionDiff.ts` | Only compares logos, text, colors - **ignores detected objects (buttons)** |
| `FooterVisionData` interface | Missing `objects` array - button/element detection data is discarded |
| Vision analysis | Captures objects via `OBJECT_LOCALIZATION` but data never flows to diff computation |
| Prompt engineering | Doesn't stress dimensional accuracy for buttons/icons with specific pixel values |

---

## Solution: Add Object/Button Detection to Vision Diff

### Phase 1: Update Types to Include Objects

**`src/lib/footerVisionDiff.ts`:**

Add the missing `DetectedObject` interface and include it in `FooterVisionData`:

```typescript
export interface DetectedObject {
  type: string; // e.g., "Button", "Icon", "Image"
  bounds: { xLeft: number; xRight: number; yTop: number; yBottom: number };
  width: number;
  height: number;
  score: number;
}

export interface FooterVisionData {
  dimensions: { width: number; height: number };
  textBlocks: TextBlock[];
  logos: DetectedLogo[];
  objects: DetectedObject[]; // NEW: Buttons, icons, images
  horizontalEdges: HorizontalEdge[];
  colorPalette: { background: string; text: string; accent: string };
}
```

### Phase 2: Add Button/Element Width Comparison

**`src/lib/footerVisionDiff.ts` - `computeVisionDifferences()`:**

Add new comparison logic for detected objects:

```typescript
// NEW: Button/element width and height comparisons
const refButtons = reference.objects?.filter(o => 
  o.type.toLowerCase().includes('button') || 
  o.bounds.xRight - o.bounds.xLeft > 200 // Wide elements likely buttons
) || [];

const renderButtons = render.objects?.filter(o => 
  o.type.toLowerCase().includes('button') || 
  o.bounds.xRight - o.bounds.xLeft > 200
) || [];

// Compare button widths
for (let i = 0; i < Math.min(refButtons.length, renderButtons.length); i++) {
  const refBtn = refButtons[i];
  const renderBtn = renderButtons[i];
  
  const widthDiff = renderBtn.width - refBtn.width;
  if (Math.abs(widthDiff) > 20) { // 20px threshold for buttons
    diffs.push(`Button ${i+1} width: render=${renderBtn.width}px vs reference=${refBtn.width}px - ${widthDiff < 0 ? 'INCREASE width by ' + Math.abs(widthDiff) + 'px' : 'decrease width'}`);
  }
  
  const heightDiff = renderBtn.height - refBtn.height;
  if (Math.abs(heightDiff) > 8) {
    diffs.push(`Button ${i+1} height: render=${renderBtn.height}px vs reference=${refBtn.height}px - ${heightDiff < 0 ? 'INCREASE height' : 'decrease height'}`);
  }
}
```

### Phase 3: Add Social Icon Size Detection

Social icons are often detected as small logos or objects. Add specific comparison:

```typescript
// Social icon size comparison (usually small square images ~32-48px)
const refIcons = reference.objects?.filter(o => 
  o.width >= 20 && o.width <= 60 && 
  Math.abs(o.width - o.height) < 10 // Square-ish elements
) || [];

const renderIcons = render.objects?.filter(o =>
  o.width >= 20 && o.width <= 60 &&
  Math.abs(o.width - o.height) < 10
) || [];

if (refIcons.length > 0 && renderIcons.length > 0) {
  const avgRefIconSize = refIcons.reduce((sum, i) => sum + i.width, 0) / refIcons.length;
  const avgRenderIconSize = renderIcons.reduce((sum, i) => sum + i.width, 0) / renderIcons.length;
  
  const iconSizeDiff = avgRenderIconSize - avgRefIconSize;
  if (Math.abs(iconSizeDiff) > 6) {
    diffs.push(`Social icons: render avg=${Math.round(avgRenderIconSize)}px vs reference avg=${Math.round(avgRefIconSize)}px - ${iconSizeDiff < 0 ? 'INCREASE icon size' : 'decrease icon size'}`);
  }
}
```

### Phase 4: Update CampaignStudio to Pass Objects

**`src/components/CampaignStudio.tsx`:**

Ensure `objects` is included when storing vision data:

```typescript
if (data.success) {
  console.log('Vision analysis complete:', {
    textBlocks: data.textBlocks?.length,
    logos: data.logos?.length,
    objects: data.objects?.length, // NEW: Log object count
    processingTime: data.processingTimeMs
  });
  setFooterVisionData(data); // This already includes objects, just verify interface
}
```

### Phase 5: Update footer-conversation Prompt

**`supabase/functions/footer-conversation/index.ts`:**

Add stronger emphasis on dimensional accuracy in the refinement prompt:

```typescript
const surgicalRules = `
⚠️ SURGICAL REFINEMENT RULES (CRITICAL):
...

## DIMENSIONAL ACCURACY (HIGHEST PRIORITY)
When mathematical differences are provided, these are PRECISE measurements from Vision API analysis.
- If a button is "120px narrower" → set width to the EXACT reference value
- If social icons are "10px smaller" → set icon dimensions to EXACT reference size
- NEVER estimate - use the EXACT pixel values from the diffs

Example fixes:
- "Button 1 width: render=380px vs reference=500px" → change button width from 380px to 500px
- "Social icons: render avg=24px vs reference avg=36px" → change icon size from 24px to 36px
`;
```

### Phase 6: Add Text Width Detection for Button Labels

Buttons in the reference have text that spans the button width. The render has cramped text:

```typescript
// Compare text block widths (useful for button labels)
const significantWidthTexts = reference.textBlocks.filter(t => t.width > 100);
for (const refText of significantWidthTexts.slice(0, 6)) {
  const matchingRender = findMatchingTextBlock(refText, render.textBlocks);
  if (!matchingRender) continue;
  
  const widthDiff = matchingRender.width - refText.width;
  if (Math.abs(widthDiff) > 30) { // 30px threshold for text container width
    const textPreview = refText.text.substring(0, 15);
    diffs.push(`"${textPreview}" container width: render=${matchingRender.width}px vs reference=${refText.width}px - ${widthDiff < 0 ? 'INCREASE container/button width' : 'decrease width'}`);
  }
}
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/lib/footerVisionDiff.ts` | Add `DetectedObject` interface, add `objects` to `FooterVisionData`, add button width/height comparison, add icon size comparison, add text width comparison |
| `src/components/CampaignStudio.tsx` | Verify objects are logged and passed through correctly |
| `supabase/functions/footer-conversation/index.ts` | Add stronger dimensional accuracy instructions in refinement prompt |

---

## Expected Improvements

| Element | Before | After |
|---------|--------|-------|
| Button widths | Claude guesses visually | "Button is 120px NARROWER → INCREASE to 500px" |
| Social icons | Not compared | "Icons avg 24px vs 36px → INCREASE by 12px" |
| Text containers | Only Y-position compared | "SHOP FOR HIM container 280px vs 450px → INCREASE" |
| Overall accuracy | ~70% match | ~95% match with precise pixel instructions |

---

## Technical Notes

1. **Object Detection Reliability**: Google Vision's `OBJECT_LOCALIZATION` may not always detect HTML buttons as "Button" type. The fallback uses width heuristics (elements wider than 200px in a 600px footer are likely buttons).

2. **Icon Detection**: Social icons are detected as small square objects. The size comparison uses averages to handle minor detection variations.

3. **Text Width as Proxy**: When buttons aren't detected as objects, the text inside them still has a `width` from OCR. Comparing text widths reveals if the containing element is too narrow.
