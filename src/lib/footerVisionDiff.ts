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

export interface HorizontalEdge {
  y: number;
  colorAbove: string;
  colorBelow: string;
}

export interface FooterVisionData {
  dimensions: { width: number; height: number };
  textBlocks: TextBlock[];
  logos: DetectedLogo[];
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
  COLOR_DIFF: 30,         // RGB distance
  SECTION_Y_DIFF: 15,     // pixels
};

/**
 * Compute the RGB distance between two hex colors
 */
function colorRgbDistance(hex1: string, hex2: string): number {
  const parseHex = (hex: string) => {
    const clean = hex.replace('#', '');
    return {
      r: parseInt(clean.slice(0, 2), 16),
      g: parseInt(clean.slice(2, 4), 16),
      b: parseInt(clean.slice(4, 6), 16),
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
          diffs.push(`Logo is ${Math.abs(widthDiff)}px NARROWER than reference (${renderLogo.width}px vs ${refLogo.width}px) - INCREASE logo width`);
        } else {
          diffs.push(`Logo is ${widthDiff}px WIDER than reference (${renderLogo.width}px vs ${refLogo.width}px) - decrease logo width`);
        }
      }
      
      // Height comparison
      const heightLogoDiff = renderLogo.height - refLogo.height;
      if (Math.abs(heightLogoDiff) > THRESHOLDS.LOGO_SIZE_DIFF) {
        if (heightLogoDiff < 0) {
          diffs.push(`Logo is ${Math.abs(heightLogoDiff)}px SHORTER than reference (${renderLogo.height}px vs ${refLogo.height}px) - INCREASE logo height`);
        } else {
          diffs.push(`Logo is ${heightLogoDiff}px TALLER than reference (${renderLogo.height}px vs ${refLogo.height}px) - decrease logo height`);
        }
      }
      
      // Vertical position
      const yDiff = renderLogo.bounds.yTop - refLogo.bounds.yTop;
      if (Math.abs(yDiff) > THRESHOLDS.LOGO_POSITION_DIFF) {
        if (yDiff > 0) {
          diffs.push(`Logo is ${yDiff}px LOWER than reference - move logo UP (reduce top padding)`);
        } else {
          diffs.push(`Logo is ${Math.abs(yDiff)}px HIGHER than reference - move logo DOWN (increase top padding)`);
        }
      }
    }
  }
  
  // 3. Text block comparisons (font sizes and positions)
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
        diffs.push(`"${textPreview}": font is ${Math.abs(fontDiff)}px SMALLER (${matchingRender.estimatedFontSize}px vs ${refText.estimatedFontSize}px) - INCREASE font-size`);
      } else {
        diffs.push(`"${textPreview}": font is ${fontDiff}px LARGER (${matchingRender.estimatedFontSize}px vs ${refText.estimatedFontSize}px) - decrease font-size`);
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
  }
  
  // 4. Color palette comparison
  const bgColorDiff = colorRgbDistance(reference.colorPalette.background, render.colorPalette.background);
  if (bgColorDiff > THRESHOLDS.COLOR_DIFF) {
    diffs.push(`Background color mismatch: render=${render.colorPalette.background} vs reference=${reference.colorPalette.background} - use exact reference color`);
  }
  
  const textColorDiff = colorRgbDistance(reference.colorPalette.text, render.colorPalette.text);
  if (textColorDiff > THRESHOLDS.COLOR_DIFF) {
    diffs.push(`Text color mismatch: render=${render.colorPalette.text} vs reference=${reference.colorPalette.text} - use exact reference color`);
  }
  
  // 5. Section boundary comparison (major horizontal edges)
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
