import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// OmniParser V2 element format
interface OmniParserElement {
  bbox: [number, number, number, number]; // [x1, y1, x2, y2] - NORMALIZED 0-1
  content: string;
  type?: string;
}

interface OmniParserResult {
  parsed_content_list: OmniParserElement[];
  labeled_image?: string;
}

interface Section {
  type: string;
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
  label: string;
  clickable: boolean;
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
  status?: 'processing' | 'ready' | 'failed';
  predictionId?: string;
}

// In-memory cache for prediction results (edge function instances are short-lived)
const predictionCache = new Map<string, { 
  status: 'processing' | 'ready' | 'failed';
  result?: OmniParserResult;
  error?: string;
}>();

// Parse OmniParser V2's Python-formatted element string into a JS array
function parseOmniParserElementsString(elementsString: string): OmniParserElement[] {
  const elements: OmniParserElement[] = [];
  
  const parts = elementsString.split(/icon \d+:\s*/).filter(Boolean);
  
  for (const part of parts) {
    try {
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
      // Skip malformed elements
    }
  }
  
  return elements;
}

// Start OmniParser prediction (returns quickly with prediction ID)
async function startOmniParserPrediction(imageDataUrl: string): Promise<string> {
  const replicateToken = Deno.env.get('REPLICATE_API_TOKEN');
  
  if (!replicateToken) {
    throw new Error('REPLICATE_API_TOKEN not configured');
  }
  
  console.log('Starting OmniParser V2 prediction...');
  
  const response = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      "Authorization": `Token ${replicateToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      version: "49cf3d41b8d3aca1360514e83be4c97131ce8f0d99abfc365526d8384caa88df",
      input: { image: imageDataUrl }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Replicate API error (${response.status}): ${errorText.substring(0, 200)}`);
  }

  const prediction = await response.json();
  console.log('OmniParser prediction created:', prediction.id, 'status:', prediction.status);
  
  return prediction.id;
}

// Check OmniParser prediction status
async function checkPredictionStatus(predictionId: string): Promise<{
  status: 'processing' | 'ready' | 'failed';
  result?: OmniParserResult;
  error?: string;
}> {
  const replicateToken = Deno.env.get('REPLICATE_API_TOKEN');
  
  if (!replicateToken) {
    throw new Error('REPLICATE_API_TOKEN not configured');
  }
  
  const response = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
    headers: { "Authorization": `Token ${replicateToken}` }
  });

  if (!response.ok) {
    throw new Error(`Failed to check prediction status: ${response.status}`);
  }

  const prediction = await response.json();
  
  if (prediction.status === 'succeeded') {
    // Parse the result
    let parsedContentList: OmniParserElement[] = [];
    let labeledImage = null;
    
    if (prediction.output?.img) {
      labeledImage = prediction.output.img;
    }
    
    if (prediction.output?.elements && typeof prediction.output.elements === 'string') {
      parsedContentList = parseOmniParserElementsString(prediction.output.elements);
      console.log(`Parsed ${parsedContentList.length} elements from OmniParser`);
    } else if (prediction.output?.parsed_content_list) {
      parsedContentList = prediction.output.parsed_content_list;
    }
    
    if (parsedContentList.length === 0) {
      return { status: 'failed', error: 'OmniParser returned no elements' };
    }
    
    return {
      status: 'ready',
      result: { parsed_content_list: parsedContentList, labeled_image: labeledImage }
    };
  } else if (prediction.status === 'failed') {
    return { status: 'failed', error: prediction.error || 'OmniParser failed' };
  } else {
    // starting, processing
    return { status: 'processing' };
  }
}

