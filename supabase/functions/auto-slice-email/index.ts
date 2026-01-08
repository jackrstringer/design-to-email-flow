import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BoundingBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label: string;
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
    groundingDinoBoxCount: number;
    processingTimeMs: number;
  };
  error?: string;
}

// Upload base64 image to Cloudinary and get URL for Replicate
async function uploadImageForReplicate(imageDataUrl: string): Promise<string> {
  const cloudName = Deno.env.get('CLOUDINARY_CLOUD_NAME');
  const apiKey = Deno.env.get('CLOUDINARY_API_KEY');
  const apiSecret = Deno.env.get('CLOUDINARY_API_SECRET');
  
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('Cloudinary credentials not configured');
  }
  
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = 'auto-slice-temp';
  
  // Create signature
  const signatureString = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(signatureString);
  const hashBuffer = await crypto.subtle.digest('SHA-1', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const signature = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  const formData = new FormData();
  formData.append('file', imageDataUrl);
  formData.append('api_key', apiKey);
  formData.append('timestamp', timestamp.toString());
  formData.append('signature', signature);
  formData.append('folder', folder);
  
  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: 'POST',
    body: formData,
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Cloudinary upload failed: ${error}`);
  }
  
  const result = await response.json();
  return result.secure_url;
}

// Detect element coordinates using Grounding DINO via Replicate
async function detectElementCoordinates(imageUrl: string): Promise<{ boxes: BoundingBox[]; width: number; height: number }> {
  const replicateToken = Deno.env.get('REPLICATE_API_TOKEN');
  
  if (!replicateToken) {
    throw new Error('REPLICATE_API_TOKEN not configured');
  }
  
  console.log('Calling Grounding DINO via Replicate...');
  
  // Create prediction
  const response = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      "Authorization": `Token ${replicateToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      version: "efd10a8ddc57ea28773327e881ce95e20cc1d734c589f7dd01d2036921ed78aa",
      input: {
        image: imageUrl,
        prompt: "horizontal divider. section boundary. header section. hero image. product image. call to action button. navigation menu. footer section. banner. text block.",
        box_threshold: 0.25,
        text_threshold: 0.25
      }
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Replicate API error: ${error}`);
  }

  const prediction = await response.json();
  console.log('Prediction created:', prediction.id);
  
  // Poll for completion
  let result = prediction;
  let attempts = 0;
  const maxAttempts = 60; // 60 seconds max
  
  while (result.status !== "succeeded" && result.status !== "failed" && attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    attempts++;
    
    const pollResponse = await fetch(prediction.urls.get, {
      headers: {
        "Authorization": `Token ${replicateToken}`
      }
    });
    result = await pollResponse.json();
    console.log(`Poll attempt ${attempts}: ${result.status}`);
  }

  if (result.status === "failed") {
    throw new Error(`Grounding DINO detection failed: ${result.error || 'Unknown error'}`);
  }
  
  if (result.status !== "succeeded") {
    throw new Error('Grounding DINO timed out');
  }

  // Parse output - Grounding DINO returns detections array
  const output = result.output;
  console.log('Grounding DINO output:', JSON.stringify(output));
  
  // The output format from this model is typically an annotated image URL
  // and detections are embedded. We need to parse the actual detection data.
  // Looking at the model, it returns: { detections: [...], image: "..." }
  // Each detection has: { bbox: [x1, y1, x2, y2], label: "...", confidence: ... }
  
  const boxes: BoundingBox[] = [];
  let imageWidth = 600;
  let imageHeight = 2000;
  
  if (output && typeof output === 'object') {
    // Handle different output formats
    if (Array.isArray(output.detections)) {
      for (const det of output.detections) {
        if (det.bbox && Array.isArray(det.bbox)) {
          boxes.push({
            x1: det.bbox[0],
            y1: det.bbox[1],
            x2: det.bbox[2],
            y2: det.bbox[3],
            label: det.label || 'unknown'
          });
        }
      }
    } else if (output.image_dimensions) {
      imageWidth = output.image_dimensions.width || imageWidth;
      imageHeight = output.image_dimensions.height || imageHeight;
    }
  }
  
  console.log(`Detected ${boxes.length} bounding boxes`);
  
  return { boxes, width: imageWidth, height: imageHeight };
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
      model: "claude-opus-4-5-20250514",
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
    // Find closest candidate to target that hasn't been used
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

// Calculate column bounds from bounding boxes
function calculateColumnBounds(
  boxes: BoundingBox[],
  yStart: number,
  yEnd: number,
  columns: number,
  imageWidth: number
): { xStartPercent: number; xEndPercent: number }[] {
  // Find boxes within this Y range
  const relevantBoxes = boxes.filter(box => 
    box.y1 >= yStart - 20 && box.y2 <= yEnd + 20
  );
  
  if (relevantBoxes.length >= columns) {
    // Use detected box positions for columns
    const sortedByX = [...relevantBoxes].sort((a, b) => a.x1 - b.x1);
    return sortedByX.slice(0, columns).map(box => ({
      xStartPercent: (box.x1 / imageWidth) * 100,
      xEndPercent: (box.x2 / imageWidth) * 100
    }));
  }
  
  // Fallback: divide evenly
  const colWidth = 100 / columns;
  return Array.from({ length: columns }, (_, i) => ({
    xStartPercent: colWidth * i,
    xEndPercent: colWidth * (i + 1)
  }));
}

// Main snapping logic
function snapCoordinatesToSections(
  boxes: BoundingBox[],
  sections: Section[],
  imageWidth: number,
  imageHeight: number
): AutoDetectedSlice[] {
  // Extract unique Y-coordinates from bounding boxes
  const yCoordinates: number[] = [];
  boxes.forEach(box => {
    yCoordinates.push(box.y1);
    yCoordinates.push(box.y2);
  });
  
  // Sort and deduplicate (within 10px tolerance)
  const sortedYs = [...new Set(yCoordinates)].sort((a, b) => a - b);
  const uniqueYs = sortedYs.filter((y, i, arr) => i === 0 || y - arr[i - 1] > 10);
  
  console.log(`Extracted ${uniqueYs.length} unique Y coordinates from ${boxes.length} boxes`);
  
  // We need (totalSections) slices, so (totalSections - 1) cut points
  const cutPoints = selectBestCutPoints(uniqueYs, sections.length - 1, imageHeight);
  const boundaries = [0, ...cutPoints, imageHeight];
  
  console.log(`Cut points (px): ${cutPoints.join(', ')}`);
  
  // Map each section to its boundaries
  const finalSlices: AutoDetectedSlice[] = sections.map((section, index) => {
    const yStart = boundaries[index];
    const yEnd = boundaries[index + 1];
    
    const slice: AutoDetectedSlice = {
      id: `slice-${index}`,
      yStartPercent: (yStart / imageHeight) * 100,
      yEndPercent: (yEnd / imageHeight) * 100,
      type: section.type,
      columns: section.columns,
      label: section.label,
      clickable: section.clickable
    };
    
    // For multi-column sections, calculate column bounds
    if (section.columns > 1) {
      slice.columnBounds = calculateColumnBounds(
        boxes, 
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
          metadata: { imageWidth: 0, imageHeight: 0, groundingDinoBoxCount: 0, processingTimeMs: 0 },
          error: 'imageDataUrl is required' 
        } as AutoSliceResponse),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Starting automatic slice detection with Grounding DINO + Claude Opus 4.5...');

    // Get image dimensions
    const dimensions = await getImageDimensions(imageDataUrl);
    console.log(`Image dimensions: ${dimensions.width}x${dimensions.height}`);

    // Step 1: Upload image to Cloudinary for Replicate
    let imageUrl: string;
    try {
      imageUrl = await uploadImageForReplicate(imageDataUrl);
      console.log('Image uploaded to Cloudinary:', imageUrl);
    } catch (e) {
      console.error('Failed to upload image:', e);
      // Fall back to semantic-only analysis
      const semanticAnalysis = await getSemanticAnalysis(imageDataUrl);
      const evenSlices: AutoDetectedSlice[] = semanticAnalysis.sections.map((section, index) => ({
        id: `slice-${index}`,
        yStartPercent: (index / semanticAnalysis.totalSections) * 100,
        yEndPercent: ((index + 1) / semanticAnalysis.totalSections) * 100,
        type: section.type,
        columns: section.columns,
        label: section.label,
        clickable: section.clickable
      }));
      
      return new Response(
        JSON.stringify({
          success: true,
          slices: evenSlices,
          metadata: {
            imageWidth: dimensions.width,
            imageHeight: dimensions.height,
            groundingDinoBoxCount: 0,
            processingTimeMs: Date.now() - startTime
          }
        } as AutoSliceResponse),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 2: Run Grounding DINO and Claude in parallel
    const [dinoResult, semanticAnalysis] = await Promise.all([
      detectElementCoordinates(imageUrl).catch(e => {
        console.error('Grounding DINO failed:', e);
        return { boxes: [] as BoundingBox[], width: dimensions.width, height: dimensions.height };
      }),
      getSemanticAnalysis(imageDataUrl)
    ]);

    console.log(`Grounding DINO: ${dinoResult.boxes.length} boxes`);
    console.log(`Claude: ${semanticAnalysis.totalSections} sections`);

    // Use dimensions from DINO if available, otherwise use calculated
    const imageWidth = dinoResult.width || dimensions.width;
    const imageHeight = dinoResult.height || dimensions.height;

    // Step 3: Snap coordinates to sections
    const slices = snapCoordinatesToSections(
      dinoResult.boxes,
      semanticAnalysis.sections,
      imageWidth,
      imageHeight
    );

    const response: AutoSliceResponse = {
      success: true,
      slices,
      metadata: {
        imageWidth,
        imageHeight,
        groundingDinoBoxCount: dinoResult.boxes.length,
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
          groundingDinoBoxCount: 0,
          processingTimeMs: Date.now() - startTime
        },
        error: error instanceof Error ? error.message : 'Unknown error'
      } as AutoSliceResponse),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
