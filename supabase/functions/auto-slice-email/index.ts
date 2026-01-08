import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// OmniParser V2 element format
interface OmniParserElement {
  bbox: [number, number, number, number]; // [x1, y1, x2, y2]
  content: string;
  type?: string;
}

interface OmniParserResult {
  parsed_content_list: OmniParserElement[];
  labeled_image?: string;
}

interface Section {
  type: string;
  columns: number;
  label: string;
  clickable: boolean;
}

interface SemanticAnalysis {
  totalSections: number;
  sections: Section[];
}

interface AutoDetectedSlice {
  id: string;
  yStartPercent: number;
  yEndPercent: number;
  type: string;
  columns: number;
  label: string;
  clickable: boolean;
  columnBounds?: { xStartPercent: number; xEndPercent: number }[];
}

interface AutoSliceResponse {
  success: boolean;
  slices: AutoDetectedSlice[];
  metadata: {
    imageWidth: number;
    imageHeight: number;
    omniParserElementCount: number;
    processingTimeMs: number;
  };
  error?: string;
}

// Parse OmniParser V2's Python-formatted element string into a JS array
function parseOmniParserElementsString(elementsString: string): OmniParserElement[] {
  const elements: OmniParserElement[] = [];
  
  // Split by "icon N: " pattern to get individual element strings
  const parts = elementsString.split(/icon \d+:\s*/).filter(Boolean);
  
  for (const part of parts) {
    try {
      // Convert Python dict syntax to JSON:
      // - Single quotes 'key' -> double quotes "key"
      // - True/False -> true/false
      let jsonStr = part.trim();
      jsonStr = jsonStr.replace(/'/g, '"');
      jsonStr = jsonStr.replace(/True/g, 'true');
      jsonStr = jsonStr.replace(/False/g, 'false');
      
      const parsed = JSON.parse(jsonStr);
      if (parsed.bbox && Array.isArray(parsed.bbox) && parsed.bbox.length === 4) {
        elements.push({
          bbox: parsed.bbox as [number, number, number, number],
          content: parsed.content || '',
          type: parsed.type || 'unknown'
        });
      }
    } catch (e) {
      // Skip malformed elements silently
    }
  }
  
  return elements;
}

// Detect elements using Microsoft OmniParser V2 via Replicate
async function detectElementsWithOmniParser(imageDataUrl: string): Promise<OmniParserResult> {
  const replicateToken = Deno.env.get('REPLICATE_API_TOKEN');
  
  if (!replicateToken) {
    throw new Error('REPLICATE_API_TOKEN not configured');
  }
  
  console.log('Calling OmniParser V2 via Replicate...');
  
  // Use POST /v1/predictions with explicit version hash (from user's working example)
  const response = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      "Authorization": `Token ${replicateToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      version: "49cf3d41b8d3aca1360514e83be4c97131ce8f0d99abfc365526d8384caa88df",
      input: {
        image: imageDataUrl
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Replicate API error (${response.status}):`, errorText.substring(0, 500));
    throw new Error(`Replicate API error (${response.status}): ${errorText.substring(0, 200)}`);
  }

  const prediction = await response.json();
  console.log('OmniParser prediction created:', prediction.id, 'status:', prediction.status);
  
  // Poll for completion (~4-10 seconds typical)
  let result = prediction;
  let attempts = 0;
  const maxAttempts = 90; // 90 seconds max
  
  while (result.status !== "succeeded" && result.status !== "failed" && attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    attempts++;
    
    const pollResponse = await fetch(prediction.urls.get, {
      headers: {
        "Authorization": `Token ${replicateToken}`
      }
    });
    
    if (!pollResponse.ok) {
      console.error(`Poll failed (${pollResponse.status})`);
      continue;
    }
    
    result = await pollResponse.json();
    if (attempts % 5 === 0) {
      console.log(`OmniParser poll attempt ${attempts}: ${result.status}`);
    }
  }

  if (result.status === "failed") {
    console.error('OmniParser failed:', result.error);
    throw new Error(`OmniParser detection failed: ${result.error || 'Unknown error'}`);
  }
  
  if (result.status !== "succeeded") {
    throw new Error(`OmniParser timed out after ${attempts} seconds`);
  }