// Get semantic analysis from Claude
async function getSemanticAnalysis(imageBase64: string): Promise<SemanticAnalysis> {
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  
  if (!anthropicKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }
  
  console.log('Calling Claude for semantic analysis...');
  
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
      model: "claude-sonnet-4-20250514",
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
            text: `Analyze this email marketing image for slicing into separate horizontal sections.

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
   - label: A brief descriptive label like "BOGO 50% off banner" or "Dual product showcase"
   - clickable: Is this section meant to be clickable? (true/false)

Return ONLY valid JSON in this exact format:
{
  "totalSections": 8,
  "sections": [
    { "type": "promo_banner", "label": "BOGO 50% off banner", "clickable": true },
    { "type": "hero", "label": "Main hero with CTA button", "clickable": true },
    { "type": "cta_button", "label": "Shop Hydroglyph button", "clickable": true },
    { "type": "product_grid", "label": "Dual product showcase", "clickable": true },
    { "type": "text_block", "label": "Learn the protocol section", "clickable": false }
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

// Find section boundaries by detecting GAPS between elements
function findSectionBoundaries(
  elements: OmniParserElement[],
  numCuts: number,
  imageHeight: number,
  minSliceHeight: number = 80
): number[] {
  const elementYs: number[] = [];
  elements.forEach(el => {
    const y1 = el.bbox[1] * imageHeight;
    const y2 = el.bbox[3] * imageHeight;
    elementYs.push(y1, y2);
  });
  
  elementYs.sort((a, b) => a - b);
  
  const gaps: { y: number; size: number }[] = [];
  for (let i = 0; i < elementYs.length - 1; i++) {
    const gapSize = elementYs[i + 1] - elementYs[i];
    if (gapSize > 20) {
      gaps.push({
        y: Math.round(elementYs[i] + gapSize / 2),
        size: gapSize
      });
    }
  }
  
  console.log(`Found ${gaps.length} gaps > 20px between elements`);
  
  gaps.sort((a, b) => b.size - a.size);
  
  const selected: number[] = [];
  
  for (const gap of gaps) {
    if (selected.length >= numCuts) break;
    
    const allBoundaries = [0, ...selected, gap.y, imageHeight].sort((a, b) => a - b);
    let valid = true;
    
    for (let i = 0; i < allBoundaries.length - 1; i++) {
      if (allBoundaries[i + 1] - allBoundaries[i] < minSliceHeight) {
        valid = false;
        break;
      }
    }
    
    if (valid) {
      selected.push(gap.y);
    }
  }
  
  return selected.sort((a, b) => a - b);
}

// Snap OmniParser elements to Claude's sections
function snapOmniParserToSections(
  elements: OmniParserElement[],
  sections: Section[],
  imageHeight: number
): AutoDetectedSlice[] {
  const cutsNeeded = sections.length - 1;
  const cutPoints = findSectionBoundaries(elements, cutsNeeded, imageHeight);
  const boundaries = [0, ...cutPoints, imageHeight];
  
  console.log(`Boundaries (px): ${boundaries.join(', ')}`);
  
  return sections.map((section, index) => {
    const yStart = boundaries[index] ?? boundaries[boundaries.length - 2] ?? 0;
    const yEnd = boundaries[index + 1] ?? boundaries[boundaries.length - 1] ?? imageHeight;
    
    return {
      id: `slice-${index}`,
      yStartPercent: Number(((yStart / imageHeight) * 100).toFixed(2)),
      yEndPercent: Number(((yEnd / imageHeight) * 100).toFixed(2)),
      type: section.type,
      label: section.label,
      clickable: section.clickable
    };
  });
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
    if (bytes.length > 24) {
      const width = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
      const height = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
      return { width, height };
    }
  } else {
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
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const body = await req.json();
    const { action = 'legacy', imageDataUrl, predictionId } = body;
    
    // Get dimensions if image is provided
    const dimensions = imageDataUrl ? await getImageDimensions(imageDataUrl) : { width: 0, height: 0 };
    
    // ACTION: START - Begin OmniParser prediction
    if (action === 'start') {
      if (!imageDataUrl) {
        return new Response(
          JSON.stringify({ success: false, error: 'imageDataUrl is required', slices: [], metadata: { imageWidth: 0, imageHeight: 0, omniParserElementCount: 0, processingTimeMs: 0 } }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      console.log('Action: START - Creating OmniParser prediction...');
      
      try {
        const newPredictionId = await startOmniParserPrediction(imageDataUrl);
        
        // Quick poll (3 attempts) to see if it completes immediately (warm model)
        for (let i = 0; i < 3; i++) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          const status = await checkPredictionStatus(newPredictionId);
          
          if (status.status === 'ready' && status.result) {
            // Model was warm! Run full pipeline immediately
            console.log('OmniParser completed quickly, running Claude...');
            const semanticAnalysis = await getSemanticAnalysis(imageDataUrl);
            
            let sections = semanticAnalysis.sections;
            const maxSectionsByHeight = Math.floor(dimensions.height / 100);
            if (sections.length > maxSectionsByHeight) {
              sections = sections.slice(0, maxSectionsByHeight);
            }
            
            const slices = snapOmniParserToSections(status.result.parsed_content_list, sections, dimensions.height);
            
            return new Response(
              JSON.stringify({
                success: true,
                slices,
                metadata: {
                  imageWidth: dimensions.width,
                  imageHeight: dimensions.height,
                  omniParserElementCount: status.result.parsed_content_list.length,
                  processingTimeMs: Date.now() - startTime
                }
              }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
          
          if (status.status === 'failed') {
            return new Response(
              JSON.stringify({
                success: false,
                status: 'failed',
                error: status.error || 'OmniParser failed',
                slices: [],
                metadata: { imageWidth: dimensions.width, imageHeight: dimensions.height, omniParserElementCount: 0, processingTimeMs: Date.now() - startTime }
              }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }
        
        // Still processing, return prediction ID for polling
        return new Response(
          JSON.stringify({
            success: false,
            status: 'processing',
            predictionId: newPredictionId,
            slices: [],
            metadata: { imageWidth: dimensions.width, imageHeight: dimensions.height, omniParserElementCount: 0, processingTimeMs: Date.now() - startTime }
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('Start failed:', errorMessage);
        return new Response(
          JSON.stringify({
            success: false,
            status: 'failed',
            error: `Failed to start analysis: ${errorMessage}`,
            slices: [],
            metadata: { imageWidth: dimensions.width, imageHeight: dimensions.height, omniParserElementCount: 0, processingTimeMs: Date.now() - startTime }
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }
    
    // ACTION: POLL - Check prediction status
    if (action === 'poll') {
      if (!predictionId) {
        return new Response(
          JSON.stringify({ success: false, error: 'predictionId is required', slices: [], metadata: { imageWidth: 0, imageHeight: 0, omniParserElementCount: 0, processingTimeMs: 0 } }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      console.log(`Action: POLL - Checking prediction ${predictionId}...`);
      
      const status = await checkPredictionStatus(predictionId);
      
      return new Response(
        JSON.stringify({
          success: false,
          status: status.status,
          predictionId,
          error: status.error,
          slices: [],
          metadata: { imageWidth: 0, imageHeight: 0, omniParserElementCount: 0, processingTimeMs: Date.now() - startTime }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // ACTION: FINALIZE - OmniParser ready, run Claude + snapping
    if (action === 'finalize') {
      if (!predictionId || !imageDataUrl) {
        return new Response(
          JSON.stringify({ success: false, error: 'predictionId and imageDataUrl are required', slices: [], metadata: { imageWidth: 0, imageHeight: 0, omniParserElementCount: 0, processingTimeMs: 0 } }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      console.log(`Action: FINALIZE - Getting prediction ${predictionId} and running Claude...`);
      
      // Get OmniParser result
      const status = await checkPredictionStatus(predictionId);
      
      if (status.status !== 'ready' || !status.result) {
        return new Response(
          JSON.stringify({
            success: false,
            status: status.status,
            error: status.error || 'Prediction not ready',
            slices: [],
            metadata: { imageWidth: dimensions.width, imageHeight: dimensions.height, omniParserElementCount: 0, processingTimeMs: Date.now() - startTime }
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Run Claude semantic analysis
      const semanticAnalysis = await getSemanticAnalysis(imageDataUrl);
      
      let sections = semanticAnalysis.sections;
      const maxSectionsByHeight = Math.floor(dimensions.height / 100);
      if (sections.length > maxSectionsByHeight) {
        console.log(`Capping sections from ${sections.length} to ${maxSectionsByHeight}`);
        sections = sections.slice(0, maxSectionsByHeight);
      }
      
      // Snap and return
      const slices = snapOmniParserToSections(status.result.parsed_content_list, sections, dimensions.height);
      
      return new Response(
        JSON.stringify({
          success: true,
          slices,
          metadata: {
            imageWidth: dimensions.width,
            imageHeight: dimensions.height,
            omniParserElementCount: status.result.parsed_content_list.length,
            processingTimeMs: Date.now() - startTime
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // LEGACY: Original single-request flow (for backward compatibility)
    if (!imageDataUrl) {
      return new Response(
        JSON.stringify({ success: false, error: 'imageDataUrl is required', slices: [], metadata: { imageWidth: 0, imageHeight: 0, omniParserElementCount: 0, processingTimeMs: 0 } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Legacy mode: Full auto-slice in single request...');

    // Start and poll OmniParser (blocking)
    const newPredictionId = await startOmniParserPrediction(imageDataUrl);
    let omniResult: OmniParserResult | null = null;
    
    for (let i = 0; i < 90; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const status = await checkPredictionStatus(newPredictionId);
      
      if (status.status === 'ready' && status.result) {
        omniResult = status.result;
        break;
      }
      if (status.status === 'failed') {
        return new Response(
          JSON.stringify({
            success: false,
            error: `OmniParser failed: ${status.error}. Please use manual mode.`,
            slices: [],
            metadata: { imageWidth: dimensions.width, imageHeight: dimensions.height, omniParserElementCount: 0, processingTimeMs: Date.now() - startTime }
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }
    
    if (!omniResult) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'OmniParser timed out. Please use manual mode.',
          slices: [],
          metadata: { imageWidth: dimensions.width, imageHeight: dimensions.height, omniParserElementCount: 0, processingTimeMs: Date.now() - startTime }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Run Claude
    const semanticAnalysis = await getSemanticAnalysis(imageDataUrl);
    
    let sections = semanticAnalysis.sections;
    const maxSectionsByHeight = Math.floor(dimensions.height / 100);
    if (sections.length > maxSectionsByHeight) {
      sections = sections.slice(0, maxSectionsByHeight);
    }

    const slices = snapOmniParserToSections(omniResult.parsed_content_list, sections, dimensions.height);

    return new Response(
      JSON.stringify({
        success: true,
        slices,
        metadata: {
          imageWidth: dimensions.width,
          imageHeight: dimensions.height,
          omniParserElementCount: omniResult.parsed_content_list.length,
          processingTimeMs: Date.now() - startTime
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Auto-slice error:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        slices: [],
        metadata: { imageWidth: 0, imageHeight: 0, omniParserElementCount: 0, processingTimeMs: Date.now() - startTime },
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
