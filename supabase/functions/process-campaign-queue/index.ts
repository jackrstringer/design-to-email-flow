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

// Step 1: Fetch image from URL or use existing uploaded image
async function fetchAndUploadImage(
  supabase: any,
  item: any
): Promise<{ imageUrl: string; imageBase64: string } | null> {
  console.log('[process] Step 1: Fetching image...');

  // If image_url already exists (from figma plugin or upload), just fetch it as base64
  if (item.image_url) {
    console.log('[process] Image already uploaded, fetching as base64...');
    try {
      const response = await fetch(item.image_url);
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

// Step 3.5: Analyze slices for alt text and links
async function analyzeSlices(
  slices: any[],
  imageBase64: string,
  brandDomain: string | null
): Promise<any[] | null> {
  console.log('[process] Step 3.5: Analyzing slices for alt text and links...');

  try {
    const analyzeUrl = Deno.env.get('SUPABASE_URL') + '/functions/v1/analyze-slices';
    
    // Convert slices to format analyze-slices expects
    // Each slice needs its own image data - we'll use the full image and let the endpoint handle it
    const sliceInputs = slices.map((slice, index) => ({
      dataUrl: slice.imageDataUrl || `data:image/png;base64,${imageBase64}`,
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
        fullCampaignImage: `data:image/png;base64,${imageBase64}`
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
    
    // Merge analysis into slices
    return slices.map((slice, i) => ({
      ...slice,
      altText: result.analyses[i]?.altText || `Email section ${i + 1}`,
      link: result.analyses[i]?.suggestedLink || slice.link || null,
      isClickable: result.analyses[i]?.isClickable ?? true
    }));

  } catch (err) {
    console.error('[process] Slice analysis error:', err);
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

    // === STEP 2: Detect brand (25%) ===
    // Skip brand detection if already set from plugin
    let brandId = item.brand_id;
    
    if (!brandId) {
      await updateQueueItem(supabase, campaignQueueId, {
        processing_step: 'detecting_brand',
        processing_percent: 15
      });

      brandId = await detectBrand(supabase, imageResult.imageBase64);
    } else {
      console.log('[process] Using brand from plugin:', brandId);
    }
    
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
      processing_percent: 25
    });

    // === STEP 3: Auto-slice image (45%) ===
    await updateQueueItem(supabase, campaignQueueId, {
      processing_step: 'slicing_image',
      processing_percent: 30
    });

    const sliceResult = await autoSliceImage(
      imageResult.imageBase64,
      item.image_width || 600,
      item.image_height || 2000
    );

    let currentSlices = sliceResult?.slices || [];

    if (sliceResult) {
      await updateQueueItem(supabase, campaignQueueId, {
        slices: sliceResult.slices,
        footer_start_percent: sliceResult.footerStartPercent,
        processing_percent: 45
      });
    } else {
      await updateQueueItem(supabase, campaignQueueId, {
        processing_percent: 45
      });
    }

    // === STEP 3.5: Analyze slices for alt text + links (60%) ===
    if (currentSlices.length > 0) {
      await updateQueueItem(supabase, campaignQueueId, {
        processing_step: 'analyzing_slices',
        processing_percent: 50
      });

      const enrichedSlices = await analyzeSlices(
        currentSlices,
        imageResult.imageBase64,
        brandContext?.domain || null
      );

      if (enrichedSlices) {
        currentSlices = enrichedSlices;
        await updateQueueItem(supabase, campaignQueueId, {
          slices: enrichedSlices,
          processing_percent: 60
        });
      }
    }

    // === STEP 4: Generate copy (80%) ===
    await updateQueueItem(supabase, campaignQueueId, {
      processing_step: 'generating_copy',
      processing_percent: 65
    });

    const copyResult = await generateCopy(
      currentSlices,
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
        processing_percent: 80
      });
    } else {
      await updateQueueItem(supabase, campaignQueueId, {
        processing_percent: 80
      });
    }

    // === STEP 5: QA spelling check (95%) ===
    await updateQueueItem(supabase, campaignQueueId, {
      processing_step: 'qa_check',
      processing_percent: 85
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