// Log output structure for debugging
  const outputKeys = result.output ? Object.keys(result.output) : [];
  console.log('OmniParser succeeded. Output keys:', outputKeys.join(', '));
  
  // OmniParser V2 returns { elements: "icon 0: {...}\nicon 1: {...}\n...", img: "..." }
  // The 'elements' field is a Python-formatted STRING, not an array!
  let parsedContentList: OmniParserElement[] = [];
  let labeledImage = null;
  
  if (result.output?.img) {
    labeledImage = result.output.img;
  }
  
  if (result.output?.elements && typeof result.output.elements === 'string') {
    // Parse the Python-style string format from OmniParser V2
    console.log('Parsing OmniParser elements string...');
    parsedContentList = parseOmniParserElementsString(result.output.elements);
    console.log(`Parsed ${parsedContentList.length} elements from string`);
  } else if (result.output?.parsed_content_list) {
    // Fallback for potential alternative format
    parsedContentList = result.output.parsed_content_list;
    labeledImage = result.output.labeled_image || labeledImage;
  } else if (Array.isArray(result.output)) {
    parsedContentList = result.output;
  }
  
  console.log(`OmniParser returned ${parsedContentList.length} elements`);
  
  if (parsedContentList.length === 0) {
    console.error('OmniParser output structure:', JSON.stringify(result.output).substring(0, 500));
    throw new Error('OmniParser returned no elements. Check logs for output structure.');
  }
  
  return {
    parsed_content_list: parsedContentList,
    labeled_image: labeledImage
  };
}

// Get semantic analysis from Claude Opus 4.5
async function getSemanticAnalysis(imageBase64: string): Promise<SemanticAnalysis> {
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  
  if (!anthropicKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }
  
  console.log('Calling Claude Opus 4.5 for semantic analysis...');
  
  // Extract base64 data and media type
  const match = imageBase64.match(/^data:image\/(png|jpeg|jpg|webp|gif);base64,(.+)$/);
  if (!match) {
    throw new Error('Invalid image data URL format');
  }
  
  const mediaType = match[1] === 'jpg' ? 'jpeg' : match[1];
  const base64Data = match[2];
  
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "claude-opus-4-5-20251101",
      max_tokens: 1500,
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: `image/${mediaType}`,
              data: base64Data
            }
          },
          {
            type: "text",
            text: `Analyze this email marketing image for slicing into separate image sections.

IMPORTANT: Do NOT provide any coordinates, percentages, pixel positions, or location estimates. I only need semantic information.

Tell me:

1. How many distinct horizontal sections should this email be sliced into? Count every section that should be a separate image slice, including:
   - Header/banner sections
   - Hero sections
   - Product sections
   - CTA (call-to-action) sections
   - Text blocks
   - Footer sections
   - Any dividers or separators that should be their own slice

2. For each section from TOP to BOTTOM, provide:
   - type: "promo_banner" | "header" | "hero" | "product_grid" | "cta_button" | "text_block" | "divider" | "footer" | "navigation"
   - columns: How many clickable columns? (1, 2, 3, or 4) — e.g., a 3-product grid = 3 columns
   - label: A brief descriptive label like "BOGO 50% off banner" or "Dual product showcase"
   - clickable: Is this section meant to be clickable? (true/false)

Return ONLY valid JSON in this exact format:
{
  "totalSections": 8,
  "sections": [
    { "type": "promo_banner", "columns": 1, "label": "BOGO 50% off banner", "clickable": true },
    { "type": "hero", "columns": 1, "label": "Main hero with CTA button", "clickable": true },
    { "type": "cta_button", "columns": 1, "label": "Shop Hydroglyph button", "clickable": true },
    { "type": "product_grid", "columns": 2, "label": "Dual product showcase", "clickable": true },
    { "type": "text_block", "columns": 1, "label": "Learn the protocol section", "clickable": false }
  ]
}`
          }
        ]
      }]
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Claude API error: ${error}`);
  }

  const data = await response.json();
  const content = data.content?.[0]?.text || '';
  
  console.log('Claude response:', content.substring(0, 200) + '...');
  
  // Parse JSON from response (handle potential markdown code blocks)
  let jsonStr = content;
  if (content.includes("```json")) {
    jsonStr = content.split("```json")[1].split("```")[0];
  } else if (content.includes("```")) {
    jsonStr = content.split("```")[1].split("```")[0];
  }
  
  const parsed = JSON.parse(jsonStr.trim());
  
  return {
    totalSections: parsed.totalSections || parsed.sections?.length || 1,
    sections: parsed.sections || []
  };
}

