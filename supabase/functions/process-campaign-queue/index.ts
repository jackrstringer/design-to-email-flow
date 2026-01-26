import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProcessRequest {
  campaignQueueId: string;
}

// Transform Cloudinary URL to include resize parameters (server-side, zero memory)
function getResizedCloudinaryUrl(url: string, maxWidth: number, maxHeight: number): string {
  if (!url || !url.includes('cloudinary.com/')) return url;
  
  const uploadIndex = url.indexOf('/upload/');
  if (uploadIndex === -1) return url;
  
  const before = url.substring(0, uploadIndex + 8); // includes '/upload/'
  const after = url.substring(uploadIndex + 8);
  
  // c_limit preserves aspect ratio and only shrinks if larger than limits
  return `${before}c_limit,w_${maxWidth},h_${maxHeight}/${after}`;
}

// Generate Cloudinary crop URL (server-side cropping, zero memory)
function getCloudinaryCropUrl(url: string, x: number, y: number, w: number, h: number): string {
  if (!url || !url.includes('cloudinary.com/')) return url;
  
  const uploadIndex = url.indexOf('/upload/');
  if (uploadIndex === -1) return url;
  
  const before = url.substring(0, uploadIndex + 8); // includes '/upload/'
  const after = url.substring(uploadIndex + 8);
  
  // Round all values to integers for Cloudinary
  const rx = Math.round(x);
  const ry = Math.round(y);
  const rw = Math.round(w);
  const rh = Math.round(h);
  
  return `${before}c_crop,x_${rx},y_${ry},w_${rw},h_${rh}/${after}`;
}

// Helper to update campaign queue status
async function updateQueueItem(
  supabase: any,
  id: string,
  updates: Record<string, unknown>
) {
  const { error } = await supabase
    .from('campaign_queue')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);
  
  if (error) {
    console.error('[process] Failed to update queue item:', error);
  }
}

// Memory-efficient chunked base64 conversion (avoids stack overflow on large images)
function chunkedArrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 32768; // 32KB chunks
  let result = '';
  
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    result += String.fromCharCode.apply(null, Array.from(chunk));
  }
  
  return btoa(result);
}

// Helper to parse actual image dimensions from base64 header (PNG or JPEG)
function getImageDimensions(base64: string): { width: number; height: number } | null {
  const bytesToDecode = Math.min(base64.length, 50000);
  const binaryStr = atob(base64.substring(0, bytesToDecode));
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  
  // PNG: Check magic bytes and read IHDR chunk
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
    const width = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
    const height = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
    return { width, height };
  }
  
  // JPEG: Find SOF0 or SOF2 marker to get dimensions
  if (bytes[0] === 0xFF && bytes[1] === 0xD8) {
    let offset = 2;
    while (offset < bytes.length - 10) {
      if (bytes[offset] !== 0xFF) { offset++; continue; }
      const marker = bytes[offset + 1];
      if (marker === 0xC0 || marker === 0xC2) {
        const height = (bytes[offset + 5] << 8) | bytes[offset + 6];
        const width = (bytes[offset + 7] << 8) | bytes[offset + 8];
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
  return null;
}

// Step 1: Fetch image from URL - returns ACTUAL dimensions from image headers
// Returns: imageBase64ForAI (resized for Claude) + imageUrl (original for Cloudinary cropping)
// CRITICAL: Parses actual dimensions from image headers to fix coordinate scaling bugs
async function fetchAndUploadImage(
  supabase: any,
  item: any
): Promise<{ 
  imageUrl: string; 
  imageBase64ForAI: string;
  actualOriginalWidth: number;
  actualOriginalHeight: number;
  actualAIWidth: number;
  actualAIHeight: number;
} | null> {
  console.log('[process] Step 1: Fetching images and parsing actual dimensions...');

  if (item.image_url) {
    try {
      // 1. Fetch ORIGINAL image header to get actual dimensions (first ~50KB via Range request)
      const originalResponse = await fetch(item.image_url, {
        headers: { 'Range': 'bytes=0-50000' }
      });
      if (!originalResponse.ok) throw new Error('Failed to fetch original image header');
      const originalBuffer = await originalResponse.arrayBuffer();
      const originalBase64 = chunkedArrayBufferToBase64(originalBuffer);
      let originalDims = getImageDimensions(originalBase64);
      
      if (!originalDims) {
        console.error('[process] Could not parse original image dimensions, using DB values');
        originalDims = { width: item.image_width || 600, height: item.image_height || 2000 };
      }
      
      console.log('[process] ACTUAL original dimensions:', originalDims.width, 'x', originalDims.height);
      console.log('[process] DB dimensions:', item.image_width, 'x', item.image_height);
      if (originalDims.width !== item.image_width || originalDims.height !== item.image_height) {
        console.warn('[process] ⚠️ DIMENSION MISMATCH! Using actual dimensions from image header.');
      }

      // 2. Fetch AI-sized image
      const aiResizedUrl = getResizedCloudinaryUrl(item.image_url, 600, 5000);
      console.log('[process] AI-sized URL:', aiResizedUrl.substring(0, 80) + '...');
      
      const aiResponse = await fetch(aiResizedUrl);
      if (!aiResponse.ok) throw new Error('Failed to fetch AI-sized image');
      const aiBuffer = await aiResponse.arrayBuffer();
      const aiBase64 = chunkedArrayBufferToBase64(aiBuffer);
      
      // 3. Parse ACTUAL AI dimensions from the fetched image header
      const aiDims = getImageDimensions(aiBase64);
      if (!aiDims) throw new Error('Could not parse AI image dimensions');
      
      console.log('[process] Actual AI dimensions:', aiDims.width, 'x', aiDims.height);
      console.log('[process] Fetched AI-sized:', Math.round(aiBuffer.byteLength / 1024), 'KB');
      
      return { 
        imageUrl: item.image_url,
        imageBase64ForAI: aiBase64,
        actualOriginalWidth: originalDims.width,
        actualOriginalHeight: originalDims.height,
        actualAIWidth: aiDims.width,
        actualAIHeight: aiDims.height
      };
    } catch (err) {
      console.error('[process] Failed to fetch image:', err);
      return null;
    }
  }

  console.error('[process] No image_url found on queue item');
  return null;
}

// Step 1.5: Start early SL/PT generation immediately (matches CampaignCreator.startEarlyGeneration)
async function startEarlyGeneration(
  supabase: any,
  imageUrl: string,
  brandContext: { name: string; domain: string } | null,
  brandId: string | null,
  copyExamples: any
): Promise<string> {
  const sessionKey = crypto.randomUUID();
  console.log('[process] Step 1.5: Starting early SL/PT generation, session:', sessionKey);

  try {
    // CRITICAL: Resize image URL for Anthropic (max 600x5000 to stay under 5MB base64 limit)
    const resizedImageUrl = getResizedCloudinaryUrl(imageUrl, 600, 5000);
    console.log('[process] Early gen using resized URL:', resizedImageUrl.substring(0, 80) + '...');
    
    // Fire and forget - matches manual flow exactly
    const earlyGenUrl = Deno.env.get('SUPABASE_URL') + '/functions/v1/generate-email-copy-early';
    fetch(earlyGenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
      },
      body: JSON.stringify({
        sessionKey,
        imageUrl: resizedImageUrl, // Use resized URL
        brandContext: brandContext || { name: 'Unknown', domain: null },
        brandId: brandId || null,
        copyExamples: copyExamples || null
      })
    }).catch(err => console.log('[process] Early generation triggered:', err?.message || 'ok'));

    console.log('[process] Early generation fired for session:', sessionKey);
  } catch (err) {
    console.error('[process] Error starting early generation:', err);
  }

  return sessionKey;
}

