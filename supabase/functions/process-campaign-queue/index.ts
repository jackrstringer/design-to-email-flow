import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProcessRequest {
  campaignQueueId: string;
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

// Step 1: Fetch image from Figma or use provided URL
async function fetchAndUploadImage(
  supabase: any,
  item: any
): Promise<{ imageUrl: string; imageBase64: string } | null> {
  console.log('[process] Step 1: Fetching image...');

  // If source is 'upload' and we already have image_url, just fetch it as base64
  if (item.source === 'upload' && item.image_url) {
    console.log('[process] Using existing uploaded image URL');
    try {
      const response = await fetch(item.image_url);
      if (!response.ok) throw new Error('Failed to fetch image');
      const buffer = await response.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
      return { imageUrl: item.image_url, imageBase64: base64 };
    } catch (err) {
      console.error('[process] Failed to fetch uploaded image:', err);
      return null;
    }
  }

  // For Figma source, fetch from Figma API
  if (item.source === 'figma') {
    const metadata = item.source_metadata;
    const figmaToken = metadata?.figmaToken;
    
    if (!figmaToken) {
      console.error('[process] No Figma token available');
      return null;
    }

    const fileKey = metadata?.fileKey;
    const nodeId = metadata?.nodeId;

    if (!fileKey || !nodeId) {
      console.error('[process] Missing Figma file/node info');
      return null;
    }

    console.log('[process] Fetching from Figma:', fileKey, nodeId);

    try {
      // Get image URL from Figma API
      const figmaApiUrl = `https://api.figma.com/v1/images/${fileKey}?ids=${encodeURIComponent(nodeId)}&format=png&scale=2`;
      
      const figmaResponse = await fetch(figmaApiUrl, {
        headers: { 'X-Figma-Token': figmaToken }
      });

      if (!figmaResponse.ok) {
        console.error('[process] Figma API error:', await figmaResponse.text());
        return null;
      }

      const figmaData = await figmaResponse.json();
      const imageUrl = figmaData.images?.[nodeId];

      if (!imageUrl) {
        console.error('[process] No image URL returned from Figma');
        return null;
      }

      console.log('[process] Got Figma image URL, downloading...');

      // Download the image
      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) throw new Error('Failed to download Figma image');
      
      const imageBuffer = await imageResponse.arrayBuffer();
      const imageBase64 = btoa(String.fromCharCode(...new Uint8Array(imageBuffer)));

      // Upload to Cloudinary
      console.log('[process] Uploading to Cloudinary...');
      
      const cloudinaryUrl = Deno.env.get('SUPABASE_URL') + '/functions/v1/upload-to-cloudinary';
      const uploadResponse = await fetch(cloudinaryUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
        },
        body: JSON.stringify({
          imageBase64: `data:image/png;base64,${imageBase64}`,
          folder: 'campaign-queue'
        })
      });

      if (!uploadResponse.ok) {
        console.error('[process] Cloudinary upload failed');
        // Fall back to Figma URL (temporary)
        return { imageUrl, imageBase64 };
      }

      const uploadData = await uploadResponse.json();
      const finalUrl = uploadData.url || uploadData.secure_url || imageUrl;

      return { imageUrl: finalUrl, imageBase64 };

    } catch (err) {
      console.error('[process] Figma fetch error:', err);
      return null;
    }
  }

  return null;
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
        imageBase64,
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

// Step 4: Generate subject lines and preview texts
async function generateCopy(
  slices: any[],
  brandContext: any,
  imageUrl: string,
  copyExamples?: any
): Promise<{ subjectLines: string[]; previewTexts: string[] } | null> {
  console.log('[process] Step 4: Generating copy...');

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
        pairCount: 5,
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

// Step 5: QA spelling check
async function qaSpellingCheck(
  imageBase64: string
): Promise<{ hasErrors: boolean; errors: any[] }> {
  console.log('[process] Step 5: QA spelling check...');

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

    // === STEP 2: Detect brand (30%) ===
    await updateQueueItem(supabase, campaignQueueId, {
      processing_step: 'detecting_brand',
      processing_percent: 15
    });

    const brandId = await detectBrand(supabase, imageResult.imageBase64);
    
    let brandContext = null;
    let copyExamples = null;
    
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
          primaryColor: brand.primary_color
        };
        copyExamples = brand.copy_examples;
      }
    }

    await updateQueueItem(supabase, campaignQueueId, {
      brand_id: brandId,
      processing_percent: 30
    });

    // === STEP 3: Auto-slice image (50%) ===
    await updateQueueItem(supabase, campaignQueueId, {
      processing_step: 'slicing_image',
      processing_percent: 35
    });

    const sliceResult = await autoSliceImage(
      imageResult.imageBase64,
      item.image_width || 600,
      item.image_height || 2000
    );

    if (sliceResult) {
      await updateQueueItem(supabase, campaignQueueId, {
        slices: sliceResult.slices,
        footer_start_percent: sliceResult.footerStartPercent,
        processing_percent: 50
      });
    } else {
      await updateQueueItem(supabase, campaignQueueId, {
        processing_percent: 50
      });
    }

    // === STEP 4: Generate copy (85%) ===
    await updateQueueItem(supabase, campaignQueueId, {
      processing_step: 'generating_copy',
      processing_percent: 55
    });

    const copyResult = await generateCopy(
      sliceResult?.slices || [],
      brandContext,
      imageResult.imageUrl,
      copyExamples
    );

    if (copyResult) {
      await updateQueueItem(supabase, campaignQueueId, {
        generated_subject_lines: copyResult.subjectLines,
        generated_preview_texts: copyResult.previewTexts,
        selected_subject_line: copyResult.subjectLines[0] || null,
        selected_preview_text: copyResult.previewTexts[0] || null,
        processing_percent: 85
      });
    } else {
      await updateQueueItem(supabase, campaignQueueId, {
        processing_percent: 85
      });
    }

    // === STEP 5: QA spelling check (95%) ===
    await updateQueueItem(supabase, campaignQueueId, {
      processing_step: 'qa_check',
      processing_percent: 90
    });

    const qaResult = await qaSpellingCheck(imageResult.imageBase64);

    await updateQueueItem(supabase, campaignQueueId, {
      spelling_errors: qaResult.errors,
      qa_flags: qaResult.hasErrors ? { spelling: true } : null,
      processing_percent: 95
    });

    // === STEP 6: Complete (100%) ===
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
