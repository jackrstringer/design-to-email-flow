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

// Step 1: Fetch image from URL or use existing uploaded image
// Uses Cloudinary URL transformation to resize large images BEFORE fetching
async function fetchAndUploadImage(
  supabase: any,
  item: any
): Promise<{ imageUrl: string; imageBase64: string } | null> {
  console.log('[process] Step 1: Starting image fetch...');
  const step1Start = Date.now();

  // If image_url already exists (from figma plugin or upload), just fetch it as base64
  if (item.image_url) {
    try {
      // CRITICAL: Resize via Cloudinary URL transformation BEFORE fetching
      // This prevents memory issues with large images (e.g., 1200x8000)
      // Max 600px wide (email standard), max 4000px tall (leaves room for processing)
      const resizedUrl = getResizedCloudinaryUrl(item.image_url, 600, 4000);
      
      // Log exact URLs for debugging slow fetches
      console.log('[process] Fetching URL:', resizedUrl);
      console.log('[process] Original URL:', item.image_url);
      
      const fetchStart = Date.now();
      const response = await fetch(resizedUrl);
      console.log('[process] HTTP fetch completed:', {
        status: response.status,
        contentLength: response.headers.get('content-length'),
        durationMs: Date.now() - fetchStart
      });
      
      if (!response.ok) throw new Error('Failed to fetch image');
      
      const bufferStart = Date.now();
      const buffer = await response.arrayBuffer();
      console.log('[process] Buffer read:', {
        size: buffer.byteLength,
        durationMs: Date.now() - bufferStart
      });
      
      const base64Start = Date.now();
      const uint8Array = new Uint8Array(buffer);
      // Use chunked conversion to avoid O(n²) string concatenation
      const CHUNK_SIZE = 32768;
      let binary = '';
      for (let i = 0; i < uint8Array.length; i += CHUNK_SIZE) {
        const chunk = uint8Array.subarray(i, Math.min(i + CHUNK_SIZE, uint8Array.length));
        binary += String.fromCharCode(...chunk);
      }
      const base64 = btoa(binary);
      console.log('[process] Base64 conversion:', {
        outputLength: base64.length,
        durationMs: Date.now() - base64Start
      });
      
      console.log('[process] Step 1 TOTAL:', Date.now() - step1Start, 'ms');
      return { imageUrl: item.image_url, imageBase64: base64 };
    } catch (err) {
      console.error('[process] Failed to fetch image from URL:', err);
      return null;
    }
  }

  // Legacy: For items without pre-uploaded images (shouldn't happen with new flow)
  console.error('[process] No image_url found on queue item');
  return null;
}

// Step 1.5: Start early SL/PT generation immediately (matches CampaignCreator.startEarlyGeneration)
// OPTIMIZATION: Now passes imageBase64 directly to avoid redundant image downloads
async function startEarlyGeneration(
  supabase: any,
  imageUrl: string,
  imageBase64: string,  // NEW: Pass base64 directly, no re-download needed
  brandContext: { name: string; domain: string } | null,
  brandId: string | null,
  copyExamples: any
): Promise<string> {
  const sessionKey = crypto.randomUUID();
  console.log('[process] Step 1.5: Starting early SL/PT generation, session:', sessionKey);

  try {
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
        imageUrl: imageUrl, // Keep URL as fallback
        imageBase64: imageBase64, // NEW: Pass base64 directly - no re-download needed!
        brandContext: brandContext || { name: 'Unknown', domain: null },
        brandId: brandId || null,
        copyExamples: copyExamples || null
      })
    }).catch(err => console.log('[process] Early generation triggered:', err?.message || 'ok'));

    console.log('[process] Early generation fired with base64 for session:', sessionKey);
  } catch (err) {
    console.error('[process] Error starting early generation:', err);
  }

  return sessionKey;
}

