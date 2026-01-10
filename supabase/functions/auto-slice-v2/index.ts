import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================================
// SECTION 1: TYPES AND INTERFACES
// ============================================================================

interface Paragraph {
  text: string;
  yTop: number;
  yBottom: number;
  xLeft: number;
  xRight: number;
  confidence: number;
  height: number;
  width: number;
}

interface ForbiddenBand {
  yTop: number;
  yBottom: number;
}

interface DetectedObject {
  name: string;
  score: number;
  yTop: number;
  yBottom: number;
  xLeft: number;
  xRight: number;
}

interface DetectedLogo {
  description: string;
  score: number;
  yTop: number;
  yBottom: number;
  xLeft: number;
  xRight: number;
}

interface SignificantGap {
  yPosition: number;
  gapSize: number;
  aboveElement: string;
  belowElement: string;
}

interface FooterDetection {
  footerStartY: number;
  confidence: 'high' | 'medium' | 'low';
}

interface SliceOutput {
  yTop: number;
  yBottom: number;
}

interface PreprocessingData {
  paragraphs: Paragraph[];
  objects: DetectedObject[];
  logos: DetectedLogo[];
  forbiddenBands: ForbiddenBand[];
  significantGaps: SignificantGap[];
  footerStartY: number;
  footerConfidence: 'high' | 'medium' | 'low';
  imageWidth: number;
  imageHeight: number;
}

interface AutoSliceV2Response {
  success: boolean;
  footerStartY: number;
  slices: SliceOutput[];
  imageHeight: number;
  imageWidth: number;
  processingTimeMs: number;
  confidence: {
    footer: 'high' | 'medium' | 'low';
    overall: 'high' | 'medium' | 'low';
  };
  error?: string;
  debug?: {
    paragraphCount: number;
    objectCount: number;
    logoCount: number;
    gapCount: number;
    forbiddenBandCount: number;
    claudeBoundaries?: number[];
  };
}

// ============================================================================
// LAYER 1: GOOGLE CLOUD VISION OCR
// ============================================================================

async function extractTextGeometry(imageBase64: string): Promise<{
  paragraphs: Paragraph[];
  imageWidth: number;
  imageHeight: number;
}> {
  const apiKey = Deno.env.get("GOOGLE_CLOUD_VISION_API_KEY");
  if (!apiKey) {
    throw new Error("GOOGLE_CLOUD_VISION_API_KEY not configured");
  }

  console.log("Layer 1: Calling Google Cloud Vision OCR...");
  
  const response = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [{
          image: { content: imageBase64 },
          features: [{ type: "DOCUMENT_TEXT_DETECTION" }]
        }]
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Vision API error:", errorText);
    throw new Error(`Vision API error: ${response.status}`);
  }

  const data = await response.json();
  const annotation = data.responses?.[0]?.fullTextAnnotation;
  
  if (!annotation) {
    console.log("No text detected in image");
    return { paragraphs: [], imageWidth: 0, imageHeight: 0 };
  }

  let maxX = 0, maxY = 0;
  const paragraphs: Paragraph[] = [];
  
  for (const page of annotation.pages || []) {
    for (const block of page.blocks || []) {
      for (const paragraph of block.paragraphs || []) {
        const vertices = paragraph.boundingBox?.vertices || [];
        if (vertices.length < 4) continue;
        
        const xCoords = vertices.map((v: any) => v.x || 0);
        const yCoords = vertices.map((v: any) => v.y || 0);
        
        const xLeft = Math.min(...xCoords);
        const xRight = Math.max(...xCoords);
        const yTop = Math.min(...yCoords);
        const yBottom = Math.max(...yCoords);
        
        maxX = Math.max(maxX, xRight);
        maxY = Math.max(maxY, yBottom);
        
        let text = '';
        for (const word of paragraph.words || []) {
          for (const symbol of word.symbols || []) {
            text += symbol.text || '';
          }
          text += ' ';
        }
        
        paragraphs.push({
          text: text.trim(),
          yTop,
          yBottom,
          xLeft,
          xRight,
          confidence: paragraph.confidence || 0.9,
          height: yBottom - yTop,
          width: xRight - xLeft
        });
      }
    }
  }

  console.log(`  → Extracted ${paragraphs.length} paragraphs`);
  
  return {
    paragraphs,
    imageWidth: maxX,
    imageHeight: maxY
  };
}

