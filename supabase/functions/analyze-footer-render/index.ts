import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================================
// TYPE DEFINITIONS - Same as analyze-footer-reference for consistency
// ============================================================================

interface TextBlock {
  text: string;
  bounds: {
    xLeft: number;
    xRight: number;
    yTop: number;
    yBottom: number;
  };
  width: number;
  height: number;
  estimatedFontSize: number;
  confidence: number;
}

interface DetectedLogo {
  name: string;
  bounds: {
    xLeft: number;
    xRight: number;
    yTop: number;
    yBottom: number;
  };
  width: number;
  height: number;
  score: number;
}

interface DetectedObject {
  type: string;
  bounds: {
    xLeft: number;
    xRight: number;
    yTop: number;
    yBottom: number;
  };
  score: number;
}

interface HorizontalEdge {
  y: number;
  colorAbove: string;
  colorBelow: string;
  strength: number;
}

interface ColorPalette {
  background: string;
  text: string;
  accent: string;
}

export interface FooterRenderAnalysisResult {
  success: boolean;
  dimensions: { 
    width: number; 
    height: number;
    originalWidth?: number;
    originalHeight?: number;
    scaleFactor?: number;
  };
  textBlocks: TextBlock[];
  logos: DetectedLogo[];
  objects: DetectedObject[];
  horizontalEdges: HorizontalEdge[];
  colorPalette: ColorPalette;
  processingTimeMs: number;
}

// ============================================================================
// GOOGLE CLOUD VISION: TEXT DETECTION
// ============================================================================

async function extractTextGeometry(imageBase64: string): Promise<TextBlock[]> {
  const apiKey = Deno.env.get("GOOGLE_CLOUD_VISION_API_KEY");
  if (!apiKey) {
    throw new Error("GOOGLE_CLOUD_VISION_API_KEY not configured");
  }

  console.log("Layer 1: Calling Google Cloud Vision OCR on render...");
  
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
    console.log("No text detected in render");
    return [];
  }

  const textBlocks: TextBlock[] = [];
  
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
        
        const height = yBottom - yTop;
        const width = xRight - xLeft;
        const estimatedFontSize = Math.round(height / 1.2);
        
        textBlocks.push({
          text: text.trim(),
          bounds: { xLeft, xRight, yTop, yBottom },
          width,
          height,
          estimatedFontSize,
          confidence: paragraph.confidence || 0.9
        });
      }
    }
  }

  console.log(`  → Extracted ${textBlocks.length} text blocks from render`);
  return textBlocks;
}

// ============================================================================
// GOOGLE CLOUD VISION: OBJECT LOCALIZATION
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

  console.log("Layer 2: Detecting objects in render...");
  
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
      type: obj.name,
      bounds: {
        xLeft: Math.round(Math.min(...xCoords)),
        xRight: Math.round(Math.max(...xCoords)),
        yTop: Math.round(Math.min(...yCoords)),
        yBottom: Math.round(Math.max(...yCoords))
      },
      score: obj.score
    };
  });

  console.log(`  → Detected ${objects.length} objects in render`);
  return objects;
}

// ============================================================================
// GOOGLE CLOUD VISION: LOGO DETECTION
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

  console.log("Layer 3: Detecting logos in render...");
  
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
    
    const xLeft = Math.min(...xCoords);
    const xRight = Math.max(...xCoords);
    const yTop = Math.min(...yCoords);
    const yBottom = Math.max(...yCoords);
    
    return {
      name: logo.description,
      bounds: { xLeft, xRight, yTop, yBottom },
      width: xRight - xLeft,
      height: yBottom - yTop,
      score: logo.score
    };
  });

  console.log(`  → Detected ${logos.length} logos in render`);
  return logos;
}