// Select best cut points from candidates
function selectBestCutPoints(
  candidates: number[], 
  numCuts: number, 
  imageHeight: number
): number[] {
  if (candidates.length === 0) {
    // Generate even distribution
    return Array.from({ length: numCuts }, (_, i) => 
      Math.round((imageHeight * (i + 1)) / (numCuts + 1))
    );
  }
  
  if (candidates.length <= numCuts) {
    return [...candidates].sort((a, b) => a - b);
  }
  
  // Select cuts that create the most evenly distributed sections
  const idealSpacing = imageHeight / (numCuts + 1);
  const selected: number[] = [];
  const used = new Set<number>();
  
  for (let i = 1; i <= numCuts; i++) {
    const targetY = idealSpacing * i;
    let closest = candidates[0];
    let closestDist = Math.abs(candidates[0] - targetY);
    
    for (const c of candidates) {
      if (used.has(c)) continue;
      const dist = Math.abs(c - targetY);
      if (dist < closestDist) {
        closest = c;
        closestDist = dist;
      }
    }
    
    if (!used.has(closest)) {
      selected.push(closest);
      used.add(closest);
    }
  }
  
  return selected.sort((a, b) => a - b);
}

// Calculate column bounds from OmniParser elements
function calculateColumnBounds(
  elements: OmniParserElement[],
  yStart: number,
  yEnd: number,
  columns: number,
  imageWidth: number
): { xStartPercent: number; xEndPercent: number }[] {
  // Find elements within this Y range
  const relevantElements = elements.filter(el => {
    const [, y1, , y2] = el.bbox;
    const elementMidY = (y1 + y2) / 2;
    return elementMidY >= yStart - 20 && elementMidY <= yEnd + 20;
  });

  if (relevantElements.length >= columns) {
    // Sort by X position
    const sortedByX = [...relevantElements].sort((a, b) => a.bbox[0] - b.bbox[0]);
    
    // Group elements into columns based on X position clustering
    const columnGroups: OmniParserElement[][] = [];
    let currentGroup: OmniParserElement[] = [];
    let lastX2 = -Infinity;
    
    for (const el of sortedByX) {
      const [x1, , x2] = el.bbox;
      // If there's a significant gap, start a new column
      if (x1 - lastX2 > 20) {
        if (currentGroup.length > 0) {
          columnGroups.push(currentGroup);
        }
        currentGroup = [el];
      } else {
        currentGroup.push(el);
      }
      lastX2 = x2;
    }
    if (currentGroup.length > 0) {
      columnGroups.push(currentGroup);
    }
    
    // If we have the right number of column groups, use their bounds
    if (columnGroups.length === columns) {
      return columnGroups.map(group => {
        const minX = Math.min(...group.map(el => el.bbox[0]));
        const maxX = Math.max(...group.map(el => el.bbox[2]));
        return { 
          xStartPercent: (minX / imageWidth) * 100, 
          xEndPercent: (maxX / imageWidth) * 100 
        };
      });
    }
  }
  
  // Fallback: divide evenly
  const colWidth = 100 / columns;
  return Array.from({ length: columns }, (_, i) => ({
    xStartPercent: colWidth * i,
    xEndPercent: colWidth * (i + 1)
  }));
}

// Main snapping logic: match OmniParser elements to Claude's sections
function snapOmniParserToSections(
  elements: OmniParserElement[],
  sections: Section[],
  imageWidth: number,
  imageHeight: number
): AutoDetectedSlice[] {
  // Extract unique Y-coordinates from OmniParser bounding boxes
  const yCoordinates: number[] = [];
  elements.forEach(el => {
    const [, y1, , y2] = el.bbox;
    yCoordinates.push(y1); // Top edge
    yCoordinates.push(y2); // Bottom edge
  });
  
  // Sort and deduplicate (within 15px tolerance)
  const sortedYs = [...new Set(yCoordinates)].sort((a, b) => a - b);
  const uniqueYs = sortedYs.filter((y, i, arr) => i === 0 || y - arr[i - 1] > 15);
  
  console.log(`Extracted ${uniqueYs.length} unique Y coordinates from ${elements.length} elements`);
  
  // We need (totalSections - 1) cut points
  const cutsNeeded = sections.length - 1;
  const cutPoints = selectBestCutPoints(uniqueYs, cutsNeeded, imageHeight);
  const boundaries = [0, ...cutPoints, imageHeight];
  
  console.log(`Cut points (px): ${cutPoints.join(', ')}`);
  
  // Map each section to its boundaries
  const finalSlices: AutoDetectedSlice[] = sections.map((section, index) => {
    const yStart = boundaries[index];
    const yEnd = boundaries[index + 1];
    
    const slice: AutoDetectedSlice = {
      id: `slice-${index}`,
      yStartPercent: Number(((yStart / imageHeight) * 100).toFixed(2)),
      yEndPercent: Number(((yEnd / imageHeight) * 100).toFixed(2)),
      type: section.type,
      columns: section.columns,
      label: section.label,
      clickable: section.clickable
    };
    
    // For multi-column sections, calculate column bounds
    if (section.columns > 1) {
      slice.columnBounds = calculateColumnBounds(
        elements, 
        yStart, 
        yEnd, 
        section.columns, 
        imageWidth
      );
    }
    
    return slice;
  });
  
  return finalSlices;
}