// Step 2: Detect brand from image
async function detectBrand(
  supabase: any,
  imageBase64: string
): Promise<string | null> {
  console.log('[process] Step 2: Detecting brand...');

  try {
    // Get existing brands for matching
    const { data: brands } = await supabase
      .from('brands')
      .select('id, name, domain, primary_color');

    const existingBrands = brands || [];

    const detectUrl = Deno.env.get('SUPABASE_URL') + '/functions/v1/detect-brand-from-image';
    const response = await fetch(detectUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
      },
      body: JSON.stringify({
        imageDataUrls: [`data:image/png;base64,${imageBase64}`],
        existingBrands
      })
    });

    if (!response.ok) {
      console.error('[process] Brand detection failed:', await response.text());
      return null;
    }

    const result = await response.json();
    
    // If matched existing brand
    if (result.matchedBrandId) {
      console.log('[process] Matched existing brand:', result.matchedBrandId);
      return result.matchedBrandId;
    }

    // If new brand detected, could create it here
    // For now, just log and return null
    if (result.name) {
      console.log('[process] New brand detected:', result.name, result.url);
      // TODO: Auto-create brand or leave for manual setup
    }

    return null;

  } catch (err) {
    console.error('[process] Brand detection error:', err);
    return null;
  }
}

// Step 3: Auto-slice the image
// Returns analyzed dimensions (what Claude actually saw) for coordinate scaling
async function autoSliceImage(
  imageBase64: string,
  imageWidth: number,
  imageHeight: number
): Promise<{ slices: any[]; footerStartPercent: number; analyzedWidth: number; analyzedHeight: number } | null> {
  console.log('[process] Step 3: Auto-slicing image...');

  try {
    const sliceUrl = Deno.env.get('SUPABASE_URL') + '/functions/v1/auto-slice-v2';
    const response = await fetch(sliceUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
      },
      body: JSON.stringify({
        imageDataUrl: `data:image/png;base64,${imageBase64}`,
        imageWidth,
        imageHeight
      })
    });

    if (!response.ok) {
      console.error('[process] Auto-slice failed:', await response.text());
      return null;
    }

    const result = await response.json();
    
    if (!result.success) {
      console.error('[process] Auto-slice unsuccessful:', result.error);
      return null;
    }

    const footerStartPercent = result.footerStartY / result.imageHeight * 100;
    
    // CRITICAL: Capture the actual dimensions Claude analyzed (e.g., 454x5000 after c_limit resize)
    const analyzedWidth = result.imageWidth;
    const analyzedHeight = result.imageHeight;
    
    console.log('[process] Found', result.slices?.length || 0, 'slices');
    console.log('[process] Analyzed dimensions (Claude saw):', analyzedWidth, 'x', analyzedHeight);
    console.log('[process] Original dimensions (for cropping):', imageWidth, 'x', imageHeight);
    
    return {
      slices: result.slices || [],
      footerStartPercent,
      analyzedWidth,
      analyzedHeight
    };

  } catch (err) {
    console.error('[process] Auto-slice error:', err);
    return null;
  }
}

