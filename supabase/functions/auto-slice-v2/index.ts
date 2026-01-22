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

interface HorizontalEdge {
  y: number;
  strength: number; // 0-1, how dramatic the color change is
  colorAbove: { r: number; g: number; b: number };
  colorBelow: { r: number; g: number; b: number };
}

interface SliceOutput {
  yTop: number;
  yBottom: number;
  name: string;
  hasCTA: boolean;
  ctaText: string | null;
  // Horizontal split detection (rare - for side-by-side products)
  horizontalSplit?: {
    columns: 2 | 3 | 4 | 5 | 6;
    gutterPositions: number[]; // X percentages where columns divide
  };
}

// Raw data from Vision APIs - no decisions, just facts
interface RawVisionData {
  paragraphs: Paragraph[];
  objects: DetectedObject[];
  logos: DetectedLogo[];
  edges: HorizontalEdge[];
  imageWidth: number;
  imageHeight: number;
}

// Claude's decision - the ONLY decision-maker
interface ClaudeDecision {
  footerStartY: number;
  sections: { 
    name: string; 
    yTop: number; 
    yBottom: number;
    hasCTA: boolean;
    ctaText: string | null;
    // Horizontal split detection
    horizontalSplit?: {
      columns: 2 | 3 | 4 | 5 | 6;
      gutterPositions: number[];
    };
  }[];
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
    edgeCount?: number;
    claudeSections?: { name: string; yTop: number; yBottom: number; hasCTA: boolean; ctaText: string | null }[];
    scaleFactor?: number;
    originalDimensions?: { width: number; height: number };
    claudeImageDimensions?: { width: number; height: number };
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
// LAYER 4: HORIZONTAL EDGE DETECTION (Data Gathering Only)
// ============================================================================

function getRowAverageColor(image: any, y: number): { r: number; g: number; b: number } {
  let r = 0, g = 0, b = 0;
  
  for (let x = 1; x <= image.width; x++) {
    const pixel = image.getPixelAt(x, y + 1); // ImageScript uses 1-indexed
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
  console.log("Layer 4: Detecting horizontal color edges...");
  
  try {
    // Decode base64 to Uint8Array
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
      
      // Only record significant edges (threshold ~35)
      if (colorDiff > 35) {
        edges.push({
          y: y,
          strength: Math.min(colorDiff / 100, 1),
          colorAbove: previousRowAvg,
          colorBelow: currentRowAvg
        });
      }
      
      previousRowAvg = currentRowAvg;
    }
    
    // Filter to keep only strong edges (reduce noise)
    const filtered = edges.filter(e => e.strength > 0.3).sort((a, b) => a.y - b.y);
    console.log(`  → Found ${filtered.length} significant horizontal edges`);
    return filtered;
    
  } catch (error) {
    console.error("Edge detection failed:", error);
    return [];
  }
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
// UTILITY: IMAGE RESIZING FOR CLAUDE (Max 8000px per dimension)
// ============================================================================

const MAX_CLAUDE_DIMENSION = 7900; // Buffer under 8000px limit

async function resizeImageForClaude(
  imageBase64: string,
  mimeType: string,
  originalWidth: number,
  originalHeight: number
): Promise<{ base64: string; mimeType: string; scaleFactor: number; newWidth: number; newHeight: number }> {
  
  const maxDimension = Math.max(originalWidth, originalHeight);
  
  // If image fits within limits, return as-is
  if (maxDimension <= MAX_CLAUDE_DIMENSION) {
    console.log(`  → Image ${originalWidth}x${originalHeight} fits within Claude limits`);
    return {
      base64: imageBase64,
      mimeType,
      scaleFactor: 1,
      newWidth: originalWidth,
      newHeight: originalHeight
    };
  }
  
  // Calculate scale factor
  const scaleFactor = MAX_CLAUDE_DIMENSION / maxDimension;
  const newWidth = Math.round(originalWidth * scaleFactor);
  const newHeight = Math.round(originalHeight * scaleFactor);
  
  console.log(`  → Resizing image from ${originalWidth}x${originalHeight} to ${newWidth}x${newHeight} (scaleFactor: ${scaleFactor.toFixed(4)})`);
  
  // Use canvas-like approach with ImageMagick-style resize via a fetch to a service
  // Since Deno edge functions don't have native canvas, we'll use Lovable AI's image model
  // to resize by asking it to output the same image at smaller dimensions
  
  // Actually, for pure resizing, we should use a simpler approach
  // Use the built-in Deno image processing
  try {
    // Decode base64 to Uint8Array
    const binaryStr = atob(imageBase64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    
    // Use ImageScript for image resizing (Deno-compatible)
    const { Image } = await import("https://deno.land/x/imagescript@1.3.0/mod.ts");
    
    const image = await Image.decode(bytes);
    image.resize(newWidth, newHeight);
    
    // Encode back to JPEG (smaller file size for Claude)
    const resizedBytes = await image.encodeJPEG(85);
    
    // Convert to base64
    let binary = '';
    const chunkSize = 32768;
    for (let i = 0; i < resizedBytes.length; i += chunkSize) {
      const chunk = resizedBytes.subarray(i, Math.min(i + chunkSize, resizedBytes.length));
      binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
    }
    const resizedBase64 = btoa(binary);
    
    console.log(`  → Successfully resized image to ${newWidth}x${newHeight}, new base64 length: ${resizedBase64.length}`);
    
    return {
      base64: resizedBase64,
      mimeType: 'image/jpeg',
      scaleFactor,
      newWidth,
      newHeight
    };
    
  } catch (error) {
    console.error(`  → Image resize failed: ${error}`);
    // Fallback: return original and hope for the best
    // This shouldn't happen, but if it does, the Claude API will return 400
    return {
      base64: imageBase64,
      mimeType,
      scaleFactor: 1,
      newWidth: originalWidth,
      newHeight: originalHeight
    };
  }
}

// Scale raw vision data coordinates to match resized image
function scaleRawData(rawData: RawVisionData, scaleFactor: number): RawVisionData {
  if (scaleFactor === 1) return rawData;
  
  return {
    paragraphs: rawData.paragraphs.map(p => ({
      ...p,
      yTop: p.yTop * scaleFactor,
      yBottom: p.yBottom * scaleFactor,
      xLeft: p.xLeft * scaleFactor,
      xRight: p.xRight * scaleFactor,
      height: p.height * scaleFactor,
      width: p.width * scaleFactor
    })),
    objects: rawData.objects.map(o => ({
      ...o,
      yTop: o.yTop * scaleFactor,
      yBottom: o.yBottom * scaleFactor,
      xLeft: o.xLeft * scaleFactor,
      xRight: o.xRight * scaleFactor
    })),
    logos: rawData.logos.map(l => ({
      ...l,
      yTop: l.yTop * scaleFactor,
      yBottom: l.yBottom * scaleFactor,
      xLeft: l.xLeft * scaleFactor,
      xRight: l.xRight * scaleFactor
    })),
    edges: rawData.edges.map(e => ({
      ...e,
      y: e.y * scaleFactor
    })),
    imageWidth: rawData.imageWidth * scaleFactor,
    imageHeight: rawData.imageHeight * scaleFactor
  };
}

// Scale Claude's decision back to original image space
function scaleClaudeDecision(decision: ClaudeDecision, scaleFactor: number): ClaudeDecision {
  if (scaleFactor === 1) return decision;
  
  const inverseScale = 1 / scaleFactor;
  
  return {
    footerStartY: decision.footerStartY * inverseScale,
    sections: decision.sections.map(s => ({
      name: s.name,
      yTop: s.yTop * inverseScale,
      yBottom: s.yBottom * inverseScale,
      hasCTA: s.hasCTA,
      ctaText: s.ctaText,
      // Pass through horizontal split (gutterPositions are percentages, no scaling needed)
      horizontalSplit: s.horizontalSplit
    }))
  };
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

  // Format edge data for Claude
  const edgeData = rawData.edges.map(e => ({
    y: Math.round(e.y),
    strength: Math.round(e.strength * 100) / 100,
    colorAbove: e.colorAbove,
    colorBelow: e.colorBelow
  }));

  const prompt = `You are analyzing an email design screenshot to slice it into sections for use in Klaviyo email templates.

## CRITICAL CONTEXT: Why We're Slicing

Each slice becomes a SEPARATE CLICKABLE IMAGE in Klaviyo. This means:
- Each slice can only have ONE click destination (one URL)
- If there are 2 buttons visible, they MUST be in separate slices
- A slice containing multiple buttons is BROKEN - users can only click one link per image slice
- This is for email marketing - every CTA needs its own clickable area

## Image Dimensions
${rawData.imageWidth}x${rawData.imageHeight} pixels

## Raw OCR Data (Text Blocks with Coordinates)
${JSON.stringify(ocrData, null, 2)}

## Detected Objects
${JSON.stringify(objectData, null, 2)}

## Detected Logos
${JSON.stringify(logoData, null, 2)}

## Detected Horizontal Edges (Color Transitions)
${JSON.stringify(edgeData, null, 2)}

Each edge represents a Y coordinate where a significant horizontal color change occurs:
- "y": the pixel Y coordinate of the edge
- "strength": how dramatic the color change is (0-1)
- "colorAbove": average RGB color of the row above the edge
- "colorBelow": average RGB color of the row below the edge

---

## SLICING RULES

### RULE 0: SIDE-BY-SIDE CTAs = MANDATORY HORIZONTAL SPLIT (HIGHEST PRIORITY)

**This rule overrides all others. Missing a split = BROKEN EMAIL (users can only click one button).**

If you see TWO OR MORE buttons arranged HORIZONTALLY (side-by-side) with DIFFERENT text:
→ This section MUST have horizontalSplit enabled

**CRITICAL EXAMPLES requiring horizontal split:**
- [THE BLARE] [ON SALE NOW] → 2 columns, gutterPositions: [50]
- [SHOP MEN] [SHOP WOMEN] → 2 columns, gutterPositions: [50]
- [LEARN MORE] [BUY NOW] → 2 columns, gutterPositions: [50]
- [SHOP GOLDEN] [SHOP MWENDO] → 2 columns, gutterPositions: [50]
- Three products side-by-side with individual CTAs → 3 columns, gutterPositions: [33.33, 66.66]

**Detection:** Look for 2+ rectangular button shapes at the same Y-level with different text labels.
**Action:** Set horizontalSplit.columns = (number of buttons), gutterPositions at visual gaps between them.

**NEVER output a slice containing two distinct CTA buttons without a horizontal split.**

When in doubt about multiple side-by-side CTAs → USE horizontalSplit. It's better to over-split than under-split.
A false negative (missing a split) means users CANNOT CLICK one of the buttons - this breaks the email.

### RULE 1: EVERY BUTTON = SEPARATE SLICE (for vertically stacked buttons)

Each distinct CTA button MUST be its own slice when stacked vertically.

WRONG (broken - can't click both):
- One slice containing "SHOP HYDROGLYPH" and "SHOP PLANTA" buttons stacked vertically

CORRECT:
- Slice 1: Content + "SHOP HYDROGLYPH" button
- Slice 2: "SHOP PLANTA" button (with minimal context above/below)

If you see vertically stacked buttons like:
[SHOP NOW]
[LEARN MORE]
These are TWO slices, not one.

### RULE 2: What Stays TOGETHER in One Slice

Keep these as single units (as long as there's only ONE button):
- Hero section: headline + subheadline + image + ONE CTA button
- Product card: product image + name + price + ONE button
- Content block: headline + body text + ONE button
- Testimonial: quote + author name + photo (usually no button)
- Feature: icon + headline + description (usually no button)

### RULE 3: What Gets SEPARATED

Split these into multiple slices:
- Two or more buttons stacked vertically → each button = new slice
- Product grid where each product has its own CTA → one slice per product
- Side-by-side buttons → ALWAYS use horizontalSplit (Rule 0)
- Any section with multiple click destinations

### RULE 4: Slice Boundaries

- Cut in the CENTER of visual GAPS between sections (not at the edge of content)
- NEVER cut through: text blocks, images, logos, buttons, or faces
- Maintain 30-50px MINIMUM padding from any text bounding box
- Use horizontal edge data to find clean color transitions in the middle of gaps
- If no clear gap exists, prefer cutting ABOVE a section (more padding on top)
- Each slice should make sense as a standalone visual unit
- Typical email: 6-15 slices (more if there are many buttons)

### RULE 5: Text Padding/Safety Margins

When placing slice boundaries near text blocks, you MUST maintain visual breathing room:

**Minimum Padding Requirements:**
- NEVER place a slice boundary within 30px of a text block's yTop or yBottom
- Prefer 40-50px padding when whitespace allows
- Look for whitespace BETWEEN content sections, not at the edge of text

**How to Find Good Cut Points:**
1. Look at OCR data for text bounding boxes
2. Look at horizontal edges for color transitions
3. Find where edges occur in GAPS between text blocks (not near text edges)
4. Cut at the edge that is furthest from any text

**Examples of BAD slice placement:**
- Text bounding box: yTop=200, yBottom=280
- Slice at y=198 ❌ (too close to text top - only 2px)
- Slice at y=282 ❌ (too close to text bottom - only 2px)
- Slice at y=310 ❌ (only 30px below, but next text starts at y=340 - cut at 325 instead)

**Examples of GOOD slice placement:**
- Text bounding box: yTop=200, yBottom=280
- Next text block: yTop=340
- Slice at y=310 ✓ (center of the 60px gap between 280-340)
- If gap is small (40px), slice at center (y=300)

**When gaps are tight (< 60px between text blocks):**
- Cut in the EXACT CENTER of the available gap
- This ensures equal padding above and below the cut line

---

## FOOTER DETECTION - CRITICAL

The footer is the "utility section" at the bottom of the email. It contains navigation, legal info, and social links - NOT marketing content.

### Footer Starts at the FIRST of These (whichever appears first):

1. **Repeated brand logo** - The logo appearing again near the bottom
2. **Social media icons row** - Instagram, Facebook, TikTok, YouTube, etc.
3. **Navigation link stack** - Vertical list like:
   - Shop
   - About Us  
   - Contact
   - FAQ
4. **Horizontal nav links** - "Shop | About | Contact" or "Terms | Privacy | Unsubscribe"
5. **Certification badges row** - B Corp, Vegan, Cruelty Free, Climate Neutral, etc.
6. **"Follow us" or "Connect with us"** text
7. **Dense utility text block** - Terms, copyright, address all grouped together

### Footer Detection Examples:

| What You See | Footer Starts At |
|--------------|------------------|
| Social icons row above legal text | The social icons row |
| "SOFAS · ACCESSORIES · BEANBAGS" nav | That navigation row |
| Brand logo repeated + nav buttons below | The repeated logo |
| Badge row (Vegan, 100% Delicious, Cruelty Free) | The badge row |
| "ALL PRODUCTS / TAKE OUR QUIZ / CONTACT US" buttons | Those nav buttons |
| "Follow us on Instagram | Facebook | YouTube" | That "Follow us" text |

### Footer is NOT:

- Just the "Unsubscribe" link at the very bottom
- Just the copyright text
- Just the legal disclaimer

The footer is the entire utility section. Look for where "marketing content" ends and "utility/navigation content" begins.

### FOOTER BOUNDARY POSITIONING - CRITICAL

After you identify the first element of the footer (semantically), you must set footerStartY to the correct VISUAL boundary:

**If there's a hard edge (most common):**
Look at the "Detected Horizontal Edges" data. Find the edge with the highest Y value that is ABOVE the first footer element (within 150px). Use that edge's Y coordinate as footerStartY.

Example:
- You identify "OUR PRODUCTS" text at Y=1850 as the first footer element
- Edges data shows an edge at Y=1820 (strength 0.75)
- Set footerStartY = 1820 (the edge), NOT 1850 (the text bounding box)

**If there's a soft/gradient boundary (e.g., clouds, fades):**
Some footers don't have a hard line - they fade in with gradients or decorative elements. In this case:
- Look at the colorBelow values to identify the footer's main background color
- Set footerStartY where that background color stabilizes
- This may mean cutting through decorative gradient elements

**Rules:**
1. footerStartY should NEVER be at a text bounding box - always at a visual boundary above it
2. When a hard edge exists above the first footer text (within 150px), USE IT
3. Maximum lookback: 150px above the first footer element
4. If no edge found within 150px, use 10-20px above the first footer element's yTop

---

## COMMON PATTERNS

### Header Logo Section (1 slice) - CHECK FIRST!

If there's a brand logo in the TOP 200px of the email that appears:
- ABOVE and SEPARATE from the hero headline
- As a standalone element (not integrated with hero text)
- With a visible gap/whitespace between it and the content below

This MUST be its own slice:

[Brand Logo]
---------------- ← SLICE BOUNDARY (in the gap)
[Hero Headline]
[Hero Image + CTA]

→ TWO slices:
  - Slice 1: "header_logo" (yTop: 0, yBottom: center of gap below logo)
  - Slice 2: "hero_section" (the actual hero content below)

**Detection Hints:**
- Check "Detected Logos" data for logos with yTop < 200
- If logo is detected AND there's a clear whitespace gap before the main headline, separate them
- The logo section typically has a solid background color

**Why:** Header logos should link to brand homepage, while hero sections link to campaign-specific pages.

### Hero Section (1 slice)

[Headline] [Subheadline]
[Hero Image] [CTA Button]

→ All ONE slice (single click destination)
NOTE: If there's a separate logo ABOVE, it should be its own slice (see above)

### Dual CTA Section (2 slices)

[Headline] [Body text] [BUTTON 1] [BUTTON 2]

→ TWO slices:
  - Slice A: Headline + Body + Button 1
  - Slice B: Button 2

### Product Showcase (1 slice per product if each has CTA)

[Product 1 Image] [Product 2 Image] [Name + Price] [Name + Price] [SHOP NOW] [SHOP NOW]

→ If products are side-by-side with separate CTAs, this may need to be ONE slice (user will link to collection page) OR you note that horizontal splitting isn't possible

### Stacked Products (multiple slices)

[Product 1 Image] [Product 1 Name] [SHOP PRODUCT 1]

[Product 2 Image] [Product 2 Name]
[SHOP PRODUCT 2]

→ TWO slices (one per product)

### Pricing Grid (usually 1 slice)

[1 Pack - $20] [3 Pack - $50] [6 Pack - $90]

→ ONE slice (links to pricing page)

### Footer (1 slice OR excluded)

[Brand Logo] [Social Icons] [Nav Links] [Legal Text]

→ Usually ONE slice or excluded entirely via footerStartY

---

## OUTPUT FORMAT

Return ONLY a valid JSON object:

{
  "footerStartY": <number - Y pixel where footer section begins>,
  "sections": [
    {
      "name": "<descriptive name>",
      "yTop": <number>,
      "yBottom": <number>,
      "hasCTA": <boolean - true if this slice contains a button>,
      "ctaText": "<button text if hasCTA is true, otherwise null>",
      "horizontalSplit": null or { "columns": 2-6, "gutterPositions": [percentages] }
    }
  ]
}

### Output Rules:

1. First section MUST have yTop: 0
2. Last section's yBottom MUST equal footerStartY
3. Sections MUST NOT overlap
4. Each section's yBottom MUST equal the next section's yTop (no gaps)
5. Every button in the email must be in its own slice
6. footerStartY marks where utility content begins (see Footer Detection above)

### Example Output:

{
  "footerStartY": 2450,
  "sections": [
    { "name": "header_hero", "yTop": 0, "yBottom": 580, "hasCTA": true, "ctaText": "SHOP NOW", "horizontalSplit": null },
    { "name": "value_prop", "yTop": 580, "yBottom": 920, "hasCTA": false, "ctaText": null, "horizontalSplit": null },
    { "name": "product_row", "yTop": 920, "yBottom": 1180, "hasCTA": true, "ctaText": "SHOP NOW", "horizontalSplit": { "columns": 3, "gutterPositions": [33.33, 66.66] } },
    { "name": "testimonial", "yTop": 1180, "yBottom": 1460, "hasCTA": false, "ctaText": null, "horizontalSplit": null },
    { "name": "final_cta", "yTop": 1460, "yBottom": 1840, "hasCTA": true, "ctaText": "GET STARTED", "horizontalSplit": null },
    { "name": "pre_footer", "yTop": 1840, "yBottom": 2450, "hasCTA": false, "ctaText": null, "horizontalSplit": null }
  ]
}

---

## MULTI-COLUMN PRODUCT BLOCK DETECTION (RARE - USE SPARINGLY)

Most sections are single-column. ONLY flag as a multi-column block when you see a **complete product comparison section**.

### What is a Multi-Column Product Block?

A section where 2-6 products are displayed SIDE-BY-SIDE, and each product has:
- Its own product image
- Its own title/description  
- Its own CTA button

**CRITICAL**: The ENTIRE section (from product images down to CTAs) is ONE block split into columns. Do NOT slice row-by-row (images in one slice, CTAs in another).

### Visual Example:

┌─────────────────────────────────────┐
│ [Product A]     [Product B]         │ ← This entire
│  Title A         Title B            │   section is
│  Description...  Description...     │   ONE block
│  [SHOP A]        [SHOP B]           │   with 2 columns
└─────────────────────────────────────┘

**WRONG approach** (row-by-row slicing):
- Slice 1: Both product images → links to collection page  
- Slice 2: Both CTAs → ???

**CORRECT approach** (column slicing):
- Block with \`horizontalSplit: { columns: 2 }\` spanning full height
- Column 1: Product A image + title + CTA → links to Product A page
- Column 2: Product B image + title + CTA → links to Product B page

### Detection Criteria (ALL must be met):
1. **2-6 products arranged horizontally** (not stacked vertically)
2. **Each product is a complete unit** with image + text + CTA
3. **Products are visually separated** by gutters/whitespace
4. **Each product would link to a DIFFERENT destination**

### Block Boundary Rules:
- \`yTop\`: Top of the product images
- \`yBottom\`: Bottom of the CTA buttons (include ALL content for the products)
- The block should capture the COMPLETE product cards, not just one row

### When NOT to Flag as Multi-Column:
- Single product (even with multiple images of same product)
- Products stacked vertically (these are separate single-column slices)
- Hero images showing multiple items in one photo
- Navigation links or footer sections
- Badge/certification rows
- Social media icon rows
- Any row where items would logically share ONE link

### Output Format When Multi-Column Block is Detected:

{
  "name": "multi_product_block",
  "yTop": 1200,
  "yBottom": 1800,
  "hasCTA": true,
  "ctaText": "SHOP GOLDEN | SHOP MWENDO",
  "horizontalSplit": {
    "columns": 2,
    "gutterPositions": [50]
  }
}

### Column Gutter Position Rules (ALWAYS EVEN SPLITS):
- 2 columns: "gutterPositions": [50]
- 3 columns: "gutterPositions": [33.33, 66.66]
- 4 columns: "gutterPositions": [25, 50, 75]
- 5 columns: "gutterPositions": [20, 40, 60, 80]
- 6 columns: "gutterPositions": [16.67, 33.33, 50, 66.67, 83.33]

### Detection Hints from Data:
- Look for multiple similar objects at the same Y-level in "Detected Objects"
- Look for repeated price patterns (e.g., "$XX") at similar Y positions in OCR
- Look for vertical whitespace gaps that span the full height of the section
- Look for the CTA buttons - if there are 2+ CTAs side-by-side with different text (e.g., "SHOP GOLDEN" and "SHOP MWENDO"), this is a strong signal

CRITICAL: For side-by-side CTAs, you MUST use horizontal split. Missing a split = broken email where users can only click ONE button. When in doubt about multiple CTAs → SPLIT. Over-splitting is recoverable; under-splitting breaks functionality.

---

## FINAL CHECKLIST

Before returning your response, verify:

☐ **CRITICAL: No slice contains two or more clickable buttons without horizontalSplit**
☐ If side-by-side CTAs exist → horizontalSplit is set with correct column count
☐ If a logo exists in top 200px with a gap below it → it's sliced separately as "header_logo"
☐ Every visible button has its own slice or column
☐ footerStartY is at the START of utility content (not the bottom of the email)
☐ First section starts at yTop: 0
☐ Last section ends at footerStartY
☐ No gaps between sections
☐ No overlapping sections
☐ Cuts are in visual gaps, not through content
☐ Slice boundaries have 30+ px padding from nearest text block
☐ Cuts are in the CENTER of whitespace gaps, not at edges of content
☐ Horizontal split columns are always even (2-6, never 1)`;

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
      sections: (parsed.sections || []).map((s: any) => ({
        name: s.name || '',
        yTop: s.yTop,
        yBottom: s.yBottom,
        hasCTA: s.hasCTA ?? false,
        ctaText: s.ctaText ?? null,
        // Parse horizontal split if present
        horizontalSplit: s.horizontalSplit ? {
          columns: s.horizontalSplit.columns,
          gutterPositions: s.horizontalSplit.gutterPositions || []
        } : undefined
      }))
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

    // ========== RESIZE IMAGE FOR CLAUDE IF NEEDED ==========
    const resized = await resizeImageForClaude(imageBase64, mimeType, imageWidth, imageHeight);
    const scaleFactor = resized.scaleFactor;
    
    // ========== GATHER RAW DATA (Vision APIs in parallel on ORIGINAL image) ==========
    const [ocrResult, objects, logos] = await Promise.all([
      extractTextGeometry(imageBase64),
      detectObjects(imageBase64, imageHeight, imageWidth),
      detectLogos(imageBase64, imageHeight, imageWidth)
    ]);

    // ========== DETECT HORIZONTAL EDGES ON RESIZED IMAGE (matches Claude's coordinate space) ==========
    const edges = await detectHorizontalEdges(resized.base64, resized.newWidth, resized.newHeight);

    // Build raw data with Vision API results (original coordinates) + edges (resized coordinates)
    // Note: edges are already in resized coordinate space, will need inverse scaling applied
    const rawData: RawVisionData = {
      paragraphs: ocrResult.paragraphs,
      objects,
      logos,
      edges: edges.map(e => ({ ...e, y: e.y / scaleFactor })), // Convert edges to original space
      imageWidth,
      imageHeight
    };

    console.log(`Raw data gathered: ${rawData.paragraphs.length} paragraphs, ${rawData.objects.length} objects, ${rawData.logos.length} logos, ${rawData.edges.length} edges`);

    // ========== SCALE RAW DATA TO MATCH RESIZED IMAGE (if scaled) ==========
    const scaledRawData = scaleRawData(rawData, scaleFactor);
    if (scaleFactor !== 1) {
      console.log(`Scaled raw data coordinates by ${scaleFactor.toFixed(4)} to match resized image`);
    }

    // ========== ASK CLAUDE TO MAKE ALL DECISIONS (with resized image) ==========
    const claudeResult = await askClaude(resized.base64, resized.mimeType, scaledRawData);

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
          logoCount: rawData.logos.length,
          scaleFactor,
          originalDimensions: { width: imageWidth, height: imageHeight },
          claudeImageDimensions: { width: resized.newWidth, height: resized.newHeight }
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      });
    }