// ============================================================================
// LAYER 2: GOOGLE CLOUD VISION OBJECT LOCALIZATION
// ============================================================================

async function detectObjects(
  imageBase64: string,
  imageHeight: number,
  imageWidth: number
): Promise<DetectedObject[]> {
  const apiKey = Deno.env.get("GOOGLE_CLOUD_VISION_API_KEY");
  if (!apiKey) {
    console.log("  → Skipping object detection (no API key)");
    return [];
  }

  console.log("Layer 2: Detecting objects...");
  
  const response = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [{
          image: { content: imageBase64 },
          features: [{ type: "OBJECT_LOCALIZATION", maxResults: 50 }]
        }]
      })
    }
  );

  if (!response.ok) {
    console.error("Object localization API error:", await response.text());
    return [];
  }

  const data = await response.json();
  const annotations = data.responses?.[0]?.localizedObjectAnnotations || [];
  
  const objects = annotations.map((obj: any) => {
    const vertices = obj.boundingPoly?.normalizedVertices || [];
    const yCoords = vertices.map((v: any) => (v.y || 0) * imageHeight);
    const xCoords = vertices.map((v: any) => (v.x || 0) * imageWidth);
    
    return {
      name: obj.name,
      score: obj.score,
      yTop: Math.min(...yCoords),
      yBottom: Math.max(...yCoords),
      xLeft: Math.min(...xCoords),
      xRight: Math.max(...xCoords)
    };
  });

  console.log(`  → Detected ${objects.length} objects`);
  return objects;
}

// ============================================================================
// LAYER 3: GOOGLE CLOUD VISION LOGO DETECTION
// ============================================================================

async function detectLogos(
  imageBase64: string,
  imageHeight: number,
  imageWidth: number
): Promise<DetectedLogo[]> {
  const apiKey = Deno.env.get("GOOGLE_CLOUD_VISION_API_KEY");
  if (!apiKey) {
    console.log("  → Skipping logo detection (no API key)");
    return [];
  }

  console.log("Layer 3: Detecting logos...");
  
  const response = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [{
          image: { content: imageBase64 },
          features: [{ type: "LOGO_DETECTION", maxResults: 10 }]
        }]
      })
    }
  );

  if (!response.ok) {
    console.error("Logo detection API error:", await response.text());
    return [];
  }

  const data = await response.json();
  const logoAnnotations = data.responses?.[0]?.logoAnnotations || [];
  
  const logos = logoAnnotations.map((logo: any) => {
    const vertices = logo.boundingPoly?.vertices || [];
    const yCoords = vertices.map((v: any) => v.y || 0);
    const xCoords = vertices.map((v: any) => v.x || 0);
    
    return {
      description: logo.description,
      score: logo.score,
      yTop: Math.min(...yCoords),
      yBottom: Math.max(...yCoords),
      xLeft: Math.min(...xCoords),
      xRight: Math.max(...xCoords)
    };
  });

  console.log(`  → Detected ${logos.length} logos`);
  return logos;
}

// ============================================================================
// LAYER 4: FORBIDDEN BANDS COMPUTATION
// ============================================================================

function computeForbiddenBands(
  paragraphs: Paragraph[],
  objects: DetectedObject[],
  logos: DetectedLogo[],
  padding: number = 4
): ForbiddenBand[] {
  console.log("Layer 4: Computing forbidden bands...");
  
  // Combine all elements that should not be cut through
  const allElements = [
    ...paragraphs.map(p => ({ yTop: p.yTop, yBottom: p.yBottom })),
    ...objects.map(o => ({ yTop: o.yTop, yBottom: o.yBottom })),
    ...logos.map(l => ({ yTop: l.yTop, yBottom: l.yBottom }))
  ];
  
  if (allElements.length === 0) return [];
  
  // Create padded intervals
  const intervals: ForbiddenBand[] = allElements.map(e => ({
    yTop: Math.max(0, e.yTop - padding),
    yBottom: e.yBottom + padding
  }));
  
  // Sort by yTop
  intervals.sort((a, b) => a.yTop - b.yTop);
  
  // Merge overlapping intervals
  const merged: ForbiddenBand[] = [];
  let current = intervals[0];
  
  for (let i = 1; i < intervals.length; i++) {
    if (intervals[i].yTop <= current.yBottom) {
      current.yBottom = Math.max(current.yBottom, intervals[i].yBottom);
    } else {
      merged.push(current);
      current = intervals[i];
    }
  }
  merged.push(current);
  
  console.log(`  → Computed ${merged.length} forbidden bands`);
  return merged;
}