// Step 3.5: Generate slice URLs via Cloudinary server-side cropping (ZERO memory usage)
// Uses Cloudinary URL transformations instead of downloading/decoding/re-uploading
// CRITICAL: Scales coordinates from analyzed-image-space to original-image-space
async function cropSlicesViaCloudinary(
  originalImageUrl: string,
  sliceBoundaries: any[],
  originalWidth: number,
  originalHeight: number,
  analyzedWidth: number,
  analyzedHeight: number
): Promise<any[]> {
  console.log('[process] Step 3.5: Generating slice URLs via Cloudinary transformations (zero memory)...');
  console.log('[process] Original dimensions (for cropping):', originalWidth, 'x', originalHeight);
  console.log('[process] Analyzed dimensions (from AI):', analyzedWidth, 'x', analyzedHeight);

  // Calculate scale factors to map AI coordinates to original image
  const scaleX = originalWidth / analyzedWidth;
  const scaleY = originalHeight / analyzedHeight;
  console.log('[process] Scale factors: X=', scaleX.toFixed(3), 'Y=', scaleY.toFixed(3));

  const uploadedSlices: any[] = [];
  let globalRowIndex = 0;

  for (let i = 0; i < sliceBoundaries.length; i++) {
    const slice = sliceBoundaries[i];
    
    // CRITICAL: Scale Y coordinates from analyzed-image-space to original-image-space
    const yTop = Math.round(slice.yTop * scaleY);
    const yBottom = Math.round(slice.yBottom * scaleY);
    const sliceHeight = yBottom - yTop;

    // Check for horizontal split
    if (slice.horizontalSplit && slice.horizontalSplit.columns > 1) {
      const { columns, gutterPositions } = slice.horizontalSplit;
      
      console.log(`[process] Slice ${i + 1}: Horizontal split into ${columns} columns`);
      
      // Calculate column boundaries in analyzed-image-space pixels, then scale to original
      const analyzedXBoundaries = [
        0,
        ...(gutterPositions || []).map((p: number) => Math.round(analyzedWidth * p / 100)),
        analyzedWidth
      ];

      // Generate Cloudinary crop URL for each column
      for (let col = 0; col < columns; col++) {
        // Scale X coordinates from analyzed-image-space to original-image-space
        const xLeft = Math.round(analyzedXBoundaries[col] * scaleX);
        const xRight = Math.round(analyzedXBoundaries[col + 1] * scaleX);
        const colWidth = xRight - xLeft;

        console.log(`[process] Column ${col + 1}/${columns}: x=${xLeft}, y=${yTop}, w=${colWidth}, h=${sliceHeight} (scaled from analyzed y=${slice.yTop})`);

        const croppedUrl = getCloudinaryCropUrl(originalImageUrl, xLeft, yTop, colWidth, sliceHeight);

        uploadedSlices.push({
          ...slice,
          imageUrl: croppedUrl,
          dataUrl: null, // Will be populated on-demand for analysis
          width: colWidth,
          height: sliceHeight,
          // Store ORIGINAL coordinates for future reference
          yTop: yTop,
          yBottom: yBottom,
          startPercent: (yTop / originalHeight) * 100,
          endPercent: (yBottom / originalHeight) * 100,
          type: slice.hasCTA ? 'cta' : 'image',
          column: col,
          totalColumns: columns,
          rowIndex: globalRowIndex,
        });
      }
    } else {
      // Single column (existing behavior)
      console.log(`[process] Slice ${i + 1}: Single column, y=${yTop}, h=${sliceHeight}, w=${originalWidth} (scaled from analyzed y=${slice.yTop})`);

      const croppedUrl = getCloudinaryCropUrl(originalImageUrl, 0, yTop, originalWidth, sliceHeight);
      
      uploadedSlices.push({
        ...slice,
        imageUrl: croppedUrl,
        dataUrl: null, // Will be populated on-demand for analysis
        width: originalWidth,
        height: sliceHeight,
        // Store ORIGINAL coordinates for future reference
        yTop: yTop,
        yBottom: yBottom,
        startPercent: (yTop / originalHeight) * 100,
        endPercent: (yBottom / originalHeight) * 100,
        type: slice.hasCTA ? 'cta' : 'image',
        column: 0,
        totalColumns: 1,
        rowIndex: globalRowIndex,
      });
    }
    
    globalRowIndex++;
  }

  console.log('[process] Generated', uploadedSlices.length, 'slice URLs via Cloudinary');
  return uploadedSlices;
}

