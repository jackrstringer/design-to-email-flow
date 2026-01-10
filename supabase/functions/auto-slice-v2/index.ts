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

interface CandidateCutLine {
  y: number;
  strength: number;
  type: 'edge' | 'whitespace' | 'colorShift';
}

interface LowRiskCutBand {
  yTop: number;
  yBottom: number;
}

interface FooterDetection {
  footerStartY: number;
  confidence: 'high' | 'medium' | 'low';
}

interface SliceOutput {
  yTop: number;
  yBottom: number;
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
    forbiddenBandCount: number;
    candidateCutCount: number;
    llmBoundaries?: number[];
  };
}

// ============================================================================
// SECTION 2: GOOGLE CLOUD VISION OCR
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

  console.log("Calling Google Cloud Vision API...");
  
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

  // Get image dimensions from the first block's bounding box or infer from max coordinates
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
        
        // Extract text from words
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

  console.log(`Extracted ${paragraphs.length} paragraphs from OCR`);
  
  return {
    paragraphs,
    imageWidth: maxX,
    imageHeight: maxY
  };
}

// ============================================================================
// SECTION 3: FORBIDDEN BANDS COMPUTATION
// ============================================================================

function computeForbiddenBands(paragraphs: Paragraph[], padding: number = 4): ForbiddenBand[] {
  if (paragraphs.length === 0) return [];
  
  // Create padded intervals from paragraphs
  const intervals: ForbiddenBand[] = paragraphs.map(p => ({
    yTop: Math.max(0, p.yTop - padding),
    yBottom: p.yBottom + padding
  }));
  
  // Sort by yTop
  intervals.sort((a, b) => a.yTop - b.yTop);
  
  // Merge overlapping intervals
  const merged: ForbiddenBand[] = [];
  let current = intervals[0];
  
  for (let i = 1; i < intervals.length; i++) {
    if (intervals[i].yTop <= current.yBottom) {
      // Overlapping, extend current
      current.yBottom = Math.max(current.yBottom, intervals[i].yBottom);
    } else {
      // Non-overlapping, push current and start new
      merged.push(current);
      current = intervals[i];
    }
  }
  merged.push(current);
  
  console.log(`Computed ${merged.length} forbidden bands from ${paragraphs.length} paragraphs`);
  
  return merged;
}

// ============================================================================
// SECTION 4: VISUAL BOUNDARY ANALYSIS
// ============================================================================

async function analyzeVisualBoundaries(
  imageBase64: string,
  imageWidth: number,
  imageHeight: number
): Promise<{
  candidateCutLines: CandidateCutLine[];
  lowRiskCutBands: LowRiskCutBand[];
}> {
  // Decode base64 to get pixel data
  // For edge functions, we'll use a simplified approach based on row statistics
  // We can't use canvas in Deno, so we'll analyze the image structure
  
  console.log(`Analyzing visual boundaries for ${imageWidth}x${imageHeight} image`);
  
  // Since we can't directly analyze pixels in Deno without additional libraries,
  // we'll generate candidate cut lines based on regular intervals
  // and rely on the LLM + forbidden bands to filter
  
  const candidateCutLines: CandidateCutLine[] = [];
  const lowRiskCutBands: LowRiskCutBand[] = [];
  
  // Generate candidate cut lines every 10 pixels
  const step = 10;
  for (let y = step; y < imageHeight - step; y += step) {
    candidateCutLines.push({
      y,
      strength: 0.5, // Neutral strength since we can't analyze pixels
      type: 'whitespace'
    });
  }
  
  // Generate low-risk bands at regular intervals (gaps between candidates)
  for (let y = 0; y < imageHeight - step; y += step * 5) {
    lowRiskCutBands.push({
      yTop: y,
      yBottom: Math.min(y + step, imageHeight)
    });
  }
  
  console.log(`Generated ${candidateCutLines.length} candidate cut lines`);
  
  return { candidateCutLines, lowRiskCutBands };
}

// ============================================================================
// SECTION 5: FOOTER DETECTION
// ============================================================================

