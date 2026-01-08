import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AutoDetectedSection {
  type: 'header' | 'hero' | 'product_grid' | 'cta' | 'text_block' | 'divider' | 'footer' | 'unknown';
  columns: 1 | 2 | 3 | 4;
  description: string;
  gutterPositions?: number[];
}

interface AutoSliceResult {
  slicePositions: number[];
  sections: AutoDetectedSection[];
  edgeCandidatesCount: number;
  confidence: number;
}

// Calculate variance of a number array
function calculateVariance(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squareDiffs = values.map(v => Math.pow(v - mean, 2));
  return squareDiffs.reduce((a, b) => a + b, 0) / values.length;
}

// Calculate adaptive threshold based on overall image variance
function calculateAdaptiveThreshold(rowVariances: number[]): number {
  if (rowVariances.length === 0) return 100;
  
  // Sort to find median
  const sorted = [...rowVariances].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  
  // Threshold at 20% of median, minimum 50
  return Math.max(50, median * 0.2);
}

// Group consecutive rows into single edge candidates
function groupConsecutiveRows(
  candidates: { row: number; variance: number }[],
  minGap: number = 10
): { row: number; variance: number }[] {
  if (candidates.length === 0) return [];
  
  const groups: { rows: number[]; variances: number[] }[] = [];
  let currentGroup = { rows: [candidates[0].row], variances: [candidates[0].variance] };
  
  for (let i = 1; i < candidates.length; i++) {
    if (candidates[i].row - candidates[i - 1].row <= minGap) {
      currentGroup.rows.push(candidates[i].row);
      currentGroup.variances.push(candidates[i].variance);
    } else {
      groups.push(currentGroup);
      currentGroup = { rows: [candidates[i].row], variances: [candidates[i].variance] };
    }
  }
  groups.push(currentGroup);
  
  // Return the middle row of each group with average variance
  return groups.map(g => ({
    row: g.rows[Math.floor(g.rows.length / 2)],
    variance: g.variances.reduce((a, b) => a + b, 0) / g.variances.length
  }));
}

// Select best distributed edges using greedy algorithm
function selectBestDistributedEdges(
  candidates: { row: number; variance: number }[],
  cutsNeeded: number,
  imageHeight: number
): number[] {
  if (candidates.length === 0) return [];
  if (candidates.length <= cutsNeeded) {
    return candidates.map(c => c.row).sort((a, b) => a - b);
  }
  
  // Sort by variance (lowest/cleanest first)
  const sortedByVariance = [...candidates].sort((a, b) => a.variance - b.variance);
  
  // Minimum distance between cuts for even distribution
  const minDistance = imageHeight / (cutsNeeded + 2);
  
  const selected: number[] = [];
  
  for (const candidate of sortedByVariance) {
    if (selected.length >= cutsNeeded) break;
    
    // Check if this candidate is far enough from already selected edges
    const isFarEnough = selected.every(s => Math.abs(candidate.row - s) >= minDistance);
    
    if (isFarEnough) {
      selected.push(candidate.row);
    }
  }
  
  // If we didn't get enough, relax the distance constraint
  if (selected.length < cutsNeeded) {
    for (const candidate of sortedByVariance) {
      if (selected.length >= cutsNeeded) break;
      if (!selected.includes(candidate.row)) {
        selected.push(candidate.row);
      }
    }
  }
  
  return selected.sort((a, b) => a - b);
}

// Detect horizontal edges by analyzing row variance
async function detectHorizontalEdges(
  imageData: Uint8Array,
  width: number,
  height: number,
  channels: number
): Promise<{ candidates: { row: number; variance: number }[]; threshold: number }> {
  const rowVariances: number[] = [];
  const rawCandidates: { row: number; variance: number }[] = [];
  
  // Calculate variance for each row
  for (let y = 0; y < height; y++) {
    const rowPixels: number[] = [];
    
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      // Convert to grayscale
      const gray = channels >= 3 
        ? (imageData[idx] * 0.299 + imageData[idx + 1] * 0.587 + imageData[idx + 2] * 0.114)
        : imageData[idx];
      rowPixels.push(gray);
    }
    
    const variance = calculateVariance(rowPixels);
    rowVariances.push(variance);
  }
  
  // Calculate adaptive threshold
  const threshold = calculateAdaptiveThreshold(rowVariances);
  
  // Find candidate rows (low variance = solid color = potential cut)
  for (let y = 0; y < height; y++) {
    if (rowVariances[y] < threshold) {
      rawCandidates.push({ row: y, variance: rowVariances[y] });
    }
  }
  
  // Group consecutive rows
  const candidates = groupConsecutiveRows(rawCandidates);
  
  // Filter out edges too close to top/bottom (within 5%)
  const minY = height * 0.05;
  const maxY = height * 0.95;
  const filtered = candidates.filter(c => c.row > minY && c.row < maxY);
  
  return { candidates: filtered, threshold };
}