// Fetch slice data URLs for analysis (small versions, on-demand)
// NOTE: Slices now have coordinates in original-image-space (already scaled by cropSlicesViaCloudinary)
async function fetchSliceDataUrlsForAnalysis(
  slices: any[],
  originalImageUrl: string,
  originalWidth: number,
  originalHeight: number
): Promise<any[]> {
  console.log('[process] Fetching slice dataUrls for analysis...');
  console.log('[process] Original image dimensions:', originalWidth, 'x', originalHeight);
  
  // Calculate the scale factor to resize for AI analysis (5000px max to stay under 5MB base64)
  const aiMaxHeight = 5000;
  const scale = originalHeight > aiMaxHeight ? aiMaxHeight / originalHeight : 1;
  const aiWidth = Math.round(originalWidth * scale);
  const aiHeight = Math.round(originalHeight * scale);
  
  console.log(`[process] AI analysis scale factor: ${scale.toFixed(3)}, AI dimensions: ${aiWidth}x${aiHeight}`);
  
  const fetchPromises = slices.map(async (slice, i) => {
    try {
      // Slice coordinates are already in original-image-space
      // Scale them to AI-analysis-space for the resized image crop
      const scaledY = Math.round(slice.yTop * scale);
      const scaledH = Math.round((slice.yBottom - slice.yTop) * scale);
      const scaledW = Math.round(slice.width * scale);
      
      // For multi-column slices, calculate X position based on column index and width
      // The slice.width is already in original-image-space
      let originalX = 0;
      if (slice.totalColumns > 1 && slice.column > 0) {
        // Parse X from the imageUrl crop parameters, or calculate from column position
        // Since we don't have explicit xLeft stored, derive from startPercent of previous columns
        // Actually, we can extract from the imageUrl's crop params
        const cropMatch = slice.imageUrl?.match(/c_crop,x_(\d+),y_(\d+)/);
        if (cropMatch) {
          originalX = parseInt(cropMatch[1], 10);
        }
      }
      const scaledX = Math.round(originalX * scale);
      
      // Get resized image URL first, then apply crop
      const resizedUrl = getResizedCloudinaryUrl(originalImageUrl, aiWidth, aiHeight);
      const cropUrl = getCloudinaryCropUrl(resizedUrl, scaledX, scaledY, scaledW, scaledH);
      
      const response = await fetch(cropUrl);
      if (!response.ok) {
        console.error(`[process] Failed to fetch slice ${i} dataUrl, status: ${response.status}`);
        return { ...slice, dataUrl: null };
      }
      
      // Use actual content-type from Cloudinary response (fixes JPEG/PNG mismatch)
      const contentType = response.headers.get('content-type') ?? 'image/png';
      const mime = contentType.split(';')[0]; // Strip charset if present
      
      const buffer = await response.arrayBuffer();
      const base64 = chunkedArrayBufferToBase64(buffer);
      const dataUrl = `data:${mime};base64,${base64}`;
      
      return { ...slice, dataUrl };
    } catch (err) {
      console.error(`[process] Error fetching slice ${i} dataUrl:`, err);
      return { ...slice, dataUrl: null };
    }
  });
  
  return Promise.all(fetchPromises);
}