function detectFooter(
  paragraphs: Paragraph[],
  imageHeight: number,
  candidateCutLines: CandidateCutLine[]
): FooterDetection {
  // Footer detection heuristics
  // Look for common footer patterns in the bottom 40% of the image
  
  const bottomThreshold = imageHeight * 0.6;
  const bottomParagraphs = paragraphs.filter(p => p.yTop >= bottomThreshold);
  
  // Footer text patterns (brand-agnostic)
  const footerPatterns = [
    /unsubscribe/i,
    /privacy\s*policy/i,
    /terms\s*(of\s*service|and\s*conditions)?/i,
    /\bfaq\b/i,
    /contact\s*us/i,
    /customer\s*service/i,
    /\bshop\b/i,
    /our\s*story/i,
    /follow\s*us/i,
    /copyright|©|\(c\)/i,
    /all\s*rights\s*reserved/i,
    /statements?\s*(have\s*)?not\s*(been\s*)?evaluated/i,
    /\d{5}(-\d{4})?/, // ZIP code pattern
    /\b[A-Z]{2}\s*\d{5}\b/, // State ZIP pattern
  ];
  
  let footerStartY = imageHeight;
  let confidence: 'high' | 'medium' | 'low' = 'low';
  let matchCount = 0;
  
  // Check each paragraph from bottom up
  const sortedBottom = [...bottomParagraphs].sort((a, b) => a.yTop - b.yTop);
  
  for (const para of sortedBottom) {
    const text = para.text.toLowerCase();
    const isFooterLike = footerPatterns.some(p => p.test(text));
    
    if (isFooterLike) {
      matchCount++;
      // Take the earliest footer-like paragraph as the start
      if (para.yTop < footerStartY) {
        footerStartY = para.yTop;
      }
    }
  }
  
  // Also check for dense small text blocks (footer characteristic)
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
    // No clear footer detected, use 95% of image height as fallback
    footerStartY = Math.floor(imageHeight * 0.95);
    confidence = 'low';
  }
  
  // Snap to nearest candidate cut line
  const nearestCut = candidateCutLines.reduce((best, line) => {
    const dist = Math.abs(line.y - footerStartY);
    const bestDist = Math.abs(best.y - footerStartY);
    return dist < bestDist ? line : best;
  }, candidateCutLines[0] || { y: footerStartY });
  
  if (nearestCut) {
    footerStartY = nearestCut.y;
  }
  
  console.log(`Footer detected at y=${footerStartY} with ${confidence} confidence (${matchCount} matches)`);
  
  return { footerStartY, confidence };
}

// ============================================================================
// SECTION 6: LLM SECTIONING (Lovable AI)
// ============================================================================