// ============================================================================
// LAYER 5: GAP ANALYSIS
// ============================================================================

function computeSignificantGaps(
  paragraphs: Paragraph[],
  objects: DetectedObject[],
  logos: DetectedLogo[],
  imageHeight: number,
  minGapSize: number = 20
): SignificantGap[] {
  console.log("Layer 5: Analyzing gaps...");
  
  // Combine all elements and sort by yTop
  const elements: { yTop: number; yBottom: number; type: string }[] = [
    ...paragraphs.map(p => ({ yTop: p.yTop, yBottom: p.yBottom, type: 'text' })),
    ...objects.map(o => ({ yTop: o.yTop, yBottom: o.yBottom, type: o.name })),
    ...logos.map(l => ({ yTop: l.yTop, yBottom: l.yBottom, type: 'logo' }))
  ].sort((a, b) => a.yTop - b.yTop);

  if (elements.length === 0) {
    console.log(`  → No elements to analyze`);
    return [];
  }

  const gaps: SignificantGap[] = [];
  
  // Check gap from top of image to first element
  if (elements[0].yTop > minGapSize) {
    gaps.push({
      yPosition: elements[0].yTop / 2,
      gapSize: elements[0].yTop,
      aboveElement: 'image_start',
      belowElement: elements[0].type
    });
  }
  
  // Check gaps between elements
  for (let i = 0; i < elements.length - 1; i++) {
    const current = elements[i];
    const next = elements[i + 1];
    const gapSize = next.yTop - current.yBottom;
    
    if (gapSize >= minGapSize) {
      gaps.push({
        yPosition: Math.round(current.yBottom + gapSize / 2),
        gapSize: Math.round(gapSize),
        aboveElement: current.type,
        belowElement: next.type
      });
    }
  }
  
  // Check gap from last element to bottom
  const lastElement = elements[elements.length - 1];
  if (imageHeight - lastElement.yBottom > minGapSize) {
    gaps.push({
      yPosition: Math.round(lastElement.yBottom + (imageHeight - lastElement.yBottom) / 2),
      gapSize: Math.round(imageHeight - lastElement.yBottom),
      aboveElement: lastElement.type,
      belowElement: 'image_end'
    });
  }

  console.log(`  → Found ${gaps.length} significant gaps (≥${minGapSize}px)`);
  return gaps;
}

// ============================================================================
// LAYER 6: FOOTER DETECTION
// ============================================================================

function detectFooter(
  paragraphs: Paragraph[],
  objects: DetectedObject[],
  imageHeight: number
): FooterDetection {
  console.log("Layer 6: Detecting footer...");
  
  const bottomThreshold = imageHeight * 0.6;
  const bottomParagraphs = paragraphs.filter(p => p.yTop >= bottomThreshold);
  
  // Footer text patterns
  const footerPatterns = [
    /unsubscribe/i,
    /privacy\s*policy/i,
    /terms\s*(of\s*service|and\s*conditions)?/i,
    /\bfaq\b/i,
    /contact\s*us/i,
    /customer\s*service/i,
    /follow\s*us/i,
    /copyright|©|\(c\)/i,
    /all\s*rights\s*reserved/i,
    /statements?\s*(have\s*)?not\s*(been\s*)?evaluated/i,
    /\d{5}(-\d{4})?/, // ZIP code
    /\b[A-Z]{2}\s*\d{5}\b/, // State ZIP
  ];
  
  let footerStartY = imageHeight;
  let confidence: 'high' | 'medium' | 'low' = 'low';
  let matchCount = 0;
  
  const sortedBottom = [...bottomParagraphs].sort((a, b) => a.yTop - b.yTop);
  
  for (const para of sortedBottom) {
    const text = para.text.toLowerCase();
    const isFooterLike = footerPatterns.some(p => p.test(text));
    
    if (isFooterLike) {
      matchCount++;
      if (para.yTop < footerStartY) {
        footerStartY = para.yTop;
      }
    }
  }
  
  // Check for dense small text blocks (footer characteristic)
  const denseSmallBlocks = bottomParagraphs.filter(p => 
    p.height < 30 && p.text.length > 10
  );
  
  if (denseSmallBlocks.length >= 3) {
    const earliestDense = Math.min(...denseSmallBlocks.map(p => p.yTop));
    if (earliestDense < footerStartY) {
      footerStartY = earliestDense;
      matchCount++;
    }
  }
  
  // Determine confidence
  if (matchCount >= 3) {
    confidence = 'high';
  } else if (matchCount >= 1) {
    confidence = 'medium';
  } else {
    footerStartY = Math.floor(imageHeight * 0.95);
    confidence = 'low';
  }
  
  console.log(`  → Footer at y=${footerStartY} (${confidence} confidence, ${matchCount} matches)`);
  
  return { footerStartY, confidence };
}