// Step 4: Analyze slices for alt text and links (uses cropped slice dataUrls)
async function analyzeSlices(
  slices: any[],
  fullImageUrl: string, // Cloudinary URL (will be resized for AI)
  brandDomain: string | null,
  imageWidth: number,
  imageHeight: number
): Promise<any[] | null> {
  console.log('[process] Step 4: Analyzing slices for alt text and links...');

  try {
    const analyzeUrl = Deno.env.get('SUPABASE_URL') + '/functions/v1/analyze-slices';
    
    // Resize the full image URL for AI processing (keep under 5MB base64 limit)
    const resizedFullImageUrl = getResizedCloudinaryUrl(fullImageUrl, 600, 5000);
    console.log('[process] Using resized URL for analysis:', resizedFullImageUrl.substring(0, 80) + '...');
    
    // Fetch the resized image and convert to base64 for the analyze-slices function
    const imageResponse = await fetch(resizedFullImageUrl);
    if (!imageResponse.ok) {
      console.error('[process] Failed to fetch resized image for analysis');
      return null;
    }
    
    // Use actual content-type from Cloudinary response (fixes JPEG/PNG mismatch)
    const contentType = imageResponse.headers.get('content-type') ?? 'image/png';
    const mime = contentType.split(';')[0]; // Strip charset if present
    
    const imageBuffer = await imageResponse.arrayBuffer();
    const imageBase64 = chunkedArrayBufferToBase64(imageBuffer);
    const fullImageDataUrl = `data:${mime};base64,${imageBase64}`;
    
    // Fetch small dataUrls for each slice (for individual slice analysis)
    const slicesWithDataUrls = await fetchSliceDataUrlsForAnalysis(
      slices, 
      fullImageUrl, 
      imageWidth, 
      imageHeight
    );
    
    // CRITICAL: Pass the actual cropped slice dataUrls (matches CampaignCreator line 208)
    const sliceInputs = slicesWithDataUrls.map((slice, index) => ({
      dataUrl: slice.dataUrl, // Use the cropped slice's dataUrl
      index
    }));
    
    const response = await fetch(analyzeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
      },
      body: JSON.stringify({
        slices: sliceInputs,
        brandDomain,
        fullCampaignImage: fullImageDataUrl
      })
    });

    if (!response.ok) {
      console.error('[process] Slice analysis failed:', await response.text());
      return null;
    }

    const result = await response.json();
    
    if (!result.analyses || !Array.isArray(result.analyses)) {
      console.error('[process] Slice analysis returned invalid data');
      return null;
    }

    console.log('[process] Analyzed', result.analyses.length, 'slices');
    
    // Build a Map keyed by index for reliable lookup (matches CampaignCreator)
    const analysisByIndex = new Map<number, any>();
    for (const a of result.analyses) {
      analysisByIndex.set(a.index, a);
    }
    
    // Merge analysis into slices, stripping dataUrl to prevent DB bloat
    return slicesWithDataUrls.map((slice, i) => {
      const analysis = analysisByIndex.get(i);
      // Destructure to remove dataUrl and smallCropUrl (analysis-only fields)
      const { dataUrl, smallCropUrl, ...sliceWithoutAnalysisFields } = slice;
      return {
        ...sliceWithoutAnalysisFields,
        altText: analysis?.altText !== undefined && analysis?.altText !== null ? analysis.altText : `Email section ${i + 1}`,
        link: analysis?.suggestedLink || slice.link || null,
        isClickable: analysis?.isClickable ?? true,
        linkVerified: analysis?.linkVerified || false,
        linkWarning: analysis?.linkWarning,
      };
    });

  } catch (err) {
    console.error('[process] Slice analysis error:', err);
    return null;
  }
}

// Step 5: Generate subject lines and preview texts (with pairCount: 10 to match manual)
async function generateCopy(
  slices: any[],
  brandContext: any,
  imageUrl: string,
  copyExamples?: any
): Promise<{ subjectLines: string[]; previewTexts: string[] } | null> {
  console.log('[process] Step 5: Generating copy (pairCount: 10)...');

  try {
    const copyUrl = Deno.env.get('SUPABASE_URL') + '/functions/v1/generate-email-copy';
    const response = await fetch(copyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
      },
      body: JSON.stringify({
        slices,
        brandContext,
        pairCount: 10, // CRITICAL: Match manual flow (was 5)
        copyExamples,
        campaignImageUrl: imageUrl
      })
    });

    if (!response.ok) {
      console.error('[process] Copy generation failed:', await response.text());
      return null;
    }

    const result = await response.json();
    
    console.log('[process] Generated', result.subjectLines?.length || 0, 'SLs');
    
    return {
      subjectLines: result.subjectLines || [],
      previewTexts: result.previewTexts || []
    };

  } catch (err) {
    console.error('[process] Copy generation error:', err);
    return null;
  }
}

// Step 6: QA spelling check
async function qaSpellingCheck(
  imageBase64: string
): Promise<{ hasErrors: boolean; errors: any[] }> {
  console.log('[process] Step 6: QA spelling check...');

  try {
    const qaUrl = Deno.env.get('SUPABASE_URL') + '/functions/v1/qa-spelling-check';
    const response = await fetch(qaUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
      },
      body: JSON.stringify({ imageBase64 })
    });

    if (!response.ok) {
      console.error('[process] QA check failed');
      return { hasErrors: false, errors: [] };
    }

    const result = await response.json();
    
    console.log('[process] QA found', result.errors?.length || 0, 'spelling errors');
    
    return {
      hasErrors: result.hasErrors || false,
      errors: result.errors || []
    };

  } catch (err) {
    console.error('[process] QA check error:', err);
    return { hasErrors: false, errors: [] };
  }
}