async function llmSectioning(
  imageWidth: number,
  imageHeight: number,
  footerStartY: number,
  paragraphs: Paragraph[],
  forbiddenBands: ForbiddenBand[],
  candidateCutLines: CandidateCutLine[],
  lowRiskCutBands: LowRiskCutBand[]
): Promise<{ footerStartY: number; boundaries: number[] }> {
  
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) {
    throw new Error("LOVABLE_API_KEY not configured");
  }
  
  // Limit data sent to LLM to avoid token limits
  const topCandidates = candidateCutLines
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 200);
  
  const simplifiedParagraphs = paragraphs.map(p => ({
    text: p.text.substring(0, 100), // Truncate long text
    yTop: p.yTop,
    yBottom: p.yBottom,
    height: p.height
  }));
  
  const prompt = `You are analyzing an email design to determine optimal slice boundaries for image slicing.

## Your Task
Select cut boundaries that produce semantically coherent slices. You must ONLY choose from the provided valid cut positions.

## Constraints
- You MUST select boundaries from candidateCutLines y-values OR any y within lowRiskCutBands
- You MUST NOT place any boundary within forbiddenBands (these contain text that must not be cut)
- First boundary is always 0
- Last boundary is always footerStartY (${footerStartY})

## Slicing Principles
- Primary goal: produce slices corresponding to coherent content units
- Separate functional units when visually distinct (logo area, headline, CTA, product grid)
- Headings should stay with the copy they introduce
- CTAs/buttons should be separate from long copy if clearly separated
- Avoid micro-slices (< 50px) unless they improve semantic clarity
- Be consistent: repeating patterns should yield consistent slicing
- Most emails have 3-12 major sections

## Input Data
- Image dimensions: ${imageWidth}x${imageHeight}
- Footer starts at: ${footerStartY}
- Paragraphs (text boxes with positions):
${JSON.stringify(simplifiedParagraphs, null, 2)}

- Forbidden bands (DO NOT cut within these y-ranges):
${JSON.stringify(forbiddenBands, null, 2)}

- Candidate cut lines (y positions you CAN use):
${JSON.stringify(topCandidates.map(c => c.y), null, 2)}

- Low risk cut bands (safe y-ranges to cut within):
${JSON.stringify(lowRiskCutBands, null, 2)}

## Output
Return ONLY a JSON object with no additional text:
{
  "footerStartY": ${footerStartY},
  "boundaries": [0, ..., ${footerStartY}]
}`;

  console.log("Calling LLM for semantic sectioning...");
  
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: "You are an expert at analyzing email layouts and determining optimal slice boundaries. Always respond with valid JSON only." },
        { role: "user", content: prompt }
      ],
      temperature: 0.3 // Lower temperature for more consistent outputs
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("LLM API error:", errorText);
    throw new Error(`LLM API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  console.log("LLM response:", content);
  
  // Parse JSON from response
  let jsonStr = content;
  if (content.includes("```json")) {
    jsonStr = content.split("```json")[1].split("```")[0];
  } else if (content.includes("```")) {
    jsonStr = content.split("```")[1].split("```")[0];
  }
  
  try {
    const parsed = JSON.parse(jsonStr.trim());
    return {
      footerStartY: parsed.footerStartY || footerStartY,
      boundaries: parsed.boundaries || [0, footerStartY]
    };
  } catch (e) {
    console.error("Failed to parse LLM response:", e);
    // Fallback: simple even distribution
    const numSlices = 5;
    const step = Math.floor(footerStartY / numSlices);
    const boundaries = [0];
    for (let i = 1; i < numSlices; i++) {
      boundaries.push(i * step);
    }
    boundaries.push(footerStartY);
    return { footerStartY, boundaries };
  }
}

// ============================================================================
// SECTION 7: POST-PROCESSING AND VALIDATION
// ============================================================================

function postProcess(
  boundaries: number[],
  footerStartY: number,
  forbiddenBands: ForbiddenBand[],
  candidateCutLines: CandidateCutLine[],
  lowRiskCutBands: LowRiskCutBand[],
  minSliceHeight: number = 20
): { footerStartY: number; slices: SliceOutput[] } {
  
  // 1. Sort and deduplicate boundaries
  let processed = [...new Set(boundaries)].sort((a, b) => a - b);
  
  // 2. Ensure first boundary is 0
  if (processed[0] !== 0) {
    processed = [0, ...processed];
  }
  
  // 3. Ensure last boundary equals footerStartY
  if (processed[processed.length - 1] !== footerStartY) {
    // Remove any boundaries beyond footerStartY
    processed = processed.filter(b => b <= footerStartY);
    if (processed[processed.length - 1] !== footerStartY) {
      processed.push(footerStartY);
    }
  }
  
  // 4. Validate boundaries within [0, footerStartY]
  processed = processed.filter(b => b >= 0 && b <= footerStartY);
  
  // 5. Check no boundary falls inside forbidden bands, snap if needed
  const snapped: number[] = [];
  for (const boundary of processed) {
    let isInForbidden = false;
    for (const band of forbiddenBands) {
      if (boundary > band.yTop && boundary < band.yBottom) {
        isInForbidden = true;
        break;
      }
    }
    
    if (isInForbidden) {
      // Find nearest valid position
      const validCandidates = candidateCutLines.filter(c => {
        return !forbiddenBands.some(b => c.y > b.yTop && c.y < b.yBottom);
      });
      
      if (validCandidates.length > 0) {
        const nearest = validCandidates.reduce((best, curr) => 
          Math.abs(curr.y - boundary) < Math.abs(best.y - boundary) ? curr : best
        );
        snapped.push(nearest.y);
      }
      // If no valid candidate, skip this boundary
    } else {
      snapped.push(boundary);
    }
  }
  
  // 6. Remove duplicates after snapping and sort again
  let final = [...new Set(snapped)].sort((a, b) => a - b);
  
  // 7. Enforce minimum slice height
  const withMinHeight: number[] = [0];
  for (let i = 1; i < final.length; i++) {
    const gap = final[i] - withMinHeight[withMinHeight.length - 1];
    if (gap >= minSliceHeight) {
      withMinHeight.push(final[i]);
    }
  }
  
  // Ensure footer is included
  if (withMinHeight[withMinHeight.length - 1] !== footerStartY) {
    withMinHeight.push(footerStartY);
  }
  
  final = withMinHeight;
  
  // 8. Convert boundaries to slices
  const slices: SliceOutput[] = [];
  for (let i = 0; i < final.length - 1; i++) {
    slices.push({
      yTop: final[i],
      yBottom: final[i + 1]
    });
  }
  
  console.log(`Post-processed to ${slices.length} slices from ${boundaries.length} boundaries`);
  
  return { footerStartY, slices };
}

