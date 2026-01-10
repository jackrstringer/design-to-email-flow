import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================================
// TYPES AND INTERFACES
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

interface SliceOutput {
  yTop: number;
  yBottom: number;
}

// Raw data from Vision APIs - no decisions, just facts
interface RawVisionData {
  paragraphs: Paragraph[];
  objects: DetectedObject[];
  logos: DetectedLogo[];
  imageWidth: number;
  imageHeight: number;
}

// Claude's decision - the ONLY decision-maker
interface ClaudeDecision {
  footerStartY: number;
  sections: { name: string; yTop: number; yBottom: number }[];
}

interface AutoSliceV2Response {
  success: boolean;
  footerStartY: number;
  slices: SliceOutput[];
  imageHeight: number;
  imageWidth: number;
  processingTimeMs: number;
  confidence: {
    overall: 'high' | 'medium' | 'low';
  };
  error?: string;
  debug?: {
    paragraphCount: number;
    objectCount: number;
    logoCount: number;
    claudeSections?: { name: string; yTop: number; yBottom: number }[];
  };
}

// ============================================================================
// LAYER 1: GOOGLE CLOUD VISION OCR (Data Gathering Only)
// ============================================================================

async function extractTextGeometry(imageBase64: string): Promise<{
  paragraphs: Paragraph[];
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
    return { paragraphs: [] };
  }

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
  
  return { paragraphs };
}

// ============================================================================
// LAYER 2: GOOGLE CLOUD VISION OBJECT LOCALIZATION (Data Gathering Only)
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
// LAYER 3: GOOGLE CLOUD VISION LOGO DETECTION (Data Gathering Only)
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
// UTILITY: IMAGE DIMENSION EXTRACTION
// ============================================================================

function getImageDimensions(imageBase64: string): { width: number; height: number } | null {
  // Decode enough bytes to find dimensions
  const bytesToDecode = Math.min(imageBase64.length, 50000);
  const binaryStr = atob(imageBase64.substring(0, bytesToDecode));
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  
  // PNG: dimensions at fixed position in IHDR chunk
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
    const width = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
    const height = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
    console.log(`  → PNG dimensions from header: ${width}x${height}`);
    return { width, height };
  }
  
  // JPEG: scan for SOF0/SOF2 markers
  if (bytes[0] === 0xFF && bytes[1] === 0xD8) {
    let offset = 2;
    while (offset < bytes.length - 10) {
      if (bytes[offset] !== 0xFF) {
        offset++;
        continue;
      }
      
      const marker = bytes[offset + 1];
      
      if (marker === 0xC0 || marker === 0xC2) {
        const height = (bytes[offset + 5] << 8) | bytes[offset + 6];
        const width = (bytes[offset + 7] << 8) | bytes[offset + 8];
        console.log(`  → JPEG dimensions from SOF marker: ${width}x${height}`);
        return { width, height };
      }
      
      if (marker >= 0xC0 && marker <= 0xFE && marker !== 0xD8 && marker !== 0xD9 && !(marker >= 0xD0 && marker <= 0xD7)) {
        const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
        offset += 2 + length;
      } else {
        offset++;
      }
    }
  }
  
  console.log(`  → Could not extract dimensions from image header`);
  return null;
}

// ============================================================================
// CLAUDE: THE SOLE DECISION MAKER
// ============================================================================

