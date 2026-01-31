/**
 * Utility functions for computing mathematical differences between
 * reference and render Vision analysis data for footer refinement.
 */

export interface TextBlock {
  text: string;
  bounds: { xLeft: number; xRight: number; yTop: number; yBottom: number };
  width: number;
  height: number;
  estimatedFontSize: number;
}

export interface DetectedLogo {
  name: string;
  bounds: { xLeft: number; xRight: number; yTop: number; yBottom: number };
  width: number;
  height: number;
}

export interface DetectedObject {
  type: string; // e.g., "Button", "Icon", "Image", "Person"
  bounds: { xLeft: number; xRight: number; yTop: number; yBottom: number };
  width: number;
  height: number;
  score: number;
}

export interface HorizontalEdge {
  y: number;
  colorAbove: string;
  colorBelow: string;
}

export interface FooterVisionData {
  dimensions: { width: number; height: number };
  textBlocks: TextBlock[];
  logos: DetectedLogo[];
  objects?: DetectedObject[]; // Buttons, icons, images detected by OBJECT_LOCALIZATION
  horizontalEdges: HorizontalEdge[];
  colorPalette: { background: string; text: string; accent: string };
}

// Threshold values for determining significant differences
const THRESHOLDS = {
  HEIGHT_DIFF: 10,        // pixels
  LOGO_SIZE_DIFF: 8,      // pixels
  LOGO_POSITION_DIFF: 15, // pixels
  FONT_SIZE_DIFF: 3,      // pixels
  TEXT_Y_DIFF: 10,        // pixels
  TEXT_WIDTH_DIFF: 30,    // pixels - for button labels
  COLOR_DIFF: 30,         // RGB distance
  SECTION_Y_DIFF: 15,     // pixels
  BUTTON_WIDTH_DIFF: 20,  // pixels
  BUTTON_HEIGHT_DIFF: 8,  // pixels
  ICON_SIZE_DIFF: 6,      // pixels
};

/**
 * Compute the RGB distance between two hex colors
 */
function colorRgbDistance(hex1: string, hex2: string): number {
  const parseHex = (hex: string) => {
    const clean = hex.replace('#', '');
    return {
      r: parseInt(clean.slice(0, 2), 16) || 0,
      g: parseInt(clean.slice(2, 4), 16) || 0,
      b: parseInt(clean.slice(4, 6), 16) || 0,
    };
  };
  
  const c1 = parseHex(hex1);
  const c2 = parseHex(hex2);
  
  return Math.sqrt(
    Math.pow(c1.r - c2.r, 2) +
    Math.pow(c1.g - c2.g, 2) +
    Math.pow(c1.b - c2.b, 2)
  );
}

/**
 * Find matching text block in render based on text content
 */
function findMatchingTextBlock(refText: TextBlock, renderBlocks: TextBlock[]): TextBlock | null {
  // Try exact match first
  const exactMatch = renderBlocks.find(rb => 
    rb.text.toLowerCase() === refText.text.toLowerCase()
  );
  if (exactMatch) return exactMatch;
  
  // Try partial match (first 15 chars)
  const searchStr = refText.text.toLowerCase().substring(0, 15);
  if (searchStr.length < 3) return null;
  
  return renderBlocks.find(rb => 
    rb.text.toLowerCase().includes(searchStr) ||
    searchStr.includes(rb.text.toLowerCase().substring(0, 15))
  ) || null;
}

/**
 * Identify button-like elements from detected objects
 * Buttons are typically wide rectangular elements (>150px in 600px footer)
 */
function identifyButtons(objects: DetectedObject[] = []): DetectedObject[] {
  return objects.filter(o => 
    o.type.toLowerCase().includes('button') ||
    (o.width > 150 && o.height >= 30 && o.height <= 80) // Wide, rectangular elements
  ).sort((a, b) => a.bounds.yTop - b.bounds.yTop);
}

