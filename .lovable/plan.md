
# Add Google Vision Analysis to Footer Creation Process

## Problem

The footer creation and refinement process currently lacks precise positional and dimensional data:

1. **Initial Generation**: Claude only sees the reference image visually - no OCR text positions, logo bounds, section boundaries, or color palette data
2. **Refinement Loop**: Only the reference image is analyzed with Vision APIs. The **generated HTML render** is not analyzed, so Claude can't calculate actual mathematical differences (e.g., "logo is 140x45px in reference but 120x38px in render")

Meanwhile, the campaign slicing pipeline (`auto-slice-v2`) uses a comprehensive 4-layer Vision analysis:
- Layer 1: Google Cloud Vision OCR (text blocks with coordinates)
- Layer 2: Object Localization (detected elements)
- Layer 3: Logo Detection (brand logos with bounds)
- Layer 4: Horizontal Edge Detection (section boundaries)

This same approach should be applied to footer creation for pixel-perfect results.

---

## Solution Architecture

```text
CURRENT FLOW:
┌────────────────┐     ┌─────────────────────┐     ┌──────────────┐
│ Reference Image│ ──► │  footer-conversation │ ──► │ Generated HTML│
│    (visual)    │     │   (Claude only)      │     │              │
└────────────────┘     └─────────────────────┘     └──────────────┘

NEW FLOW:
┌────────────────┐     ┌─────────────────────────┐     ┌──────────────────────┐     ┌──────────────┐
│ Reference Image│ ──► │ analyze-footer-reference │ ──► │  footer-conversation  │ ──► │ Generated HTML│
│                │     │   (Vision APIs)          │     │ (Claude + visionData) │     │              │
└────────────────┘     └─────────────────────────┘     └──────────────────────┘     └──────────────┘
                                                                                              │
                                                                ┌──────────────────────┐      │
                                                                │ analyze-footer-render │ ◄───┘
                                                                │   (Vision on HTML)   │
                                                                └──────────────────────┘
                                                                           │
                                                                           ▼
                                                                ┌──────────────────────┐
                                                                │   MATHEMATICAL DIFF   │
                                                                │ "Logo: 140x45 → 120x38"│
                                                                │ "Padding: 24px → 18px" │
                                                                └──────────────────────┘
```

---

## Implementation Details

### Phase 1: Add Vision Analysis to Initial Footer Generation

**In `FooterBuilderModal.tsx`:**

After the reference image is obtained (from upload, Figma, or campaign crop), call `analyze-footer-reference` BEFORE calling `footer-conversation`:

```typescript
// After extractAssetsFromImage completes, analyze with Vision APIs
const analyzeWithVision = async (imageUrl: string) => {
  const { data, error } = await supabase.functions.invoke('analyze-footer-reference', {
    body: { imageUrl }
  });
  
  if (data.success) {
    setFooterVisionData(data); // Store for passing to generation
  }
};
```

**In `handleGenerateFooter`:**

Pass the vision data to the generation call:

```typescript
const { data, error } = await supabase.functions.invoke('footer-conversation', {
  body: {
    action: 'generate',
    referenceImageUrl,
    visionData: footerVisionData, // NEW: Include vision analysis
    assets: assetsWithBrandLogos,
    // ... rest of params
  }
});
```

### Phase 2: Create Render Analysis Function

**New Edge Function: `analyze-footer-render`**

This function will:
1. Accept a screenshot URL of the rendered HTML
2. Run the same Vision pipeline as `analyze-footer-reference`
3. Return normalized coordinates (600px width)

This is largely a copy of `analyze-footer-reference` - the same analysis, just on a different image.

### Phase 3: Compare Reference vs Render in Refinement

**In `CampaignStudio.tsx` refinement flow:**

1. After capturing the side-by-side screenshot, also capture a standalone screenshot of just the rendered HTML
2. Call `analyze-footer-render` on the rendered screenshot
3. Compute mathematical differences between reference vision data and render vision data:

```typescript
const computeDifferences = (reference: FooterVisionData, render: FooterVisionData) => {
  const diffs: string[] = [];
  
  // Compare dimensions
  if (Math.abs(reference.dimensions.height - render.dimensions.height) > 5) {
    diffs.push(`Height: ${reference.dimensions.height}px → ${render.dimensions.height}px`);
  }
  
  // Compare logos
  if (reference.logos[0] && render.logos[0]) {
    const refLogo = reference.logos[0];
    const renderLogo = render.logos[0];
    if (Math.abs(refLogo.width - renderLogo.width) > 5) {
      diffs.push(`Logo width: ${refLogo.width}px → ${renderLogo.width}px (need to increase)`);
    }
  }
  
  // Compare text positions
  for (const refText of reference.textBlocks) {
    const matchingRender = render.textBlocks.find(t => 
      t.text.toLowerCase().includes(refText.text.toLowerCase().substring(0, 10))
    );
    if (matchingRender && Math.abs(refText.estimatedFontSize - matchingRender.estimatedFontSize) > 2) {
      diffs.push(`"${refText.text}": ${refText.estimatedFontSize}px → ${matchingRender.estimatedFontSize}px`);
    }
  }
  
  return diffs;
};
```

4. Pass these differences to `footer-conversation` as part of the refinement prompt:

```typescript
const { data, error } = await supabase.functions.invoke('footer-conversation', {
  body: {
    action: 'refine',
    sideBySideScreenshotUrl,
    currentHtml,
    visionData: referenceVisionData,
    renderVisionData: renderAnalysis, // NEW
    mathematicalDiffs: diffs, // NEW: ["Logo width: 140px → 120px", ...]
    // ... rest
  }
});
```

### Phase 4: Update `footer-conversation` to Use Diff Data

**In the refine action:**

Add the mathematical differences to the prompt:

```typescript
const mathDiffSection = mathematicalDiffs?.length ? `
## MATHEMATICAL DISCREPANCIES (from Vision analysis)
These are PRECISE measurements comparing reference vs current render:
${mathematicalDiffs.map(d => `- ${d}`).join('\n')}

FIX THESE SPECIFIC VALUES. Do not guess - use the exact pixel differences above.
` : '';
```

---

## Files to Modify

| File | Action | Changes |
|------|--------|---------|
| `src/components/FooterBuilderModal.tsx` | **Modify** | Add `analyze-footer-reference` call after image obtained, store visionData, pass to generation |
| `supabase/functions/analyze-footer-render/index.ts` | **Create** | Clone of `analyze-footer-reference` for analyzing rendered HTML screenshots |
| `supabase/config.toml` | **Modify** | Add `analyze-footer-render` function config |
| `supabase/functions/footer-conversation/index.ts` | **Modify** | Accept `renderVisionData` and `mathematicalDiffs`, include in refinement prompts |
| `src/components/CampaignStudio.tsx` | **Modify** | After capturing render screenshot, call `analyze-footer-render`, compute diffs, pass to refinement |

---

## Data Flow Summary

### Initial Generation
```text
Reference Image → analyze-footer-reference → visionData
                                                  ↓
                                    footer-conversation (generate)
                                                  ↓
                                    Claude generates HTML with precise measurements
```

### Refinement Loop
```text
Reference Image ─────────────► analyze-footer-reference → referenceVisionData
                                                                    │
Rendered HTML Screenshot ────► analyze-footer-render → renderVisionData
                                                                    │
                                                        ┌───────────┴──────────┐
                                                        │   computeDifferences  │
                                                        │   (mathematical diff) │
                                                        └───────────┬──────────┘
                                                                    │
                                                                    ▼
                                            footer-conversation (refine) with:
                                            - sideBySideScreenshot
                                            - referenceVisionData
                                            - renderVisionData
                                            - mathematicalDiffs: ["Logo: 140→120px"]
```

---

## Expected Improvements

| Aspect | Before | After |
|--------|--------|-------|
| Logo sizing | Claude estimates visually | Exact dimensions: "Logo should be 142x48px" |
| Text positioning | "Center the nav links" | "Nav text at y=85px, font-size=14px" |
| Spacing | "Add some padding" | "Top padding: 32px, gap between items: 24px" |
| Color matching | Visual approximation | Exact hex: "#1a1a1a" from palette extraction |
| Refinement accuracy | "Looks about right" | "Logo is 18px too narrow, increase width" |

This brings the footer creation pipeline to parity with the campaign slicing pipeline in terms of precision.
