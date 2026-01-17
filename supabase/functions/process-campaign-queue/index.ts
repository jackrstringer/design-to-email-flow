import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";

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

// Helper to convert base64 to Uint8Array
function base64ToBytes(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Helper to convert Uint8Array to base64
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Step 1: Fetch image from URL or use existing uploaded image
// Uses Cloudinary URL transformation to resize large images BEFORE fetching
async function fetchAndUploadImage(
  supabase: any,
  item: any
): Promise<{ imageUrl: string; imageBase64: string } | null> {
  console.log('[process] Step 1: Fetching image...');

  // If image_url already exists (from figma plugin or upload), just fetch it as base64
  if (item.image_url) {
    console.log('[process] Image already uploaded, fetching as base64...');
    try {
      // CRITICAL: Resize via Cloudinary URL transformation BEFORE fetching
      // This prevents memory issues with large images (e.g., 1200x8000)
      // Max 600px wide (email standard), max 4000px tall (leaves room for processing)
      const resizedUrl = getResizedCloudinaryUrl(item.image_url, 600, 4000);
      console.log('[process] Using resized URL:', resizedUrl.substring(0, 80) + '...');
      
      const response = await fetch(resizedUrl);
      if (!response.ok) throw new Error('Failed to fetch image');
      const buffer = await response.arrayBuffer();
      const uint8Array = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < uint8Array.length; i++) {
        binary += String.fromCharCode(uint8Array[i]);
      }
      const base64 = btoa(binary);
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
    // CRITICAL: Resize image URL for Anthropic (max 600x7900 to stay under 8000px limit)
    const resizedImageUrl = getResizedCloudinaryUrl(imageUrl, 600, 7900);
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
async function autoSliceImage(
  imageBase64: string,
  imageWidth: number,
  imageHeight: number
): Promise<{ slices: any[]; footerStartPercent: number } | null> {
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
    
    console.log('[process] Found', result.slices?.length || 0, 'slices');
    
    return {
      slices: result.slices || [],
      footerStartPercent
    };

  } catch (err) {
    console.error('[process] Auto-slice error:', err);
    return null;
  }
}

// Step 3.5: Crop and upload each slice individually (matches CampaignCreator.processSlices)
async function cropAndUploadSlices(
  imageBase64: string,
  sliceBoundaries: any[],
  imageWidth: number,
  imageHeight: number
): Promise<any[]> {
  console.log('[process] Step 3.5: Cropping and uploading slices...');

  try {
    // Decode the full image
    const imageBytes = base64ToBytes(imageBase64);
    const fullImage = await Image.decode(imageBytes);

    // CRITICAL FIX: Use actual decoded image dimensions, NOT the passed parameters
    // The passed imageWidth/imageHeight may be wrong (1x vs 2x retina mismatch)
    const actualWidth = fullImage.width;
    const actualHeight = fullImage.height;
    
    console.log(`[process] Actual image dimensions: ${actualWidth}x${actualHeight} (passed: ${imageWidth}x${imageHeight})`);

    const uploadedSlices: any[] = [];

    for (let i = 0; i < sliceBoundaries.length; i++) {
      const slice = sliceBoundaries[i];
      const yTop = slice.yTop;
      const yBottom = slice.yBottom;
      const height = yBottom - yTop;
      
      console.log(`[process] Cropping slice ${i + 1}/${sliceBoundaries.length}: y=${yTop}-${yBottom}, h=${height}, w=${actualWidth}`);

      // Clone and crop the slice region - use ACTUAL width from decoded image
      const sliceImage = fullImage.clone().crop(0, yTop, actualWidth, height);
      
      // Encode as JPEG (matches client-side sliceImage which uses JPEG)
      const sliceBytes = await sliceImage.encodeJPEG(90);
      const sliceBase64 = bytesToBase64(sliceBytes);
      const sliceDataUrl = `data:image/jpeg;base64,${sliceBase64}`;

      // Upload to Cloudinary via edge function
      const uploadUrl = Deno.env.get('SUPABASE_URL') + '/functions/v1/upload-to-cloudinary';
      const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
        },
        body: JSON.stringify({ imageData: sliceDataUrl })
      });

      let uploadResult = null;
      if (uploadResponse.ok) {
        uploadResult = await uploadResponse.json();
        console.log(`[process] Slice ${i + 1} uploaded:`, uploadResult?.url?.substring(0, 50));
      } else {
        console.error(`[process] Failed to upload slice ${i + 1}:`, await uploadResponse.text());
      }

      uploadedSlices.push({
        ...slice,
        imageUrl: uploadResult?.url || null,
        dataUrl: sliceDataUrl,
        width: actualWidth,
        height: height,
        startPercent: (yTop / actualHeight) * 100,
        endPercent: (yBottom / actualHeight) * 100,
        type: slice.hasCta ? 'cta' : 'image',
      });
    }

    console.log('[process] Uploaded', uploadedSlices.length, 'slices');
    return uploadedSlices;

  } catch (err) {
    console.error('[process] Slice cropping error:', err);
    return [];
  }
}