// ============================================================================
// LAYER 7: CLAUDE OPUS 4.5 SEMANTIC SECTIONING
// ============================================================================

async function claudeSemanticSectioning(
  imageBase64: string,
  mimeType: string,
  preprocessingData: PreprocessingData
): Promise<{ boundaries: number[]; sections: { name: string; yTop: number; yBottom: number }[] }> {
  
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  console.log("Layer 7: Claude Opus 4.5 semantic analysis...");
  
  // Prepare simplified data for the prompt
  const simplifiedParagraphs = preprocessingData.paragraphs.map(p => ({
    text: p.text.substring(0, 100),
    yTop: Math.round(p.yTop),
    yBottom: Math.round(p.yBottom),
    height: Math.round(p.height)
  }));
  
  const simplifiedObjects = preprocessingData.objects.map(o => ({
    name: o.name,
    yTop: Math.round(o.yTop),
    yBottom: Math.round(o.yBottom),
    score: Math.round(o.score * 100) / 100
  }));
  
  const simplifiedGaps = preprocessingData.significantGaps.map(g => ({
    yPosition: g.yPosition,
    gapSize: g.gapSize,
    between: `${g.aboveElement} → ${g.belowElement}`
  }));

  const prompt = `You are analyzing an email design to determine where to slice it into semantic sections.

## Your Task
Look at this email image and identify the Y-pixel coordinates where horizontal slice boundaries should be placed. Each slice should contain a complete, self-contained semantic unit.

## Preprocessing Data (to assist with precise positioning)

### Image Dimensions
${preprocessingData.imageWidth}x${preprocessingData.imageHeight} pixels

### Detected Text Blocks (OCR)
These are text regions with bounding boxes. You MUST NOT place cuts within these zones:
${JSON.stringify(simplifiedParagraphs.slice(0, 60), null, 2)}

### Forbidden Bands (DO NOT CUT HERE)
These Y-ranges contain content that would be bisected:
${JSON.stringify(preprocessingData.forbiddenBands.slice(0, 40), null, 2)}

### Detected Objects (images, products, UI elements)
${JSON.stringify(simplifiedObjects, null, 2)}

### Detected Logos
${JSON.stringify(preprocessingData.logos.map(l => ({ name: l.description, yTop: Math.round(l.yTop), yBottom: Math.round(l.yBottom) })), null, 2)}

### Significant Vertical Gaps (likely section boundaries)
These are large gaps between elements - good candidate positions for cuts:
${JSON.stringify(simplifiedGaps, null, 2)}

### Footer Detection
Footer appears to start at Y=${preprocessingData.footerStartY} (confidence: ${preprocessingData.footerConfidence})
Do not include any slices below this point.

## What Makes a Good Semantic Section
- **Header/Logo area**: Usually one slice at the top
- **Hero section**: Headline + subheadline + hero image + primary CTA (keep together as ONE slice)
- **Product modules**: Each product with its image, name, price, button (ONE slice per product OR one slice for the entire grid)
- **Feature blocks**: Icon + headline + description (keep together)
- **Testimonials**: Quote + attribution (keep together)
- **Secondary CTAs**: Button with surrounding context
- **Footer**: Everything below footerStartY (excluded from slices)

## Critical Rules
1. LOOK AT THE IMAGE to understand the visual layout
2. Use the preprocessing data to get PRECISE pixel coordinates
3. Place cuts in the GAPS, not through content
4. Keep semantically related content TOGETHER
5. Every slice should make sense as a standalone unit

## Output Format
Return ONLY a JSON object:
{
  "sections": [
    { "name": "header", "yTop": 0, "yBottom": 120 },
    { "name": "hero", "yTop": 120, "yBottom": 480 },
    { "name": "products", "yTop": 480, "yBottom": 920 },
    { "name": "cta", "yTop": 920, "yBottom": 1050 }
  ]
}

Rules for sections:
- First section must start at yTop: 0
- Last section must end at yBottom ≤ ${preprocessingData.footerStartY}
- Sections should NOT overlap
- Each yBottom should equal the next section's yTop`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5-20250514",
      max_tokens: 4096,
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mimeType,
              data: imageBase64
            }
          },
          {
            type: "text",
            text: prompt
          }
        ]
      }]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Claude API error:", errorText);
    throw new Error(`Claude API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.content?.[0]?.text || '';
  
  console.log("  → Claude response received");
  
  // Parse JSON from response
  let jsonStr = content;
  if (content.includes("```json")) {
    jsonStr = content.split("```json")[1].split("```")[0];
  } else if (content.includes("```")) {
    jsonStr = content.split("```")[1].split("```")[0];
  } else {
    // Try to find JSON object directly
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }
  }
  
  try {
    const parsed = JSON.parse(jsonStr.trim());
    const sections = parsed.sections || [];
    
    // Convert sections to boundaries
    const boundaries = [0];
    for (const section of sections) {
      if (section.yBottom && !boundaries.includes(section.yBottom)) {
        boundaries.push(section.yBottom);
      }
    }
    
    // Ensure footerStartY is respected
    const filteredBoundaries = boundaries.filter(b => b <= preprocessingData.footerStartY);
    if (filteredBoundaries[filteredBoundaries.length - 1] !== preprocessingData.footerStartY) {
      filteredBoundaries.push(preprocessingData.footerStartY);
    }
    
    console.log(`  → Claude identified ${sections.length} sections`);
    
    return { boundaries: filteredBoundaries, sections };
  } catch (e) {
    console.error("Failed to parse Claude response:", e);
    console.error("Raw content:", content);
    
    // Fallback: use significant gaps
    const boundaries = [0];
    for (const gap of preprocessingData.significantGaps) {
      if (gap.yPosition < preprocessingData.footerStartY && gap.gapSize >= 40) {
        boundaries.push(gap.yPosition);
      }
    }
    boundaries.push(preprocessingData.footerStartY);
    
    console.log(`  → Using fallback: ${boundaries.length - 1} slices from gap analysis`);
    
    return { boundaries, sections: [] };
  }
}