// ============================================================================
// SECTION 8: IMAGE DIMENSION EXTRACTION
// ============================================================================

async function getImageDimensions(imageBase64: string): Promise<{ width: number; height: number }> {
  // For PNG, dimensions are at fixed offsets in the header
  // PNG signature: 8 bytes
  // IHDR chunk: 4 bytes length + 4 bytes type + 4 bytes width + 4 bytes height
  
  const binaryStr = atob(imageBase64.substring(0, 100)); // Only need first ~50 bytes
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  
  // Check for PNG signature
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
    // PNG: width at bytes 16-19, height at bytes 20-23 (big-endian)
    const width = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
    const height = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
    return { width, height };
  }
  
  // Check for JPEG signature
  if (bytes[0] === 0xFF && bytes[1] === 0xD8) {
    // JPEG: need to parse markers to find SOF
    // This is complex, so we'll estimate from base64 length or use a fallback
    // For now, return placeholder - OCR will provide actual dimensions
    return { width: 600, height: 2000 }; // Fallback for JPEG
  }
  
  // Fallback
  return { width: 600, height: 2000 };
}

// ============================================================================
// SECTION 9: MAIN HANDLER
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
    
    const imageBase64 = match[2];
    console.log(`Received image, base64 length: ${imageBase64.length}`);

    // Step 1: Get image dimensions
    let { width: imageWidth, height: imageHeight } = await getImageDimensions(imageBase64);
    console.log(`Image dimensions: ${imageWidth}x${imageHeight}`);

    // Step 2: Extract text geometry (OCR)
    const { paragraphs, imageWidth: ocrWidth, imageHeight: ocrHeight } = await extractTextGeometry(imageBase64);
    
    // Use OCR dimensions if available (more accurate)
    if (ocrWidth > 0) imageWidth = ocrWidth;
    if (ocrHeight > 0) imageHeight = ocrHeight;
    console.log(`Using dimensions: ${imageWidth}x${imageHeight}`);

    // Step 3: Compute forbidden bands
    const forbiddenBands = computeForbiddenBands(paragraphs, 4);

    // Step 4: Analyze visual boundaries
    const { candidateCutLines, lowRiskCutBands } = await analyzeVisualBoundaries(
      imageBase64, imageWidth, imageHeight
    );

    // Step 5: Detect footer
    const footerDetection = detectFooter(paragraphs, imageHeight, candidateCutLines);

    // Step 6: LLM semantic sectioning
    const llmResult = await llmSectioning(
      imageWidth,
      imageHeight,
      footerDetection.footerStartY,
      paragraphs,
      forbiddenBands,
      candidateCutLines,
      lowRiskCutBands
    );

    // Step 7: Post-process and validate
    const result = postProcess(
      llmResult.boundaries,
      footerDetection.footerStartY,
      forbiddenBands,
      candidateCutLines,
      lowRiskCutBands
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
        forbiddenBandCount: forbiddenBands.length,
        candidateCutCount: candidateCutLines.length,
        llmBoundaries: llmResult.boundaries
      }
    };

    console.log(`Auto-slice v2 complete: ${result.slices.length} slices in ${processingTimeMs}ms`);

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