// Step 4: Analyze slices for alt text and links (uses cropped slice dataUrls)
async function analyzeSlices(
  slices: any[],
  fullImageUrl: string, // Cloudinary URL (will be resized for AI)
  brandDomain: string | null
): Promise<any[] | null> {
  console.log('[process] Step 4: Analyzing slices for alt text and links...');

  try {
    const analyzeUrl = Deno.env.get('SUPABASE_URL') + '/functions/v1/analyze-slices';
    
    // Resize the full image URL for AI processing (keep under 8000px height limit)
    const resizedFullImageUrl = getResizedCloudinaryUrl(fullImageUrl, 600, 7900);
    console.log('[process] Using resized URL for analysis:', resizedFullImageUrl.substring(0, 80) + '...');
    
    // Fetch the resized image and convert to base64 for the analyze-slices function
    const imageResponse = await fetch(resizedFullImageUrl);
    if (!imageResponse.ok) {
      console.error('[process] Failed to fetch resized image for analysis');
      return null;
    }
    const imageBuffer = await imageResponse.arrayBuffer();
    const imageBase64 = bytesToBase64(new Uint8Array(imageBuffer));
    const fullImageDataUrl = `data:image/png;base64,${imageBase64}`;
    
    // CRITICAL: Pass the actual cropped slice dataUrls (matches CampaignCreator line 208)
    const sliceInputs = slices.map((slice, index) => ({
      dataUrl: slice.dataUrl, // Use the cropped slice's dataUrl, NOT the full image
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
    
    // Merge analysis into slices
    return slices.map((slice, i) => {
      const analysis = analysisByIndex.get(i);
      return {
        ...slice,
        altText: analysis?.altText || `Email section ${i + 1}`,
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
        clickupApiKey = brand.clickup_api_key;
        clickupListId = brand.clickup_list_id;
        clickupWorkspaceId = brand.clickup_workspace_id;
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

    // === STEP 2: Detect brand (25%) ===
    // Skip brand detection if already set from plugin
    if (!brandId) {
      await updateQueueItem(supabase, campaignQueueId, {
        processing_step: 'detecting_brand',
        processing_percent: 15
      });

      brandId = await detectBrand(supabase, imageResult.imageBase64);
      
      // Get brand info if newly detected
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
        }
      }
    } else {
      console.log('[process] Using brand from plugin:', brandId);
    }

    await updateQueueItem(supabase, campaignQueueId, {
      brand_id: brandId,
      processing_percent: 25
    });

    // === STEP 3: Auto-slice image (35%) ===
    await updateQueueItem(supabase, campaignQueueId, {
      processing_step: 'slicing_image',
      processing_percent: 30
    });

    const sliceResult = await autoSliceImage(
      imageResult.imageBase64,
      item.image_width || 600,
      item.image_height || 2000
    );

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

    // === STEP 3.5: Crop and upload each slice individually (45%) ===
    await updateQueueItem(supabase, campaignQueueId, {
      processing_step: 'uploading_slices',
      processing_percent: 40
    });

    const uploadedSlices = await cropAndUploadSlices(
      imageResult.imageBase64,
      sliceResult.slices,
      item.image_width || 600,
      item.image_height || 2000
    );

    if (uploadedSlices.length === 0) {
      await updateQueueItem(supabase, campaignQueueId, {
        status: 'failed',
        processing_step: 'uploading_slices',
        error_message: 'Failed to crop and upload slices'
      });
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to upload slices' }),
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

    const enrichedSlices = await analyzeSlices(
      uploadedSlices,
      imageResult.imageUrl, // Pass Cloudinary URL, analyzeSlices will resize for AI
      brandContext?.domain || null
    );

    let currentSlices = enrichedSlices || uploadedSlices;

    await updateQueueItem(supabase, campaignQueueId, {
      slices: currentSlices,
      processing_percent: 60
    });

    // === STEP 5: Generate copy (80%) ===
    await updateQueueItem(supabase, campaignQueueId, {
      processing_step: 'generating_copy',
      processing_percent: 65
    });

    // Resize image URL for AI processing (keep under 8000px height limit)
    const resizedCampaignImageUrl = getResizedCloudinaryUrl(imageResult.imageUrl, 600, 7900);
    console.log('[process] Copy gen using resized URL:', resizedCampaignImageUrl.substring(0, 80) + '...');
    
    const copyResult = await generateCopy(
      currentSlices,
      brandContext,
      resizedCampaignImageUrl,
      copyExamples
    );

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

    const qaResult = await qaSpellingCheck(imageResult.imageBase64);

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