// Step 7: Retrieve early generation results
async function retrieveEarlyCopy(
  supabase: any,
  sessionKey: string
): Promise<{ subjectLines: string[]; previewTexts: string[]; spellingErrors: any[] } | null> {
  console.log('[process] Step 7: Checking for early generated copy...');

  try {
    const { data, error } = await supabase
      .from('early_generated_copy')
      .select('*')
      .eq('session_key', sessionKey)
      .single();

    if (error || !data) {
      console.log('[process] No early copy found for session:', sessionKey);
      return null;
    }

    console.log('[process] Found early copy:', data.subject_lines?.length || 0, 'SLs');
    
    return {
      subjectLines: data.subject_lines || [],
      previewTexts: data.preview_texts || [],
      spellingErrors: data.spelling_errors || []
    };
  } catch (err) {
    console.error('[process] Error retrieving early copy:', err);
    return null;
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const body: ProcessRequest = await req.json();
    const { campaignQueueId } = body;

    if (!campaignQueueId) {
      return new Response(
        JSON.stringify({ error: 'campaignQueueId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[process] Starting processing for:', campaignQueueId);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch the queue item
    const { data: item, error: fetchError } = await supabase
      .from('campaign_queue')
      .select('*')
      .eq('id', campaignQueueId)
      .single();

    if (fetchError || !item) {
      console.error('[process] Queue item not found:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Queue item not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // === STEP 1: Fetch image - AI-sized only (10%) ===
    await updateQueueItem(supabase, campaignQueueId, {
      processing_step: 'fetching_image',
      processing_percent: 5
    });

    const imageResult = await fetchAndUploadImage(supabase, item);
    
    if (!imageResult) {
      await updateQueueItem(supabase, campaignQueueId, {
        status: 'failed',
        processing_step: 'fetching_image',
        error_message: 'Failed to fetch or upload image'
      });
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch image' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update image_url and fix dimensions if they were wrong in the database
    const dimensionUpdates: Record<string, unknown> = {
      image_url: imageResult.imageUrl,
      processing_percent: 10
    };
    
    // Self-healing: Update DB if dimensions were wrong (prevents future misalignment)
    if (imageResult.actualOriginalWidth !== item.image_width || 
        imageResult.actualOriginalHeight !== item.image_height) {
      console.log('[process] Updating DB with correct dimensions:', 
        imageResult.actualOriginalWidth, 'x', imageResult.actualOriginalHeight);
      dimensionUpdates.image_width = imageResult.actualOriginalWidth;
      dimensionUpdates.image_height = imageResult.actualOriginalHeight;
    }
    
    await updateQueueItem(supabase, campaignQueueId, dimensionUpdates);

    // === STEP 1.5: Start early SL/PT generation immediately (matches manual flow) ===
    let brandId = item.brand_id;
    let brandContext: { name: string; domain: string } | null = null;
    let copyExamples = null;
    let clickupApiKey = null;
    let clickupListId = null;
    let clickupWorkspaceId = null;
    
    // Fetch user's profile for master ClickUp connection
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('clickup_api_key, clickup_workspace_id')
      .eq('id', item.user_id)
      .maybeSingle();
    
    // Get brand info first for early generation
    if (brandId) {
      const { data: brand } = await supabase
        .from('brands')
        .select('*')
        .eq('id', brandId)
        .single();
      
      if (brand) {
        brandContext = {
          name: brand.name,
          domain: brand.domain,
        };
        copyExamples = brand.copy_examples;
        // Use profile's master API key, fallback to brand's if exists (legacy)
        clickupApiKey = userProfile?.clickup_api_key || brand.clickup_api_key || null;
        clickupWorkspaceId = userProfile?.clickup_workspace_id || brand.clickup_workspace_id || null;
        // List ID still comes from brand (location-specific)
        clickupListId = brand.clickup_list_id || null;
      }
    }

    // Fire early generation immediately (matches CampaignCreator.startEarlyGeneration)
    const earlySessionKey = await startEarlyGeneration(
      supabase,
      imageResult.imageUrl,
      brandContext,
      brandId,
      copyExamples
    );

    // === STEP 1.5b: Search ClickUp for copy ===
    let clickupCopy: { subjectLine: string | null; previewText: string | null; taskId: string | null; taskUrl: string | null } = {
      subjectLine: null,
      previewText: null,
      taskId: null,
      taskUrl: null
    };

    if (clickupApiKey && clickupListId && item.source_url) {
      console.log('[process] Step 1.5b: Searching ClickUp for copy...');
      try {
        const clickupUrl = Deno.env.get('SUPABASE_URL') + '/functions/v1/search-clickup-for-copy';
        const clickupResponse = await fetch(clickupUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
          },
          body: JSON.stringify({
            figmaUrl: item.source_url,
            clickupApiKey: clickupApiKey,
            listId: clickupListId,
            workspaceId: clickupWorkspaceId
          })
        });

        if (clickupResponse.ok) {
          const result = await clickupResponse.json();
          if (result.found) {
            clickupCopy = {
              subjectLine: result.subjectLine || null,
              previewText: result.previewText || null,
              taskId: result.taskId || null,
              taskUrl: result.taskUrl || null
            };
            console.log('[process] ClickUp found - SL:', !!clickupCopy.subjectLine, 'PT:', !!clickupCopy.previewText);
          } else {
            console.log('[process] ClickUp search found no matching task');
          }
        } else {
          console.error('[process] ClickUp search failed:', await clickupResponse.text());
        }
      } catch (err) {
        console.error('[process] ClickUp search error (non-fatal):', err);
      }
    }

    // === STEP 2+3: PARALLEL - Detect brand + Auto-slice image (35%) ===
    // OPTIMIZATION: These are independent operations, run them in parallel
    await updateQueueItem(supabase, campaignQueueId, {
      processing_step: 'analyzing_image',
      processing_percent: 15
    });

    // Start both operations in parallel
    // IMPORTANT: Use AI-sized image for brand detection and auto-slicing (within Claude's 8000px limit)
    const brandDetectionPromise = !brandId 
      ? detectBrand(supabase, imageResult.imageBase64ForAI)
      : Promise.resolve(brandId);
    
    // CRITICAL: Pass actual AI dimensions (from parsed header), not DB values
    const slicePromise = autoSliceImage(
      imageResult.imageBase64ForAI,
      imageResult.actualAIWidth,
      imageResult.actualAIHeight
    );

    console.log('[process] Running brand detection + auto-slice in parallel...');
    const [detectedBrandId, sliceResult] = await Promise.all([brandDetectionPromise, slicePromise]);

    // Handle brand detection result
    if (!brandId && detectedBrandId) {
      brandId = detectedBrandId;
      const { data: brand } = await supabase
        .from('brands')
        .select('*')
        .eq('id', brandId)
        .single();
      
      if (brand) {
        brandContext = {
          name: brand.name,
          domain: brand.domain,
        };
        copyExamples = brand.copy_examples;
      }
    } else if (brandId) {
      console.log('[process] Using brand from plugin:', brandId);
    }

    await updateQueueItem(supabase, campaignQueueId, {
      brand_id: brandId,
      processing_percent: 30
    });

    // Validate slice result
    if (!sliceResult || sliceResult.slices.length === 0) {
      await updateQueueItem(supabase, campaignQueueId, {
        status: 'failed',
        processing_step: 'slicing_image',
        error_message: 'Failed to auto-slice image'
      });
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to slice image' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    await updateQueueItem(supabase, campaignQueueId, {
      footer_start_percent: sliceResult.footerStartPercent,
      processing_percent: 35
    });

    // === STEP 3.5: Generate slice URLs via Cloudinary (45%) ===
    // MEMORY OPTIMIZATION: Use Cloudinary server-side cropping instead of ImageScript
    await updateQueueItem(supabase, campaignQueueId, {
      processing_step: 'generating_slice_urls',
      processing_percent: 40
    });

    // Use Cloudinary URL transformations for slice cropping (zero memory usage)
    // CRITICAL: Pass both original dimensions AND analyzed dimensions for coordinate scaling
    // CRITICAL: Use ACTUAL dimensions from image headers, not DB values
    const uploadedSlices = await cropSlicesViaCloudinary(
      imageResult.imageUrl,
      sliceResult.slices,
      imageResult.actualOriginalWidth,   // Actual original dimensions from image header
      imageResult.actualOriginalHeight,
      sliceResult.analyzedWidth,         // Analyzed dimensions (what Claude saw)
      sliceResult.analyzedHeight
    );

    if (uploadedSlices.length === 0) {
      await updateQueueItem(supabase, campaignQueueId, {
        status: 'failed',
        processing_step: 'generating_slice_urls',
        error_message: 'Failed to generate slice URLs'
      });
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to generate slice URLs' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    await updateQueueItem(supabase, campaignQueueId, {
      slices: uploadedSlices,
      processing_percent: 45
    });

    // === STEP 4: Analyze slices for alt text + links (60%) ===
    await updateQueueItem(supabase, campaignQueueId, {
      processing_step: 'analyzing_slices',
      processing_percent: 50
    });

    // CRITICAL: Use ACTUAL dimensions from image headers, not DB values
    const enrichedSlices = await analyzeSlices(
      uploadedSlices,
      imageResult.imageUrl, // Pass Cloudinary URL, analyzeSlices will resize for AI
      brandContext?.domain || null,
      imageResult.actualOriginalWidth,
      imageResult.actualOriginalHeight
    );

    let currentSlices = enrichedSlices || uploadedSlices;

    await updateQueueItem(supabase, campaignQueueId, {
      slices: currentSlices,
      processing_percent: 60
    });

    // === STEP 5: Wait for early copy generation (80%) ===
    // OPTIMIZATION: Early generation was fired in Step 1.5, poll for results instead of regenerating
    await updateQueueItem(supabase, campaignQueueId, {
      processing_step: 'generating_copy',
      processing_percent: 65
    });

    console.log('[process] Step 5: Polling for early copy results (session:', earlySessionKey, ')...');
    
    // Poll for early generation results (max 12 seconds, 2s intervals - reduced to fail fast)
    let copyResult: { subjectLines: string[]; previewTexts: string[] } | null = null;
    const maxWaitMs = 12000;
    const pollIntervalMs = 2000;
    const pollStartTime = Date.now();
    
    while (Date.now() - pollStartTime < maxWaitMs) {
      const earlyCopyCheck = await retrieveEarlyCopy(supabase, earlySessionKey);
      if (earlyCopyCheck && earlyCopyCheck.subjectLines.length > 0) {
        copyResult = {
          subjectLines: earlyCopyCheck.subjectLines,
          previewTexts: earlyCopyCheck.previewTexts
        };
        console.log('[process] Early copy ready after', Date.now() - pollStartTime, 'ms');
        break;
      }
      console.log('[process] Polling... no result yet');
      await new Promise(r => setTimeout(r, pollIntervalMs));
    }
    
    if (!copyResult) {
      console.log('[process] Early copy not ready after polling, falling back to sync generation...');
      // Fallback: Generate synchronously if early generation didn't complete
      const resizedCampaignImageUrl = getResizedCloudinaryUrl(imageResult.imageUrl, 600, 7900);
      copyResult = await generateCopy(
        currentSlices,
        brandContext,
        resizedCampaignImageUrl,
        copyExamples
      );
    }

    if (copyResult) {
      await updateQueueItem(supabase, campaignQueueId, {
        generated_subject_lines: copyResult.subjectLines,
        generated_preview_texts: copyResult.previewTexts,
        selected_subject_line: copyResult.subjectLines[0] || null,
        selected_preview_text: copyResult.previewTexts[0] || null,
        processing_percent: 80
      });
    } else {
      await updateQueueItem(supabase, campaignQueueId, {
        processing_percent: 80
      });
    }

    // === STEP 6: QA spelling check (90%) ===
    await updateQueueItem(supabase, campaignQueueId, {
      processing_step: 'qa_check',
      processing_percent: 85
    });

    // Use AI-sized image for QA spelling check (don't need full-res for text detection)
    const qaResult = await qaSpellingCheck(imageResult.imageBase64ForAI);

    await updateQueueItem(supabase, campaignQueueId, {
      spelling_errors: qaResult.errors,
      qa_flags: qaResult.hasErrors ? { spelling: true } : null,
      processing_percent: 90
    });

    // === STEP 7: Merge early copy if available (95%) ===
    await updateQueueItem(supabase, campaignQueueId, {
      processing_step: 'finalizing',
      processing_percent: 95
    });

    // Check if early generation completed with results
    const earlyCopy = await retrieveEarlyCopy(supabase, earlySessionKey);
    
    // Build final subject lines and preview texts
    let finalSubjectLines = copyResult?.subjectLines || [];
    let finalPreviewTexts = copyResult?.previewTexts || [];
    
    if (earlyCopy && earlyCopy.subjectLines.length > 0) {
      console.log('[process] Merging early copy results');
      // Use early copy if it has more results or late copy failed
      finalSubjectLines = earlyCopy.subjectLines.length > finalSubjectLines.length 
        ? earlyCopy.subjectLines 
        : (finalSubjectLines.length > 0 ? finalSubjectLines : earlyCopy.subjectLines);
      finalPreviewTexts = earlyCopy.previewTexts.length > finalPreviewTexts.length
        ? earlyCopy.previewTexts
        : (finalPreviewTexts.length > 0 ? finalPreviewTexts : earlyCopy.previewTexts);
    }
    
    // Merge spelling errors from early copy
    const allSpellingErrors = [...(qaResult.errors || []), ...(earlyCopy?.spellingErrors || [])];
    const uniqueSpellingErrors = allSpellingErrors.filter((e, i, arr) => 
      arr.findIndex(x => x.word === e.word && x.location === e.location) === i
    );

    // Determine copy source and final selected values
    // Priority: ClickUp > Figma provided > AI generated
    const providedSubjectLine = clickupCopy.subjectLine || item.provided_subject_line;
    const providedPreviewText = clickupCopy.previewText || item.provided_preview_text;
    
    let copySource: string = 'ai';
    if (clickupCopy.subjectLine || clickupCopy.previewText) {
      copySource = 'clickup';
    } else if (item.provided_subject_line || item.provided_preview_text) {
      copySource = 'figma';
    }

    await updateQueueItem(supabase, campaignQueueId, {
      provided_subject_line: providedSubjectLine || null,
      provided_preview_text: providedPreviewText || null,
      generated_subject_lines: finalSubjectLines,
      generated_preview_texts: finalPreviewTexts,
      selected_subject_line: providedSubjectLine || finalSubjectLines[0] || null,
      selected_preview_text: providedPreviewText || finalPreviewTexts[0] || null,
      copy_source: copySource,
      clickup_task_id: clickupCopy.taskId || null,
      clickup_task_url: clickupCopy.taskUrl || null,
      spelling_errors: uniqueSpellingErrors,
      qa_flags: uniqueSpellingErrors.length > 0 ? { spelling: true } : null,
    });

    // === STEP 8: Complete (100%) ===
    const processingTime = Date.now() - startTime;
    console.log('[process] Completed in', processingTime, 'ms');

    await updateQueueItem(supabase, campaignQueueId, {
      status: 'ready_for_review',
      processing_step: 'complete',
      processing_percent: 100,
      error_message: null
    });

    return new Response(
      JSON.stringify({
        success: true,
        campaignQueueId,
        processingTimeMs: processingTime
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[process] Fatal error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