// Detect vertical gutters within a region for multi-column layouts
function detectVerticalGutters(
  imageData: Uint8Array,
  width: number,
  height: number,
  channels: number,
  yStart: number,
  yEnd: number,
  columnsNeeded: number
): number[] {
  if (columnsNeeded <= 1) return [];
  
  const guttersNeeded = columnsNeeded - 1;
  const colVariances: { col: number; variance: number }[] = [];
  
  // Scan each column within the region
  for (let x = 0; x < width; x++) {
    const colPixels: number[] = [];
    
    for (let y = yStart; y < yEnd && y < height; y++) {
      const idx = (y * width + x) * channels;
      const gray = channels >= 3 
        ? (imageData[idx] * 0.299 + imageData[idx + 1] * 0.587 + imageData[idx + 2] * 0.114)
        : imageData[idx];
      colPixels.push(gray);
    }
    
    const variance = calculateVariance(colPixels);
    colVariances.push({ col: x, variance });
  }
  
  // Find low-variance columns (gutters)
  const sorted = [...colVariances].sort((a, b) => a.variance - b.variance);
  const threshold = calculateAdaptiveThreshold(colVariances.map(c => c.variance));
  
  const candidates = sorted.filter(c => c.variance < threshold);
  
  // Group consecutive columns
  const groups: { cols: number[]; avgVariance: number }[] = [];
  let currentGroup: number[] = [];
  let currentVariances: number[] = [];
  
  for (const c of candidates.sort((a, b) => a.col - b.col)) {
    if (currentGroup.length === 0 || c.col - currentGroup[currentGroup.length - 1] <= 10) {
      currentGroup.push(c.col);
      currentVariances.push(c.variance);
    } else {
      if (currentGroup.length > 0) {
        groups.push({ 
          cols: currentGroup, 
          avgVariance: currentVariances.reduce((a, b) => a + b, 0) / currentVariances.length 
        });
      }
      currentGroup = [c.col];
      currentVariances = [c.variance];
    }
  }
  if (currentGroup.length > 0) {
    groups.push({ 
      cols: currentGroup, 
      avgVariance: currentVariances.reduce((a, b) => a + b, 0) / currentVariances.length 
    });
  }
  
  // Select best distributed gutters
  const minGutterDistance = width / (columnsNeeded + 1);
  const selected: number[] = [];
  
  const sortedGroups = groups.sort((a, b) => a.avgVariance - b.avgVariance);
  
  for (const group of sortedGroups) {
    if (selected.length >= guttersNeeded) break;
    
    const midCol = group.cols[Math.floor(group.cols.length / 2)];
    const isFarEnough = selected.every(s => Math.abs(midCol - s) >= minGutterDistance);
    
    if (isFarEnough) {
      selected.push(midCol);
    }
  }
  
  // Fallback: equal division if not enough gutters detected
  if (selected.length < guttersNeeded) {
    const equalGutters: number[] = [];
    for (let i = 1; i <= guttersNeeded; i++) {
      equalGutters.push(Math.round((width * i) / columnsNeeded));
    }
    return equalGutters.map(x => (x / width) * 100);
  }
  
  // Convert to percentages
  return selected.sort((a, b) => a - b).map(x => (x / width) * 100);
}