// Step 2: REMOVED - Brand detection removed from pipeline
// Brand is now always manually selected via plugin dropdown
// The detect-brand-from-image edge function is kept for potential future use

// Step 3: Auto-slice the image (with optional link intelligence)
interface LinkIndexEntry {
  title: string;
  url: string;
  link_type: string;
}

interface BrandPreferenceRule {
  name: string;
  destination_url: string;
}

interface AutoSliceResult {
  slices: any[];
  footerStartPercent: number;
  footerStartY: number;
  imageHeight: number;
  analyzedWidth: number;
  analyzedHeight: number;
  needsLinkSearch?: Array<{ sliceIndex: number; description: string }>;
  hasLinkIntelligence: boolean;
}

async function autoSliceImage(
  imageBase64: string,
  imageWidth: number,
  imageHeight: number,
  // Link intelligence params (optional)
  linkIndex?: LinkIndexEntry[],
  defaultDestinationUrl?: string,
  brandPreferenceRules?: BrandPreferenceRule[]
): Promise<AutoSliceResult | null> {
  const hasLinkIndex = linkIndex && linkIndex.length > 0;
  console.log(`[process] Step 3: Auto-slicing image... (link index: ${hasLinkIndex ? linkIndex.length + ' links' : 'none'})`);

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
        imageHeight,
        // Pass link intelligence if available
        linkIndex: hasLinkIndex ? linkIndex : undefined,
        defaultDestinationUrl: hasLinkIndex ? defaultDestinationUrl : undefined,
        brandPreferenceRules: hasLinkIndex ? brandPreferenceRules : undefined
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

    const footerStartY = result.footerStartY;
    const footerStartPercent = footerStartY / result.imageHeight * 100;
    
    // CRITICAL: Filter out slices that are at or below the footer boundary
    // Only keep slices that END before the footer starts (yBottom <= footerStartY)
    const allSlices = result.slices || [];
    const contentSlices = allSlices.filter((slice: any) => slice.yBottom <= footerStartY);
    
    console.log(`[process] Filtered ${allSlices.length} -> ${contentSlices.length} slices (excluding footer at ${footerStartY}px)`);
    if (hasLinkIndex) {
      console.log(`[process] Link intelligence enabled: ${result.needsLinkSearch?.length || 0} slices need web search`);
    }
    
    return {
      slices: contentSlices,
      footerStartPercent,
      footerStartY,
      imageHeight: result.imageHeight,
      analyzedWidth: result.analyzedWidth || result.imageWidth || imageWidth,
      analyzedHeight: result.analyzedHeight || result.imageHeight || imageHeight,
      needsLinkSearch: result.needsLinkSearch || [],
      hasLinkIntelligence: hasLinkIndex || false
    };

  } catch (err) {
    console.error('[process] Auto-slice error:', err);
    return null;
  }
}