/**
 * Identify social icon-like elements from detected objects
 * Icons are small, roughly square elements (20-60px)
 */
function identifyIcons(objects: DetectedObject[] = []): DetectedObject[] {
  return objects.filter(o => 
    o.width >= 20 && o.width <= 60 && 
    Math.abs(o.width - o.height) < 10 // Square-ish elements
  );
}

/**
 * Synthesize button-like objects from wide text blocks
 * This is a fallback when OBJECT_LOCALIZATION doesn't detect HTML buttons
 */
function synthesizeButtonsFromText(textBlocks: TextBlock[]): DetectedObject[] {
  return textBlocks
    .filter(t => 
      t.width > 150 && // Wide text likely a button label
      t.height >= 20 && 
      t.height <= 60 &&
      t.text.length < 30 // Button labels are short
    )
    .map(t => ({
      type: 'SyntheticButton',
      bounds: t.bounds,
      width: t.width,
      height: t.height,
      score: 0.8
    }));
}

/**
 * Compute mathematical differences between reference and render Vision data.
 * Returns an array of human-readable difference strings for Claude to fix.
 */
export function computeVisionDifferences(
  reference: FooterVisionData,
  render: FooterVisionData
): string[] {
  const diffs: string[] = [];
  
  // 1. Overall height comparison
  const heightDiff = render.dimensions.height - reference.dimensions.height;
  if (Math.abs(heightDiff) > THRESHOLDS.HEIGHT_DIFF) {
    if (heightDiff > 0) {
      diffs.push(`Footer is ${heightDiff}px TALLER than reference (${render.dimensions.height}px vs ${reference.dimensions.height}px) - reduce padding/spacing`);
    } else {
      diffs.push(`Footer is ${Math.abs(heightDiff)}px SHORTER than reference (${render.dimensions.height}px vs ${reference.dimensions.height}px) - increase padding/spacing`);
    }
  }
  
  // 2. Logo size and position comparison
  if (reference.logos.length > 0) {
    const refLogo = reference.logos[0];
    const renderLogo = render.logos.length > 0 ? render.logos[0] : null;
    
    if (!renderLogo) {
      diffs.push(`Logo NOT DETECTED in render - ensure logo is visible and sized correctly (reference: ${refLogo.width}x${refLogo.height}px)`);
    } else {
      // Width comparison
      const widthDiff = renderLogo.width - refLogo.width;
      if (Math.abs(widthDiff) > THRESHOLDS.LOGO_SIZE_DIFF) {
        if (widthDiff < 0) {
          diffs.push(`LOGO WIDTH: render=${renderLogo.width}px, reference=${refLogo.width}px → SET width="${refLogo.width}" in <img> tag`);
        } else {
          diffs.push(`LOGO WIDTH: render=${renderLogo.width}px, reference=${refLogo.width}px → SET width="${refLogo.width}" in <img> tag`);
        }
      }
      
      // Height comparison
      const heightLogoDiff = renderLogo.height - refLogo.height;
      if (Math.abs(heightLogoDiff) > THRESHOLDS.LOGO_SIZE_DIFF) {
        diffs.push(`LOGO HEIGHT: render=${renderLogo.height}px, reference=${refLogo.height}px → SET height="${refLogo.height}" in <img> tag`);
      }
      
      // Vertical position
      const yDiff = renderLogo.bounds.yTop - refLogo.bounds.yTop;
      if (Math.abs(yDiff) > THRESHOLDS.LOGO_POSITION_DIFF) {
        if (yDiff > 0) {
          diffs.push(`LOGO POSITION: ${yDiff}px too LOW → reduce top padding by ${yDiff}px`);
        } else {
          diffs.push(`LOGO POSITION: ${Math.abs(yDiff)}px too HIGH → increase top padding by ${Math.abs(yDiff)}px`);
        }
      }
    }
  }
  
  // 3. Button/element comparisons - use objects OR synthesize from text
  let refButtons = identifyButtons(reference.objects);
  let renderButtons = identifyButtons(render.objects);
  
  // Fallback: if no objects detected, synthesize from wide text blocks
  if (refButtons.length === 0) {
    refButtons = synthesizeButtonsFromText(reference.textBlocks);
  }
  if (renderButtons.length === 0) {
    renderButtons = synthesizeButtonsFromText(render.textBlocks);
  }
  
  for (let i = 0; i < Math.min(refButtons.length, renderButtons.length); i++) {
    const refBtn = refButtons[i];
    const renderBtn = renderButtons[i];
    
    const widthDiff = renderBtn.width - refBtn.width;
    if (Math.abs(widthDiff) > THRESHOLDS.BUTTON_WIDTH_DIFF) {
      if (widthDiff < 0) {
        diffs.push(`Button ${i + 1} is ${Math.abs(widthDiff)}px NARROWER (render=${renderBtn.width}px vs reference=${refBtn.width}px) - INCREASE button width to ${refBtn.width}px`);
      } else {
        diffs.push(`Button ${i + 1} is ${widthDiff}px WIDER (render=${renderBtn.width}px vs reference=${refBtn.width}px) - decrease button width to ${refBtn.width}px`);
      }
    }
    
    const heightDiff = renderBtn.height - refBtn.height;
    if (Math.abs(heightDiff) > THRESHOLDS.BUTTON_HEIGHT_DIFF) {
      if (heightDiff < 0) {
        diffs.push(`Button ${i + 1} is ${Math.abs(heightDiff)}px SHORTER (render=${renderBtn.height}px vs reference=${refBtn.height}px) - INCREASE button height to ${refBtn.height}px`);
      } else {
        diffs.push(`Button ${i + 1} is ${heightDiff}px TALLER (render=${renderBtn.height}px vs reference=${refBtn.height}px) - decrease button height to ${refBtn.height}px`);
      }
    }
  }
  
  // 4. Social icon size comparison (NEW)
  const refIcons = identifyIcons(reference.objects);
  const renderIcons = identifyIcons(render.objects);
  
  if (refIcons.length > 0 && renderIcons.length > 0) {
    const avgRefIconSize = refIcons.reduce((sum, i) => sum + i.width, 0) / refIcons.length;
    const avgRenderIconSize = renderIcons.reduce((sum, i) => sum + i.width, 0) / renderIcons.length;
    
    const iconSizeDiff = avgRenderIconSize - avgRefIconSize;
    if (Math.abs(iconSizeDiff) > THRESHOLDS.ICON_SIZE_DIFF) {
      if (iconSizeDiff < 0) {
        diffs.push(`Social icons are ${Math.abs(Math.round(iconSizeDiff))}px SMALLER on average (render=${Math.round(avgRenderIconSize)}px vs reference=${Math.round(avgRefIconSize)}px) - INCREASE icon size to ${Math.round(avgRefIconSize)}px`);
      } else {
        diffs.push(`Social icons are ${Math.round(iconSizeDiff)}px LARGER on average (render=${Math.round(avgRenderIconSize)}px vs reference=${Math.round(avgRefIconSize)}px) - decrease icon size to ${Math.round(avgRefIconSize)}px`);
      }
    }
  }
  
  // 5. Text block comparisons (font sizes, positions, AND widths)
  const significantRefTexts = reference.textBlocks.filter(t => 
    t.estimatedFontSize >= 10 && t.text.length >= 3
  );
  
  for (const refText of significantRefTexts.slice(0, 8)) { // Limit to 8 most important
    const matchingRender = findMatchingTextBlock(refText, render.textBlocks);
    
    if (!matchingRender) {
      // Only report if it's significant text (not just whitespace)
      if (refText.text.trim().length > 5) {
        diffs.push(`Text "${refText.text.substring(0, 25)}..." not found in render at expected position y=${refText.bounds.yTop}px`);
      }
      continue;
    }
    
    // Font size comparison
    const fontDiff = matchingRender.estimatedFontSize - refText.estimatedFontSize;
    if (Math.abs(fontDiff) > THRESHOLDS.FONT_SIZE_DIFF) {
      const textPreview = refText.text.substring(0, 20);
      if (fontDiff < 0) {
        diffs.push(`"${textPreview}": font is ${Math.abs(fontDiff)}px SMALLER (${matchingRender.estimatedFontSize}px vs ${refText.estimatedFontSize}px) - INCREASE font-size to ${refText.estimatedFontSize}px`);
      } else {
        diffs.push(`"${textPreview}": font is ${fontDiff}px LARGER (${matchingRender.estimatedFontSize}px vs ${refText.estimatedFontSize}px) - decrease font-size to ${refText.estimatedFontSize}px`);
      }
    }
    
    // Vertical position comparison
    const textYDiff = matchingRender.bounds.yTop - refText.bounds.yTop;
    if (Math.abs(textYDiff) > THRESHOLDS.TEXT_Y_DIFF) {
      const textPreview = refText.text.substring(0, 20);
      if (textYDiff > 0) {
        diffs.push(`"${textPreview}": is ${textYDiff}px LOWER than reference - move UP`);
      } else {
        diffs.push(`"${textPreview}": is ${Math.abs(textYDiff)}px HIGHER than reference - move DOWN`);
      }
    }
    
    // Width comparison (for button labels/containers) - NEW
    if (refText.width > 100) { // Only compare significant width text
      const widthDiff = matchingRender.width - refText.width;
      if (Math.abs(widthDiff) > THRESHOLDS.TEXT_WIDTH_DIFF) {
        const textPreview = refText.text.substring(0, 15);
        if (widthDiff < 0) {
          diffs.push(`"${textPreview}" container is ${Math.abs(widthDiff)}px NARROWER (${matchingRender.width}px vs ${refText.width}px) - INCREASE container/button width`);
        } else {
          diffs.push(`"${textPreview}" container is ${widthDiff}px WIDER (${matchingRender.width}px vs ${refText.width}px) - decrease container width`);
        }
      }
    }
  }
  
  // 6. Color palette comparison
  const bgColorDiff = colorRgbDistance(reference.colorPalette.background, render.colorPalette.background);
  if (bgColorDiff > THRESHOLDS.COLOR_DIFF) {
    diffs.push(`Background color mismatch: render=${render.colorPalette.background} vs reference=${reference.colorPalette.background} - use exact reference color ${reference.colorPalette.background}`);
  }
  
  const textColorDiff = colorRgbDistance(reference.colorPalette.text, render.colorPalette.text);
  if (textColorDiff > THRESHOLDS.COLOR_DIFF) {
    diffs.push(`Text color mismatch: render=${render.colorPalette.text} vs reference=${reference.colorPalette.text} - use exact reference color ${reference.colorPalette.text}`);
  }
  
  // 7. Section boundary comparison (major horizontal edges)
  if (reference.horizontalEdges.length > 0 && render.horizontalEdges.length > 0) {
    const refMainEdge = reference.horizontalEdges[0];
    const renderMainEdge = render.horizontalEdges[0];
    
    const edgeYDiff = renderMainEdge.y - refMainEdge.y;
    if (Math.abs(edgeYDiff) > THRESHOLDS.SECTION_Y_DIFF) {
      diffs.push(`Main section boundary at y=${renderMainEdge.y}px vs reference y=${refMainEdge.y}px (${Math.abs(edgeYDiff)}px off)`);
    }
  }
  
  return diffs;
}

/**
 * Format differences into a concise string for the Claude prompt
 */
export function formatDifferencesForPrompt(diffs: string[]): string {
  if (diffs.length === 0) {
    return 'No significant mathematical differences detected - the render closely matches the reference.';
  }
  
  return diffs.map((d, i) => `${i + 1}. ${d}`).join('\n');
}