// Get semantic analysis from AI (NO coordinates)
async function getSemanticAnalysis(imageDataUrl: string): Promise<{ sectionCount: number; sections: AutoDetectedSection[] }> {
  const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
  
  if (!lovableApiKey) {
    console.error('LOVABLE_API_KEY not set');
    return { sectionCount: 1, sections: [{ type: 'unknown', columns: 1, description: 'Full email' }] };
  }
  
  const prompt = `Analyze this email marketing image.

DO NOT provide any coordinates, percentages, or pixel positions.

Instead, answer these questions:
1. How many distinct content sections are there? (Count them: header, hero, product area, CTA, footer, etc.)
2. For each section (top to bottom), provide:
   - type: "header" | "hero" | "product_grid" | "cta" | "text_block" | "divider" | "footer"
   - columns: 1, 2, 3, or 4 (for product grids with multiple items side by side)
   - description: Brief description (e.g., "3-product showcase")

Important:
- Count ONLY visually distinct sections separated by clear boundaries
- A "product_grid" with multiple products side-by-side is ONE section with columns > 1
- Headers, navigation bars count as sections
- Footers with social links, unsubscribe text count as ONE section

Return ONLY valid JSON, no other text:
{
  "sectionCount": 5,
  "sections": [
    { "type": "header", "columns": 1, "description": "Logo banner" },
    { "type": "hero", "columns": 1, "description": "Main promotional image with headline" },
    { "type": "product_grid", "columns": 3, "description": "3-product showcase" },
    { "type": "cta", "columns": 1, "description": "Shop now button" },
    { "type": "footer", "columns": 1, "description": "Social links and unsubscribe" }
  ]
}`;

  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageDataUrl } }
          ]
        }],
        max_tokens: 1500,
      }),
    });

    if (!response.ok) {
      console.error('AI API error:', response.status, await response.text());
      return { sectionCount: 1, sections: [{ type: 'unknown', columns: 1, description: 'Full email' }] };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('No JSON found in AI response:', content);
      return { sectionCount: 1, sections: [{ type: 'unknown', columns: 1, description: 'Full email' }] };
    }
    
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      sectionCount: parsed.sectionCount || parsed.sections?.length || 1,
      sections: parsed.sections || [{ type: 'unknown', columns: 1, description: 'Full email' }]
    };
  } catch (error) {
    console.error('Error getting semantic analysis:', error);
    return { sectionCount: 1, sections: [{ type: 'unknown', columns: 1, description: 'Full email' }] };
  }
}

// Decode image from base64 data URL (supports PNG and JPEG)
async function decodeImage(dataUrl: string): Promise<{ data: Uint8Array; width: number; height: number; channels: number }> {
  const base64Match = dataUrl.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/);
  if (!base64Match) {
    throw new Error('Invalid image data URL format');
  }
  
  const imageType = base64Match[1];
  const base64Data = base64Match[2];
  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  if (imageType === 'png') {
    // Use @img/png for PNG decoding
    const { decode } = await import("https://deno.land/x/pngs@0.1.1/mod.ts");
    const decoded = decode(bytes);
    return {
      data: new Uint8Array(decoded.image),
      width: decoded.width,
      height: decoded.height,
      channels: 4 // RGBA
    };
  } else {
    // For JPEG, use a simpler approach - decode to canvas conceptually
    // Since Deno doesn't have native JPEG decoding easily available,
    // we'll use a workaround: return dimensions from JPEG header and skip pixel analysis
    // Or use an available JPEG library
    
    // Try using jpeg-js equivalent for Deno
    try {
      const { decode } = await import("https://deno.land/x/jpegts@1.1/mod.ts");
      const decoded = decode(bytes);
      return {
        data: new Uint8Array(decoded.data),
        width: decoded.width,
        height: decoded.height,
        channels: 4
      };
    } catch (e) {
      console.error('JPEG decoding failed, using fallback:', e);
      // Fallback: extract dimensions from JPEG header
      const dims = getJpegDimensions(bytes);
      return {
        data: new Uint8Array(0), // Empty - will use fallback slicing
        width: dims.width,
        height: dims.height,
        channels: 0
      };
    }
  }
}