    // ========== SCALE CLAUDE'S DECISION BACK TO ORIGINAL IMAGE SPACE ==========
    const originalSpaceDecision = scaleClaudeDecision(claudeResult.decision, scaleFactor);
    if (scaleFactor !== 1) {
      console.log(`Scaled Claude's decision back to original image space (inverse scale: ${(1/scaleFactor).toFixed(4)})`);
    }
    
    // Convert Claude's sections directly to slices - NO MODIFICATIONS (except scaling)
    const slices: SliceOutput[] = originalSpaceDecision.sections.map(section => ({
      yTop: Math.round(section.yTop),
      yBottom: Math.round(section.yBottom),
      name: section.name,
      hasCTA: section.hasCTA,
      ctaText: section.ctaText,
      // Pass through horizontal split info
      horizontalSplit: section.horizontalSplit
    }));

    const processingTimeMs = Date.now() - startTime;

    const response: AutoSliceV2Response = {
      success: true,
      footerStartY: Math.round(originalSpaceDecision.footerStartY),
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
        edgeCount: rawData.edges.length,
        claudeSections: originalSpaceDecision.sections,
        scaleFactor,
        originalDimensions: { width: imageWidth, height: imageHeight },
        claudeImageDimensions: { width: resized.newWidth, height: resized.newHeight }
      }
    };

    console.log(`\n========== COMPLETE ==========`);
    console.log(`Claude decided: ${slices.length} slices, footer at ${originalSpaceDecision.footerStartY}px`);
    console.log(`Scale factor: ${scaleFactor} (original: ${imageWidth}x${imageHeight}, Claude saw: ${resized.newWidth}x${resized.newHeight})`);
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