// Get image dimensions from base64
async function getImageDimensions(imageDataUrl: string): Promise<{ width: number; height: number }> {
  const match = imageDataUrl.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/);
  if (!match) {
    return { width: 600, height: 2000 };
  }
  
  const base64Data = match[2];
  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  const imageType = match[1];
  
  if (imageType === 'png') {
    // PNG dimensions are at bytes 16-23
    if (bytes.length > 24) {
      const width = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
      const height = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
      return { width, height };
    }
  } else {
    // JPEG: find SOF marker
    let offset = 2;
    while (offset < bytes.length) {
      if (bytes[offset] !== 0xFF) break;
      const marker = bytes[offset + 1];
      if (marker === 0xC0 || marker === 0xC2) {
        const height = (bytes[offset + 5] << 8) | bytes[offset + 6];
        const width = (bytes[offset + 7] << 8) | bytes[offset + 8];
        return { width, height };
      }
      const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
      offset += 2 + length;
    }
  }
  
  return { width: 600, height: 2000 };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const { imageDataUrl } = await req.json();
    
    if (!imageDataUrl) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          slices: [], 
          metadata: { imageWidth: 0, imageHeight: 0, omniParserElementCount: 0, processingTimeMs: 0 },
          error: 'imageDataUrl is required' 
        } as AutoSliceResponse),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Starting automatic slice detection with OmniParser V2 + Claude Opus 4.5...');

    // Get image dimensions
    const dimensions = await getImageDimensions(imageDataUrl);
    console.log(`Image dimensions: ${dimensions.width}x${dimensions.height}`);

    // Run OmniParser FIRST - fail fast if it doesn't work (don't waste Claude tokens)
    console.log('Step 1: Running OmniParser V2...');
    let omniParserResult: OmniParserResult;
    try {
      omniParserResult = await detectElementsWithOmniParser(imageDataUrl);
    } catch (omniError: unknown) {
      const errorMessage = omniError instanceof Error ? omniError.message : String(omniError);
      console.error('OmniParser failed:', errorMessage);
      // Return HTTP 200 with success:false so client can show the real error
      return new Response(
        JSON.stringify({
          success: false,
          slices: [],
          metadata: { imageWidth: dimensions.width, imageHeight: dimensions.height, omniParserElementCount: 0, processingTimeMs: Date.now() - startTime },
          error: `OmniParser failed: ${errorMessage}. Please use manual mode.`
        } as AutoSliceResponse),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const elementCount = omniParserResult.parsed_content_list.length;
    console.log(`OmniParser: ${elementCount} elements detected`);
    
    // Step 2: Now call Claude for semantic analysis
    console.log('Step 2: Running Claude semantic analysis...');
    let semanticAnalysis: SemanticAnalysis;
    try {
      semanticAnalysis = await getSemanticAnalysis(imageDataUrl);
    } catch (claudeError: unknown) {
      const errorMessage = claudeError instanceof Error ? claudeError.message : String(claudeError);
      console.error('Claude failed:', errorMessage);
      return new Response(
        JSON.stringify({
          success: false,
          slices: [],
          metadata: { imageWidth: dimensions.width, imageHeight: dimensions.height, omniParserElementCount: elementCount, processingTimeMs: Date.now() - startTime },
          error: `Claude analysis failed: ${errorMessage}. Please use manual mode.`
        } as AutoSliceResponse),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`Claude: ${semanticAnalysis.totalSections} sections identified`);

    // Snap OmniParser coordinates to Claude's sections
    const slices = snapOmniParserToSections(
      omniParserResult.parsed_content_list,
      semanticAnalysis.sections,
      dimensions.width,
      dimensions.height
    );

    const response: AutoSliceResponse = {
      success: true,
      slices,
      metadata: {
        imageWidth: dimensions.width,
        imageHeight: dimensions.height,
        omniParserElementCount: elementCount,
        processingTimeMs: Date.now() - startTime
      }
    };

    console.log(`Auto-slice complete in ${response.metadata.processingTimeMs}ms`);
    
    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Auto-slice error:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        slices: [],
        metadata: {
          imageWidth: 0,
          imageHeight: 0,
          omniParserElementCount: 0,
          processingTimeMs: Date.now() - startTime
        },
        error: error instanceof Error ? error.message : 'Unknown error'
      } as AutoSliceResponse),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