// ============================================================================
// LAYER 8: POST-PROCESSING AND VALIDATION
// ============================================================================

function postProcess(
  boundaries: number[],
  footerStartY: number,
  forbiddenBands: ForbiddenBand[]
): { footerStartY: number; slices: SliceOutput[] } {
  
  console.log("Layer 8: Post-processing...");
  
  // 1. Sort and deduplicate
  let processed = [...new Set(boundaries)].sort((a, b) => a - b);
  
  // 2. Ensure first boundary is 0
  if (processed[0] !== 0) {
    processed = [0, ...processed];
  }
  
  // 3. Ensure last boundary doesn't exceed footerStartY
  processed = processed.filter(b => b <= footerStartY);
  if (processed[processed.length - 1] !== footerStartY) {
    processed.push(footerStartY);
  }
  
  // 4. Snap boundaries that fall in forbidden bands to nearest edge
  const snapped: number[] = [];
  for (const boundary of processed) {
    let foundInBand: ForbiddenBand | null = null;
    
    for (const band of forbiddenBands) {
      if (boundary > band.yTop && boundary < band.yBottom) {
        foundInBand = band;
        break;
      }
    }
    
    if (foundInBand) {
      // Snap to the closest edge of the forbidden band
      const distToTop = boundary - foundInBand.yTop;
      const distToBottom = foundInBand.yBottom - boundary;
      const snappedValue = distToTop <= distToBottom ? foundInBand.yTop : foundInBand.yBottom;
      
      if (!snapped.includes(snappedValue)) {
        snapped.push(snappedValue);
      }
    } else {
      snapped.push(boundary);
    }
  }
  
  // 5. Sort and deduplicate again
  const final = [...new Set(snapped)].sort((a, b) => a - b);
  
  // 6. Convert to slices
  const slices: SliceOutput[] = [];
  for (let i = 0; i < final.length - 1; i++) {
    slices.push({
      yTop: Math.round(final[i]),
      yBottom: Math.round(final[i + 1])
    });
  }
  
  console.log(`  → Final output: ${slices.length} slices`);
  
  return { footerStartY, slices };
}