// ============================================================================
// IMAGE PROCESSING: HORIZONTAL EDGE DETECTION
// ============================================================================

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return '#' + [r, g, b].map(x => {
    const hex = clamp(x).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

function getRowAverageColor(image: any, y: number): { r: number; g: number; b: number } {
  let r = 0, g = 0, b = 0;
  
  for (let x = 1; x <= image.width; x++) {
    const pixel = image.getPixelAt(x, y + 1);
    r += (pixel >> 24) & 0xFF;
    g += (pixel >> 16) & 0xFF;
    b += (pixel >> 8) & 0xFF;
  }
  
  return {
    r: Math.round(r / image.width),
    g: Math.round(g / image.width),
    b: Math.round(b / image.width)
  };
}

function colorDistance(c1: { r: number; g: number; b: number }, c2: { r: number; g: number; b: number }): number {
  return Math.sqrt(
    Math.pow(c1.r - c2.r, 2) +
    Math.pow(c1.g - c2.g, 2) +
    Math.pow(c1.b - c2.b, 2)
  );
}

async function detectHorizontalEdges(
  imageBase64: string,
  imageWidth: number,
  imageHeight: number
): Promise<HorizontalEdge[]> {
  console.log("Layer 4: Detecting horizontal color edges in render...");
  
  try {
    const binaryStr = atob(imageBase64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    
    const { Image } = await import("https://deno.land/x/imagescript@1.3.0/mod.ts");
    const image = await Image.decode(bytes);
    
    const edges: HorizontalEdge[] = [];
    let previousRowAvg = getRowAverageColor(image, 0);
    
    for (let y = 1; y < image.height; y++) {
      const currentRowAvg = getRowAverageColor(image, y);
      const colorDiff = colorDistance(previousRowAvg, currentRowAvg);
      
      if (colorDiff > 35) {
        edges.push({
          y: y,
          colorAbove: rgbToHex(previousRowAvg.r, previousRowAvg.g, previousRowAvg.b),
          colorBelow: rgbToHex(currentRowAvg.r, currentRowAvg.g, currentRowAvg.b),
          strength: Math.min(colorDiff / 100, 1)
        });
      }
      
      previousRowAvg = currentRowAvg;
    }
    
    const filtered = edges.filter(e => e.strength > 0.3).sort((a, b) => a.y - b.y);
    console.log(`  → Found ${filtered.length} significant horizontal edges in render`);
    return filtered;
    
  } catch (error) {
    console.error("Edge detection failed:", error);
    return [];
  }
}

// ============================================================================
// COLOR PALETTE EXTRACTION
// ============================================================================

async function extractColorPalette(imageBase64: string): Promise<ColorPalette> {
  try {
    const binaryStr = atob(imageBase64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    
    const { Image } = await import("https://deno.land/x/imagescript@1.3.0/mod.ts");
    const image = await Image.decode(bytes);
    
    const colorCounts: Map<string, number> = new Map();
    
    for (let y = 0; y < image.height; y += 10) {
      for (let x = 0; x < image.width; x += 10) {
        const pixel = image.getPixelAt(x + 1, y + 1);
        const r = (pixel >> 24) & 0xFF;
        const g = (pixel >> 16) & 0xFF;
        const b = (pixel >> 8) & 0xFF;
        
        const qr = Math.min(240, Math.floor(r / 16) * 16);
        const qg = Math.min(240, Math.floor(g / 16) * 16);
        const qb = Math.min(240, Math.floor(b / 16) * 16);
        
        const hex = rgbToHex(qr, qg, qb);
        colorCounts.set(hex, (colorCounts.get(hex) || 0) + 1);
      }
    }
    
    const sorted = Array.from(colorCounts.entries()).sort((a, b) => b[1] - a[1]);
    
    const background = sorted[0]?.[0] || '#ffffff';
    
    const bgR = parseInt(background.slice(1, 3), 16);
    const bgG = parseInt(background.slice(3, 5), 16);
    const bgB = parseInt(background.slice(5, 7), 16);
    const bgLuminance = (bgR + bgG + bgB) / 3;
    const isDarkBackground = bgLuminance < 128;
    
    let text: string;
    if (isDarkBackground) {
      const lightColors = sorted.filter(([hex]) => {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return (r + g + b) / 3 > 180;
      });
      text = lightColors[0]?.[0] || '#ffffff';
    } else {
      const darkColors = sorted.filter(([hex]) => {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return (r + g + b) / 3 < 80;
      });
      text = darkColors[0]?.[0] || '#000000';
    }
    
    const accentColors = sorted.filter(([hex]) => {
      if (hex === background) return false;
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const saturation = max === 0 ? 0 : (max - min) / max;
      return saturation > 0.3;
    });
    const accent = accentColors[0]?.[0] || '#0066cc';
    
    console.log(`  → Extracted palette from render: bg=${background}, text=${text}, accent=${accent}`);
    return { background, text, accent };
    
  } catch (error) {
    console.error("Color palette extraction failed:", error);
    return { background: '#ffffff', text: '#000000', accent: '#0066cc' };
  }
}

// ============================================================================
// IMAGE DIMENSION EXTRACTION
// ============================================================================

function getImageDimensions(imageBase64: string): { width: number; height: number } | null {
  const bytesToDecode = Math.min(imageBase64.length, 50000);
  const binaryStr = atob(imageBase64.substring(0, bytesToDecode));
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
  
  // JPEG
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
        return { width, height };
      }
      
      const segmentLength = (bytes[offset + 2] << 8) | bytes[offset + 3];
      offset += 2 + segmentLength;
    }
  }
  
  return null;
}

// ============================================================================
// MAIN HANDLER - Analyze rendered HTML screenshot
// ============================================================================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const { renderScreenshotUrl } = await req.json();

    if (!renderScreenshotUrl) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'renderScreenshotUrl is required' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('Analyzing footer render screenshot:', renderScreenshotUrl.substring(0, 80));

    // Fetch and convert to base64
    const imageResponse = await fetch(renderScreenshotUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch render screenshot: ${imageResponse.status}`);
    }

    const imageBuffer = await imageResponse.arrayBuffer();
    const imageBase64 = btoa(String.fromCharCode(...new Uint8Array(imageBuffer)));
    
    // Get dimensions
    const dimensions = getImageDimensions(imageBase64);
    if (!dimensions) {
      throw new Error('Could not determine render image dimensions');
    }

    console.log(`Render image dimensions: ${dimensions.width}x${dimensions.height}`);

    // Normalize to 600px width for consistent comparison
    const scaleFactor = 600 / dimensions.width;
    const normalizedHeight = Math.round(dimensions.height * scaleFactor);

    // Run all 4 layers in parallel
    const [textBlocks, objects, logos, horizontalEdges, colorPalette] = await Promise.all([
      extractTextGeometry(imageBase64),
      detectObjects(imageBase64, dimensions.height, dimensions.width),
      detectLogos(imageBase64, dimensions.height, dimensions.width),
      detectHorizontalEdges(imageBase64, dimensions.width, dimensions.height),
      extractColorPalette(imageBase64)
    ]);

    // Scale all coordinates to 600px normalized space
    const scaleCoords = (bounds: any) => ({
      xLeft: Math.round(bounds.xLeft * scaleFactor),
      xRight: Math.round(bounds.xRight * scaleFactor),
      yTop: Math.round(bounds.yTop * scaleFactor),
      yBottom: Math.round(bounds.yBottom * scaleFactor)
    });

    const normalizedTextBlocks = textBlocks.map(tb => ({
      ...tb,
      bounds: scaleCoords(tb.bounds),
      width: Math.round(tb.width * scaleFactor),
      height: Math.round(tb.height * scaleFactor),
      estimatedFontSize: Math.round(tb.estimatedFontSize * scaleFactor)
    }));

    const normalizedLogos = logos.map(logo => ({
      ...logo,
      bounds: scaleCoords(logo.bounds),
      width: Math.round(logo.width * scaleFactor),
      height: Math.round(logo.height * scaleFactor)
    }));

    const normalizedObjects = objects.map(obj => ({
      ...obj,
      bounds: scaleCoords(obj.bounds)
    }));

    const normalizedEdges = horizontalEdges.map(e => ({
      ...e,
      y: Math.round(e.y * scaleFactor)
    }));

    const processingTimeMs = Date.now() - startTime;
    console.log(`Render analysis complete in ${processingTimeMs}ms`);

    const result: FooterRenderAnalysisResult = {
      success: true,
      dimensions: {
        width: 600,
        height: normalizedHeight,
        originalWidth: dimensions.width,
        originalHeight: dimensions.height,
        scaleFactor
      },
      textBlocks: normalizedTextBlocks,
      logos: normalizedLogos,
      objects: normalizedObjects,
      horizontalEdges: normalizedEdges,
      colorPalette,
      processingTimeMs
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Render analysis error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error',
      processingTimeMs: Date.now() - startTime
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