// Step 3.5: Generate Cloudinary crop URLs (instant - no upload/decode needed)
// OPTIMIZATION: Replaced ImageScript cropping with server-side URL transformations
function generateSliceCropUrls(
  slices: any[],
  originalImageUrl: string,
  actualWidth: number,
  actualHeight: number,
  analyzedWidth: number,
  analyzedHeight: number
): any[] {
  console.log('[process] Step 3.5: Generating Cloudinary crop URLs (instant)...');
  console.log(`[process] Original dimensions: ${actualWidth}x${actualHeight}, analyzed: ${analyzedWidth}x${analyzedHeight}`);

  // Extract Cloudinary base URL and public ID from original URL
  // e.g., "https://res.cloudinary.com/cloud/image/upload/v123/folder/id.png"
  const match = originalImageUrl.match(/(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload)\/[^/]+\/(.+)\.(png|jpg|jpeg|webp)/i);
  if (!match) {
    console.error('[process] Could not parse Cloudinary URL:', originalImageUrl);
    // Fallback: return slices without imageUrl
    return slices.map((slice, i) => ({
      ...slice,
      imageUrl: null,
      dataUrl: null,
      width: actualWidth,
      height: slice.yBottom - slice.yTop,
      startPercent: (slice.yTop / analyzedHeight) * 100,
      endPercent: (slice.yBottom / analyzedHeight) * 100,
      type: slice.hasCTA ? 'cta' : 'image',
      column: 0,
      totalColumns: 1,
      rowIndex: i,
    }));
  }
  
  const [, baseUrl, publicId] = match;
  
  // Calculate scale factor from analyzed dimensions to actual dimensions
  const scaleX = actualWidth / analyzedWidth;
  const scaleY = actualHeight / analyzedHeight;
  
  console.log(`[process] Scale factors: X=${scaleX.toFixed(3)}, Y=${scaleY.toFixed(3)}`);
  
  let globalRowIndex = 0;
  const results: any[] = [];
  
  for (let i = 0; i < slices.length; i++) {
    const slice = slices[i];
    
    // Scale coordinates from analyzed to actual dimensions
    const yTop = Math.round(slice.yTop * scaleY);
    const yBottom = Math.round(slice.yBottom * scaleY);
    const sliceHeight = yBottom - yTop;
    
    if (slice.horizontalSplit && slice.horizontalSplit.columns > 1) {
      // Horizontal split: generate column URLs
      const { columns, gutterPositions } = slice.horizontalSplit;
      
      // Calculate column boundaries in actual pixels
      const xBoundaries = [
        0,
        ...(gutterPositions || []).map((p: number) => Math.round(actualWidth * p / 100)),
        actualWidth
      ];
      
      console.log(`[process] Slice ${i + 1}: Horizontal split into ${columns} columns at y=${yTop}-${yBottom}`);
      
      const columnUrls: string[] = [];
      for (let col = 0; col < columns; col++) {
        const xLeft = xBoundaries[col];
        const xRight = xBoundaries[col + 1];
        const colWidth = xRight - xLeft;
        
        // Cloudinary crop transformation URL
        const cropUrl = `${baseUrl}/c_crop,x_${xLeft},y_${yTop},w_${colWidth},h_${sliceHeight},q_90,f_jpg/${publicId}`;
        columnUrls.push(cropUrl);
        
        console.log(`[process] Column ${col + 1}/${columns}: ${colWidth}x${sliceHeight} at (${xLeft}, ${yTop})`);
      }
      
      // For horizontal splits, add each column as a separate slice entry
      for (let col = 0; col < columns; col++) {
        results.push({
          ...slice,
          imageUrl: columnUrls[col],
          columnImageUrls: columnUrls,
          dataUrl: null, // No longer storing base64
          width: xBoundaries[col + 1] - xBoundaries[col],
          height: sliceHeight,
          startPercent: (slice.yTop / analyzedHeight) * 100,
          endPercent: (slice.yBottom / analyzedHeight) * 100,
          type: slice.hasCTA ? 'cta' : 'image',
          column: col,
          totalColumns: columns,
          rowIndex: globalRowIndex,
        });
      }
    } else {
      // Full-width slice
      const cropUrl = `${baseUrl}/c_crop,x_0,y_${yTop},w_${actualWidth},h_${sliceHeight},q_90,f_jpg/${publicId}`;
      
      console.log(`[process] Slice ${i + 1}: Full-width ${actualWidth}x${sliceHeight} at (0, ${yTop})`);
      
      results.push({
        ...slice,
        imageUrl: cropUrl,
        dataUrl: null, // No longer storing base64
        width: actualWidth,
        height: sliceHeight,
        startPercent: (slice.yTop / analyzedHeight) * 100,
        endPercent: (slice.yBottom / analyzedHeight) * 100,
        type: slice.hasCTA ? 'cta' : 'image',
        column: 0,
        totalColumns: 1,
        rowIndex: globalRowIndex,
      });
    }
    
    globalRowIndex++;
  }
  
  console.log(`[process] Generated ${results.length} crop URLs (instant, no uploads)`);
  return results;
}