// ============================================================================
// UTILITY: IMAGE DIMENSION EXTRACTION
// ============================================================================

async function getImageDimensions(imageBase64: string): Promise<{ width: number; height: number }> {
  const binaryStr = atob(imageBase64.substring(0, 100));
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  
  // PNG
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
    const width = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
    const height = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
    return { width, height };
  }
  
  // JPEG fallback
  return { width: 600, height: 2000 };
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const { imageDataUrl } = await req.json();
    
    if (!imageDataUrl) {
      throw new Error("imageDataUrl is required");
    }

    // Parse the data URL
    const match = imageDataUrl.match(/^data:(image\/[a-z]+);base64,(.+)$/i);
    if (!match) {
      throw new Error("Invalid image data URL format");
    }
    
    const mimeType = match[1];
    const imageBase64 = match[2];
    console.log(`\n========== AUTO-SLICE V2 ==========`);
    console.log(`Received image: ${mimeType}, base64 length: ${imageBase64.length}`);

    // Get initial dimensions from image header
    let { width: imageWidth, height: imageHeight } = await getImageDimensions(imageBase64);
    console.log(`Initial dimensions: ${imageWidth}x${imageHeight}`);

    // ========== LAYER 1: OCR ==========
    const { paragraphs, imageWidth: ocrWidth, imageHeight: ocrHeight } = await extractTextGeometry(imageBase64);
    
    // Use OCR dimensions if available (more accurate)
    if (ocrWidth > 0) imageWidth = ocrWidth;
    if (ocrHeight > 0) imageHeight = ocrHeight;
    console.log(`Final dimensions: ${imageWidth}x${imageHeight}`);

    // ========== LAYER 2: Object Localization ==========
    const objects = await detectObjects(imageBase64, imageHeight, imageWidth);

    // ========== LAYER 3: Logo Detection ==========
    const logos = await detectLogos(imageBase64, imageHeight, imageWidth);

    // ========== LAYER 4: Forbidden Bands ==========
    const forbiddenBands = computeForbiddenBands(paragraphs, objects, logos, 4);

    // ========== LAYER 5: Gap Analysis ==========
    const significantGaps = computeSignificantGaps(paragraphs, objects, logos, imageHeight);

    // ========== LAYER 6: Footer Detection ==========
    const footerDetection = detectFooter(paragraphs, objects, imageHeight);

    // ========== LAYER 7: Claude Semantic Sectioning ==========
    const preprocessingData: PreprocessingData = {
      paragraphs,
      objects,
      logos,
      forbiddenBands,
      significantGaps,
      footerStartY: footerDetection.footerStartY,
      footerConfidence: footerDetection.confidence,
      imageWidth,
      imageHeight
    };
    
    const claudeResult = await claudeSemanticSectioning(imageBase64, mimeType, preprocessingData);

    // ========== LAYER 8: Post-Processing ==========
    const result = postProcess(
      claudeResult.boundaries,
      footerDetection.footerStartY,
      forbiddenBands
    );

    const processingTimeMs = Date.now() - startTime;

    const response: AutoSliceV2Response = {
      success: true,
      footerStartY: result.footerStartY,
      slices: result.slices,
      imageHeight,
      imageWidth,
      processingTimeMs,
      confidence: {
        footer: footerDetection.confidence,
        overall: paragraphs.length > 5 ? 'high' : paragraphs.length > 0 ? 'medium' : 'low'
      },
      debug: {
        paragraphCount: paragraphs.length,
        objectCount: objects.length,
        logoCount: logos.length,
        gapCount: significantGaps.length,
        forbiddenBandCount: forbiddenBands.length,
        claudeBoundaries: claudeResult.boundaries
      }
    };

    console.log(`\n========== COMPLETE ==========`);
    console.log(`${result.slices.length} slices in ${processingTimeMs}ms`);

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });

  } catch (error: unknown) {
    console.error("Auto-slice v2 error:", error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    const response: AutoSliceV2Response = {
      success: false,
      error: errorMessage,
      footerStartY: 0,
      slices: [],
      imageHeight: 0,
      imageWidth: 0,
      processingTimeMs: Date.now() - startTime,
      confidence: {
        footer: 'low',
        overall: 'low'
      }
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
});