async function askClaude(
  imageBase64: string,
  mimeType: string,
  rawData: RawVisionData
): Promise<{ success: true; decision: ClaudeDecision } | { success: false; error: string }> {
  
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return { success: false, error: "ANTHROPIC_API_KEY not configured" };
  }

  console.log("Asking Claude to analyze and make ALL decisions...");
  
  // Format raw data for Claude - just the facts, no decisions
  const ocrData = rawData.paragraphs.map(p => ({
    text: p.text.substring(0, 150),
    yTop: Math.round(p.yTop),
    yBottom: Math.round(p.yBottom),
    xLeft: Math.round(p.xLeft),
    xRight: Math.round(p.xRight)
  }));
  
  const objectData = rawData.objects.map(o => ({
    name: o.name,
    confidence: Math.round(o.score * 100),
    yTop: Math.round(o.yTop),
    yBottom: Math.round(o.yBottom),
    xLeft: Math.round(o.xLeft),
    xRight: Math.round(o.xRight)
  }));
  
  const logoData = rawData.logos.map(l => ({
    name: l.description,
    yTop: Math.round(l.yTop),
    yBottom: Math.round(l.yBottom),
    xLeft: Math.round(l.xLeft),
    xRight: Math.round(l.xRight)
  }));

  const prompt = `You are analyzing an email design screenshot to determine where to slice it into sections.

## Image Dimensions
${rawData.imageWidth}x${rawData.imageHeight} pixels

## Raw OCR Data (Text Blocks with Coordinates)
${JSON.stringify(ocrData, null, 2)}

## Detected Objects (Images, Products, UI Elements)
${JSON.stringify(objectData, null, 2)}

## Detected Logos
${JSON.stringify(logoData, null, 2)}

## Your Task
1. LOOK at the image carefully
2. Use the data above to understand what content is where
3. YOU decide where the section boundaries should be
4. YOU decide where the footer starts

## What Makes Good Sections
- **Header/Logo area**: Usually at the top
- **Hero section**: Headline + hero image + primary CTA (keep together as ONE slice)
- **Product modules**: Each product with its image, name, price (ONE slice per product OR one slice for entire grid)
- **Feature blocks**: Icon + headline + description (keep together)
- **Testimonials**: Quote + attribution (keep together)
- **Secondary CTAs**: Button with surrounding context
- **Footer**: Unsubscribe links, legal text, social icons, company address - typically at the very bottom

## Critical Rules
1. LOOK AT THE IMAGE - the data is just to help with precise coordinates
2. Do NOT cut through text blocks, images, logos, or buttons
3. Place cuts in the GAPS between sections
4. Keep semantically related content TOGETHER
5. Every slice should make sense as a standalone unit
6. The footer contains legal/unsubscribe text - identify where it ACTUALLY starts

## Output Format
Return ONLY a JSON object with your decisions:
{
  "footerStartY": <number - the Y pixel where footer begins>,
  "sections": [
    { "name": "header", "yTop": 0, "yBottom": 120 },
    { "name": "hero", "yTop": 120, "yBottom": 480 },
    { "name": "products", "yTop": 480, "yBottom": 920 },
    { "name": "cta", "yTop": 920, "yBottom": 1050 }
  ]
}

Rules for your response:
- First section MUST start at yTop: 0
- Last section's yBottom should equal your footerStartY
- Sections should NOT overlap
- Each yBottom should equal the next section's yTop
- footerStartY should be where the footer actually begins in the image`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
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
      console.error(`Claude API error (${response.status}):`, errorText.substring(0, 500));
      return { success: false, error: `Claude API error: ${response.status}` };
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
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonStr = jsonMatch[0];
      }
    }
    
    const parsed = JSON.parse(jsonStr.trim());
    
    const decision: ClaudeDecision = {
      footerStartY: parsed.footerStartY,
      sections: parsed.sections || []
    };
    
    console.log(`  → Claude decided: footerStartY=${decision.footerStartY}, ${decision.sections.length} sections`);
    
    return { success: true, decision };
    
  } catch (e) {
    console.error("Failed to get/parse Claude response:", e);
    return { success: false, error: `Failed to parse Claude response: ${e}` };
  }
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
      return new Response(JSON.stringify({
        success: false,
        error: "imageDataUrl is required",
        footerStartY: 0,
        slices: [],
        imageHeight: 0,
        imageWidth: 0,
        processingTimeMs: Date.now() - startTime,
        confidence: { overall: 'low' }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      });
    }

    // Parse the data URL
    const match = imageDataUrl.match(/^data:(image\/[a-z]+);base64,(.+)$/i);
    if (!match) {
      return new Response(JSON.stringify({
        success: false,
        error: "Invalid image data URL format",
        footerStartY: 0,
        slices: [],
        imageHeight: 0,
        imageWidth: 0,
        processingTimeMs: Date.now() - startTime,
        confidence: { overall: 'low' }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      });
    }
    
    const mimeType = match[1];
    const imageBase64 = match[2];
    console.log(`\n========== AUTO-SLICE V2 (Claude Brain) ==========`);
    console.log(`Received image: ${mimeType}, base64 length: ${imageBase64.length}`);

    // ========== GET TRUE IMAGE DIMENSIONS ==========
    const headerDimensions = getImageDimensions(imageBase64);
    
    if (!headerDimensions) {
      return new Response(JSON.stringify({
        success: false,
        error: "Could not determine image dimensions",
        footerStartY: 0,
        slices: [],
        imageHeight: 0,
        imageWidth: 0,
        processingTimeMs: Date.now() - startTime,
        confidence: { overall: 'low' }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      });
    }
    
    const imageWidth = headerDimensions.width;
    const imageHeight = headerDimensions.height;
    console.log(`TRUE image dimensions: ${imageWidth}x${imageHeight}`);

    // ========== GATHER RAW DATA (Vision APIs in parallel) ==========
    const [ocrResult, objects, logos] = await Promise.all([
      extractTextGeometry(imageBase64),
      detectObjects(imageBase64, imageHeight, imageWidth),
      detectLogos(imageBase64, imageHeight, imageWidth)
    ]);

    const rawData: RawVisionData = {
      paragraphs: ocrResult.paragraphs,
      objects,
      logos,
      imageWidth,
      imageHeight
    };

    console.log(`Raw data gathered: ${rawData.paragraphs.length} paragraphs, ${rawData.objects.length} objects, ${rawData.logos.length} logos`);

    // ========== ASK CLAUDE TO MAKE ALL DECISIONS ==========
    const claudeResult = await askClaude(imageBase64, mimeType, rawData);

    if (!claudeResult.success) {
      // If Claude fails, we fail - NO FALLBACK
      return new Response(JSON.stringify({
        success: false,
        error: claudeResult.error,
        footerStartY: 0,
        slices: [],
        imageHeight,
        imageWidth,
        processingTimeMs: Date.now() - startTime,
        confidence: { overall: 'low' },
        debug: {
          paragraphCount: rawData.paragraphs.length,
          objectCount: rawData.objects.length,
          logoCount: rawData.logos.length
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      });
    }

    // ========== USE CLAUDE'S DECISIONS DIRECTLY ==========
    const decision = claudeResult.decision;
    
    // Convert Claude's sections directly to slices - NO MODIFICATIONS
    const slices: SliceOutput[] = decision.sections.map(section => ({
      yTop: Math.round(section.yTop),
      yBottom: Math.round(section.yBottom)
    }));

    const processingTimeMs = Date.now() - startTime;

    const response: AutoSliceV2Response = {
      success: true,
      footerStartY: Math.round(decision.footerStartY),
      slices,
      imageHeight,
      imageWidth,
      processingTimeMs,
      confidence: {
        overall: rawData.paragraphs.length > 5 ? 'high' : rawData.paragraphs.length > 0 ? 'medium' : 'low'
      },
      debug: {
        paragraphCount: rawData.paragraphs.length,
        objectCount: rawData.objects.length,
        logoCount: rawData.logos.length,
        claudeSections: decision.sections
      }
    };

    console.log(`\n========== COMPLETE ==========`);
    console.log(`Claude decided: ${slices.length} slices, footer at ${decision.footerStartY}px`);
    console.log(`Processing time: ${processingTimeMs}ms`);

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
      confidence: { overall: 'low' }
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });
  }
});