// Step 4: Analyze slices for alt text and links (now uses URLs instead of dataUrls)
async function analyzeSlices(
  supabase: any,
  slices: any[],
  fullImageUrl: string, // Cloudinary URL (will be resized for AI)
  brandDomain: string | null,
  brandId: string | null
): Promise<any[] | null> {
  console.log('[process] Step 4: Analyzing slices for alt text and links...');

  try {
    const analyzeUrl = Deno.env.get('SUPABASE_URL') + '/functions/v1/analyze-slices';
    
    // Resize the full image URL for AI processing (keep under 8000px height limit)
    const resizedFullImageUrl = getResizedCloudinaryUrl(fullImageUrl, 600, 7900);
    console.log('[process] Using resized URL for analysis:', resizedFullImageUrl.substring(0, 80) + '...');
    
    // OPTIMIZATION: Pass slice URLs directly instead of fetching and converting to base64
    // The analyze-slices function now supports URL-based images
    const sliceInputs = slices.map((slice, index) => ({
      imageUrl: slice.imageUrl, // Cloudinary crop URL
      index,
      column: slice.column,
      totalColumns: slice.totalColumns,
      rowIndex: slice.rowIndex
    }));
    
    // Fetch known product URLs from brand for learning system
    let knownProductUrls: Array<{ name: string; url: string }> = [];
    if (brandId) {
      try {
        const { data: brand } = await supabase
          .from('brands')
          .select('all_links')
          .eq('id', brandId)
          .single();
        
        const productUrls = brand?.all_links?.productUrls || {};
        knownProductUrls = Object.entries(productUrls).map(([name, url]) => ({ 
          name, 
          url: url as string 
        }));
        console.log(`[process] Passing ${knownProductUrls.length} known product URLs to analyzer`);
      } catch (err) {
        console.log('[process] Could not fetch known URLs:', err);
      }
    }
    
    const response = await fetch(analyzeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
      },
      body: JSON.stringify({
        slices: sliceInputs,
        brandDomain,
        brandId, // Critical: Pass brandId for link index matching
        fullCampaignImage: resizedFullImageUrl, // Pass URL, not dataUrl
        knownProductUrls
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
    
    // Save discovered URLs back to brand for future campaigns (learning system)
    if (result.discoveredUrls && Array.isArray(result.discoveredUrls) && result.discoveredUrls.length > 0 && brandId) {
      try {
        const { data: brand } = await supabase
          .from('brands')
          .select('all_links')
          .eq('id', brandId)
          .single();
        
        const existingLinks = brand?.all_links || {};
        const productUrls = existingLinks.productUrls || {};
        
        let newCount = 0;
        for (const discovery of result.discoveredUrls) {
          if (discovery.productName && discovery.url) {
            const key = discovery.productName.toLowerCase().trim();
            if (!productUrls[key]) {
              productUrls[key] = discovery.url;
              newCount++;
            }
          }
        }
        
        if (newCount > 0) {
          await supabase
            .from('brands')
            .update({ all_links: { ...existingLinks, productUrls } })
            .eq('id', brandId);
          
          console.log(`[process] Saved ${newCount} new discovered URLs to brand ${brandId}`);
        }
      } catch (err) {
        console.error('[process] Failed to save discovered URLs:', err);
      }
    }
    
    // Build a Map keyed by index for reliable lookup (matches CampaignCreator)
    const analysisByIndex = new Map<number, any>();
    for (const a of result.analyses) {
      analysisByIndex.set(a.index, a);
    }
    
    // Merge analysis into slices
    return slices.map((slice, i) => {
      const analysis = analysisByIndex.get(i);
      return {
        ...slice,
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

    // === STEP 1: Fetch and upload image (10%) ===
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

    await updateQueueItem(supabase, campaignQueueId, {
      image_url: imageResult.imageUrl,
      processing_percent: 10
    });

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
    // OPTIMIZATION: Pass imageBase64 directly to avoid redundant Cloudinary download
    const earlySessionKey = await startEarlyGeneration(
      supabase,
      imageResult.imageUrl,
      imageResult.imageBase64,  // NEW: Pass base64 directly - saves 22s!
      brandContext,
      brandId,
      copyExamples
    );

    // === STEP 1.5c: Fire early spelling check (async, parallel with entire pipeline) ===
    // OPTIMIZATION: Pass imageBase64 directly to avoid redundant Cloudinary download
    const spellingSessionKey = crypto.randomUUID();
    const spellingCheckUrl = Deno.env.get('SUPABASE_URL') + '/functions/v1/qa-spelling-check-early';
    
    fetch(spellingCheckUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
      },
      body: JSON.stringify({
        sessionKey: spellingSessionKey,
        imageUrl: imageResult.imageUrl, // Keep URL as fallback
        imageBase64: imageResult.imageBase64  // NEW: Pass base64 directly - saves 20s!
      })
    }).catch(err => console.log('[process] Early spelling check triggered:', err?.message || 'ok'));
    
    console.log('[process] Step 1.5c: Early spelling check fired with base64 for session:', spellingSessionKey);

    // === STEP 1.5b: Fire ClickUp search ASYNC (non-blocking, parallel with auto-slice) ===
    // OPTIMIZATION: Previously this was awaited synchronously, blocking the pipeline for 20-40s
    // Now we fire immediately and await results at the end when merging copy sources
    type ClickUpCopyResult = { subjectLine: string | null; previewText: string | null; taskId: string | null; taskUrl: string | null; found: boolean };
    let clickupPromise: Promise<ClickUpCopyResult> | null = null;

    if (clickupApiKey && clickupListId && item.source_url) {
      console.log('[process] Step 1.5b: Firing async ClickUp search (non-blocking)...');
      const clickupUrl = Deno.env.get('SUPABASE_URL') + '/functions/v1/search-clickup-for-copy';
      
      // Fire immediately without await - runs in parallel with auto-slice
      clickupPromise = (async (): Promise<ClickUpCopyResult> => {
        try {
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
            console.log('[process] ClickUp async search completed - found:', result.found);
            return {
              subjectLine: result.subjectLine || null,
              previewText: result.previewText || null,
              taskId: result.taskId || null,
              taskUrl: result.taskUrl || null,
              found: result.found || false
            };
          } else {
            console.error('[process] ClickUp search failed:', await clickupResponse.text());
          }
        } catch (err) {
          console.error('[process] ClickUp search error (non-fatal):', err);
        }
        return { subjectLine: null, previewText: null, taskId: null, taskUrl: null, found: false };
      })();
    }

    // === STEP 3: Auto-slice image (35%) ===
    // Brand detection REMOVED - brand is always manually selected via plugin
    await updateQueueItem(supabase, campaignQueueId, {
      processing_step: 'analyzing_image',
      processing_percent: 15
    });

    // === FETCH LINK INDEX FOR BRAND (curated: products + collections) ===
    let linkIndex: LinkIndexEntry[] = [];
    let defaultDestinationUrl: string | null = null;
    let brandPreferenceRules: BrandPreferenceRule[] = [];
    
    if (brandId) {
      try {
        // MAXIMIZED CONTEXT: Claude's 200k tokens can easily handle 1000+ links
        // Fetch up to 500 product links (prioritized by verification recency)
        const { data: productLinks } = await supabase
          .from('brand_link_index')
          .select('title, url, link_type')
          .eq('brand_id', brandId)
          .eq('is_healthy', true)
          .eq('link_type', 'product')
          .order('last_verified_at', { ascending: false, nullsFirst: false })
          .order('use_count', { ascending: false })
          .limit(500);
        
        // Fetch up to 500 collection/page links (for generic CTAs and navigation)
        const { data: collectionLinks } = await supabase
          .from('brand_link_index')
          .select('title, url, link_type')
          .eq('brand_id', brandId)
          .eq('is_healthy', true)
          .neq('link_type', 'product')
          .order('use_count', { ascending: false })
          .limit(500);
        
        // Combine: products first, then collections
        const allLinks = [...(productLinks || []), ...(collectionLinks || [])];
        
        linkIndex = allLinks.map((l: any) => ({
          title: l.title || '',
          url: l.url,
          link_type: l.link_type
        }));
        
        console.log(`[process] Link index: ${productLinks?.length || 0} products + ${collectionLinks?.length || 0} collections = ${linkIndex.length} total (max 1000)`);
        
        // Fetch brand preferences
        const { data: brandPrefs } = await supabase
          .from('brands')
          .select('link_preferences, domain')
          .eq('id', brandId)
          .single();
        
        const prefs = brandPrefs?.link_preferences || {};
        defaultDestinationUrl = prefs.default_destination_url || `https://${brandPrefs?.domain || brandContext?.domain}`;
        brandPreferenceRules = prefs.rules || [];
        
      } catch (err) {
        console.log('[process] Could not fetch link index (non-fatal):', err);
      }
    }

    console.log('[process] Running auto-slice (brand:', brandId || 'none', ', links:', linkIndex.length, ')...');
    const sliceResult = await autoSliceImage(
      imageResult.imageBase64,
      item.image_width || 600,
      item.image_height || 2000,
      linkIndex.length > 0 ? linkIndex : undefined,
      defaultDestinationUrl || undefined,
      brandPreferenceRules.length > 0 ? brandPreferenceRules : undefined
    );

    // Brand is already set from plugin (item.brand_id), no detection needed
    if (brandId) {
      console.log('[process] Using brand from plugin:', brandId);
    } else {
      console.log('[process] No brand selected - campaign will need brand assignment');
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

    // === STEP 3.5: Generate Cloudinary crop URLs (instant - no decode/upload) ===
    await updateQueueItem(supabase, campaignQueueId, {
      processing_step: 'generating_slice_urls',
      processing_percent: 40
    });

    // Use actual Cloudinary dimensions if available, fallback to image_width/height
    const actualWidth = item.actual_image_width || item.image_width || 600;
    const actualHeight = item.actual_image_height || item.image_height || 2000;
    
    const uploadedSlices = generateSliceCropUrls(
      sliceResult.slices,
      imageResult.imageUrl,
      actualWidth,
      actualHeight,
      sliceResult.analyzedWidth,
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

    // === STEP 4: Validate and resolve links (deterministic guardrails) ===
    let currentSlices = uploadedSlices;
    
    if (sliceResult.hasLinkIntelligence) {
      console.log('[process] Step 4: Validating assigned links (deterministic guardrails)...');
      await updateQueueItem(supabase, campaignQueueId, {
        processing_step: 'validating_links',
        processing_percent: 50
      });
      
      // DETERMINISTIC LINK VALIDATOR
      // Detect "imperfect" links that need resolution
      const slicesNeedingResolution: Array<{ index: number; description: string; reason: string }> = [];
      
      for (let i = 0; i < currentSlices.length; i++) {
        const slice = currentSlices[i];
        const link = slice.link || '';
        const altText = (slice.altText || '').toLowerCase();
        const description = slice.description || slice.altText || '';
        
        // Rule 1: Product-specific content matched to collection URL
        const looksLikeProduct = (
          /\$\d/.test(description) ||  // Has price
          /jacket|tee|shirt|pants|hoodie|dress|bag|shoe|boot|sneaker/i.test(description) ||
          (slice.totalColumns && slice.totalColumns > 1)  // Multi-column = likely product grid
        );
        const isCollectionUrl = link && !link.includes('/products/') && (
          link.includes('/collections/') || link.includes('/category/')
        );
        
        if (looksLikeProduct && isCollectionUrl) {
          console.log(`[process] Slice ${i}: product_slice_matched_collection - "${description.substring(0, 40)}..." → ${link}`);
          slicesNeedingResolution.push({ 
            index: i, 
            description,
            reason: 'product_slice_matched_collection'
          });
          currentSlices[i] = { ...slice, link: null, linkSource: 'needs_resolution' };
          continue;
        }
        
        // Rule 2: Year/version mismatch (e.g., "Winter 2025" matched to "winter-2024")
        const yearInContent = description.match(/20(2[4-9]|3[0-9])/);
        const yearInUrl = link.match(/20(2[4-9]|3[0-9])/);
        if (yearInContent && yearInUrl && yearInContent[0] !== yearInUrl[0]) {
          console.log(`[process] Slice ${i}: year_mismatch - content has ${yearInContent[0]}, URL has ${yearInUrl[0]}`);
          slicesNeedingResolution.push({ 
            index: i, 
            description,
            reason: `year_mismatch_${yearInContent[0]}_vs_${yearInUrl[0]}`
          });
          currentSlices[i] = { ...slice, link: null, linkSource: 'needs_resolution' };
          continue;
        }
        
        // Rule 3: Multi-column slice with shared collection link (each column should resolve separately)
        if (slice.totalColumns && slice.totalColumns > 1 && isCollectionUrl) {
          console.log(`[process] Slice ${i}: multi_column_shared_collection - column ${slice.column + 1}/${slice.totalColumns}`);
          slicesNeedingResolution.push({ 
            index: i, 
            description,
            reason: 'multi_column_shared_collection'
          });
          currentSlices[i] = { ...slice, link: null, linkSource: 'needs_resolution' };
        }
      }
      
      // === STEP 4.5: Resolve imperfect links ===
      if (slicesNeedingResolution.length > 0 && brandContext?.domain) {
        console.log(`[process] Step 4.5: Resolving ${slicesNeedingResolution.length} imperfect links...`);
        await updateQueueItem(supabase, campaignQueueId, {
          processing_step: 'resolving_links',
          processing_percent: 55
        });
        
        try {
          const resolveUrl = Deno.env.get('SUPABASE_URL') + '/functions/v1/resolve-slice-links';
          const resolveResponse = await fetch(resolveUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
            },
            body: JSON.stringify({
              brandId,
              brandDomain: brandContext.domain,
              slices: slicesNeedingResolution.map(s => ({
                index: s.index,
                description: s.description,
                altText: currentSlices[s.index]?.altText,
                imageUrl: currentSlices[s.index]?.imageUrl
              }))
            })
          });
          
          if (resolveResponse.ok) {
            const resolveResult = await resolveResponse.json();
            const resolvedLinks = resolveResult.results || [];
            
            // Apply resolved links back to slices
            for (const resolved of resolvedLinks) {
              if (resolved.url) {
                currentSlices[resolved.index] = {
                  ...currentSlices[resolved.index],
                  link: resolved.url,
                  linkSource: `resolved_${resolved.source}`,
                  linkVerified: resolved.confidence > 0.8
                };
                console.log(`[process] Slice ${resolved.index} resolved: ${resolved.source} → ${resolved.url}`);
              } else {
                // Use default destination if resolution failed
                currentSlices[resolved.index] = {
                  ...currentSlices[resolved.index],
                  link: defaultDestinationUrl,
                  linkSource: 'default_fallback',
                  linkVerified: false
                };
              }
            }
            
            console.log(`[process] Resolved ${resolvedLinks.filter((r: any) => r.url).length}/${slicesNeedingResolution.length} links`);
          } else {
            console.error('[process] Link resolution failed:', await resolveResponse.text());
          }
        } catch (err) {
          console.error('[process] Link resolution error (non-fatal):', err);
        }
      }
      
      await updateQueueItem(supabase, campaignQueueId, {
        processing_step: 'links_assigned',
        processing_percent: 60
      });
    } else {
      // Legacy path: No link index, use analyze-slices for alt text and links
      console.log('[process] Step 4: Running analyze-slices (no link index)...');
      await updateQueueItem(supabase, campaignQueueId, {
        processing_step: 'analyzing_slices',
        processing_percent: 50
      });

      const enrichedSlices = await analyzeSlices(
        supabase,
        uploadedSlices,
        imageResult.imageUrl,
        brandContext?.domain || null,
        item.brand_id || null
      );

      currentSlices = enrichedSlices || uploadedSlices;
    }

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
    
    // Poll for early generation results (max 20 seconds, 2s intervals)
    // OPTIMIZATION: Increased from 12s because early copy now uses passed base64 and should complete in ~5-8s
    let copyResult: { subjectLines: string[]; previewTexts: string[] } | null = null;
    const maxWaitMs = 20000;
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

    // === STEP 6: Poll for early spelling check results (90%) ===
    await updateQueueItem(supabase, campaignQueueId, {
      processing_step: 'qa_check',
      processing_percent: 85
    });

    console.log('[process] Step 6: Polling for early spelling check results (session:', spellingSessionKey, ')...');
    
    // Poll for early spelling check results (max 8 seconds, 2s intervals)
    let qaResult: { hasErrors: boolean; errors: any[] } = { hasErrors: false, errors: [] };
    const spellingPollStart = Date.now();
    const maxSpellingWaitMs = 8000;
    
    while (Date.now() - spellingPollStart < maxSpellingWaitMs) {
      const { data: earlySpellingData } = await supabase
        .from('early_spelling_check')
        .select('*')
        .eq('session_key', spellingSessionKey)
        .single();
      
      if (earlySpellingData) {
        qaResult = {
          hasErrors: earlySpellingData.has_errors || false,
          errors: earlySpellingData.spelling_errors || []
        };
        console.log('[process] Early spelling check ready after', Date.now() - spellingPollStart, 'ms, found', qaResult.errors.length, 'errors');
        break;
      }
      console.log('[process] Spelling check polling... no result yet');
      await new Promise(r => setTimeout(r, 2000));
    }
    
    // Fallback to sync if early check not ready
    if (Date.now() - spellingPollStart >= maxSpellingWaitMs && qaResult.errors.length === 0) {
      console.log('[process] Early spelling not ready after polling, falling back to sync...');
      qaResult = await qaSpellingCheck(imageResult.imageBase64);
    }

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
    
    // Merge spelling errors from early copy (now includes early spelling check results)
    const allSpellingErrors = [...(qaResult.errors || []), ...(earlyCopy?.spellingErrors || [])];
    const uniqueSpellingErrors = allSpellingErrors.filter((e, i, arr) => 
      arr.findIndex(x => x.text === e.text && x.location === e.location) === i
    );

    // === AWAIT ASYNC CLICKUP RESULT (now that auto-slice is done) ===
    let clickupCopy: { subjectLine: string | null; previewText: string | null; taskId: string | null; taskUrl: string | null } = {
      subjectLine: null,
      previewText: null,
      taskId: null,
      taskUrl: null
    };
    
    if (clickupPromise) {
      console.log('[process] Awaiting ClickUp search result...');
      const clickupResult = await clickupPromise;
      if (clickupResult.found) {
        clickupCopy = {
          subjectLine: clickupResult.subjectLine,
          previewText: clickupResult.previewText,
          taskId: clickupResult.taskId,
          taskUrl: clickupResult.taskUrl
        };
        console.log('[process] ClickUp found - SL:', !!clickupCopy.subjectLine, 'PT:', !!clickupCopy.previewText);
      } else {
        console.log('[process] ClickUp search found no matching task');
      }
    }

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
      processing_completed_at: new Date().toISOString(),
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