// Extract JPEG dimensions from header
function getJpegDimensions(data: Uint8Array): { width: number; height: number } {
  let offset = 2; // Skip SOI marker
  while (offset < data.length) {
    if (data[offset] !== 0xFF) break;
    const marker = data[offset + 1];
    if (marker === 0xC0 || marker === 0xC2) {
      // SOF0 or SOF2
      const height = (data[offset + 5] << 8) | data[offset + 6];
      const width = (data[offset + 7] << 8) | data[offset + 8];
      return { width, height };
    }
    const length = (data[offset + 2] << 8) | data[offset + 3];
    offset += 2 + length;
  }
  return { width: 600, height: 2000 }; // Fallback dimensions
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageDataUrl } = await req.json();
    
    if (!imageDataUrl) {
      return new Response(
        JSON.stringify({ error: 'imageDataUrl is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Starting automatic slice detection...');

    // 1. Decode image
    let decoded: { data: Uint8Array; width: number; height: number; channels: number };
    try {
      decoded = await decodeImage(imageDataUrl);
      console.log(`Decoded image: ${decoded.width}x${decoded.height}, ${decoded.channels} channels`);
    } catch (e) {
      console.error('Image decode error:', e);
      // Return fallback result
      const semanticAnalysis = await getSemanticAnalysis(imageDataUrl);
      const evenSlices = Array.from(
        { length: semanticAnalysis.sectionCount - 1 }, 
        (_, i) => ((i + 1) / semanticAnalysis.sectionCount) * 100
      );
      
      return new Response(
        JSON.stringify({
          slicePositions: evenSlices,
          sections: semanticAnalysis.sections,
          edgeCandidatesCount: 0,
          confidence: 0.3
        } as AutoSliceResult),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Detect horizontal edges (CV) - only if we have pixel data
    let edgeCandidates: { row: number; variance: number }[] = [];
    let threshold = 100;
    
    if (decoded.channels > 0 && decoded.data.length > 0) {
      const edgeResult = await detectHorizontalEdges(
        decoded.data, 
        decoded.width, 
        decoded.height, 
        decoded.channels
      );
      edgeCandidates = edgeResult.candidates;
      threshold = edgeResult.threshold;
      console.log(`Found ${edgeCandidates.length} edge candidates (threshold: ${threshold.toFixed(1)})`);
    }

    // 3. Get semantic analysis from AI (NO coordinates)
    const semanticAnalysis = await getSemanticAnalysis(imageDataUrl);
    console.log(`AI detected ${semanticAnalysis.sectionCount} sections`);

    // 4. Snap to edges
    const cutsNeeded = semanticAnalysis.sectionCount - 1;
    let sliceRows: number[];
    
    if (edgeCandidates.length > 0 && cutsNeeded > 0) {
      sliceRows = selectBestDistributedEdges(edgeCandidates, cutsNeeded, decoded.height);
    } else {
      // Fallback: even distribution
      sliceRows = Array.from(
        { length: cutsNeeded },
        (_, i) => Math.round((decoded.height * (i + 1)) / semanticAnalysis.sectionCount)
      );
    }

    // Convert to percentages
    const slicePositions = sliceRows.map(row => (row / decoded.height) * 100);
    console.log(`Slice positions (Y%): ${slicePositions.map(p => p.toFixed(1)).join(', ')}`);

    // 5. Detect vertical gutters for multi-column sections
    const sectionsWithGutters: AutoDetectedSection[] = [];
    const allPositions = [0, ...slicePositions, 100];
    
    for (let i = 0; i < semanticAnalysis.sections.length && i < allPositions.length - 1; i++) {
      const section = semanticAnalysis.sections[i];
      const startPercent = allPositions[i];
      const endPercent = allPositions[i + 1];
      
      let gutterPositions: number[] | undefined;
      
      if (section.columns > 1 && decoded.channels > 0 && decoded.data.length > 0) {
        const yStart = Math.round((startPercent / 100) * decoded.height);
        const yEnd = Math.round((endPercent / 100) * decoded.height);
        
        gutterPositions = detectVerticalGutters(
          decoded.data,
          decoded.width,
          decoded.height,
          decoded.channels,
          yStart,
          yEnd,
          section.columns
        );
        
        console.log(`Section ${i} (${section.type}, ${section.columns} cols) gutters: ${gutterPositions?.map(g => g.toFixed(1)).join(', ') || 'none'}`);
      }
      
      sectionsWithGutters.push({
        ...section,
        gutterPositions
      });
    }

    // 6. Calculate confidence
    const edgeMatchQuality = edgeCandidates.length >= cutsNeeded ? 1 : edgeCandidates.length / Math.max(cutsNeeded, 1);
    const confidence = decoded.channels > 0 
      ? Math.min(0.95, 0.5 + (edgeMatchQuality * 0.45))
      : 0.3;

    const result: AutoSliceResult = {
      slicePositions,
      sections: sectionsWithGutters,
      edgeCandidatesCount: edgeCandidates.length,
      confidence
    };

    console.log(`Auto-slice complete. Confidence: ${(confidence * 100).toFixed(0)}%`);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Auto-slice error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
