// deploy-trigger
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const EdgeRuntime: {
  waitUntil: (promise: Promise<unknown>) => void;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  
  try {
    const { campaignId, slices, brandContext, brandId } = await req.json();
    
    if (!campaignId) {
      throw new Error('campaignId is required');
    }

    console.log(`[Background SL] Starting generation for campaign ${campaignId}`);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Start the background task
    const backgroundTask = async () => {
      try {
        // Fetch copy examples and campaign image URL for brand if brandId provided
        let copyExamples: { subjectLines: string[]; previewTexts: string[] } | undefined;
        let campaignImageUrl: string | undefined;
        
        // Fetch campaign's original_image_url for QA analysis
        const { data: campaignData } = await supabase
          .from('campaigns')
          .select('original_image_url')
          .eq('id', campaignId)
          .single();
        
        if (campaignData?.original_image_url) {
          campaignImageUrl = campaignData.original_image_url;
          console.log(`[Background SL] Using campaign image for QA: ${campaignImageUrl!.substring(0, 80)}...`);
        }
        
        if (brandId) {
          const { data: brandData } = await supabase
            .from('brands')
            .select('copy_examples')
            .eq('id', brandId)
            .single();
          
          if (brandData?.copy_examples) {
            copyExamples = brandData.copy_examples as { subjectLines: string[]; previewTexts: string[] };
            console.log(`[Background SL] Found ${copyExamples.subjectLines?.length || 0} copy examples`);
          }
        }

        // Call the generate-email-copy function
        const generateResponse = await fetch(`${supabaseUrl}/functions/v1/generate-email-copy`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            slices: slices.map((s: any) => ({
              altText: s.altText,
              link: s.link,
              imageUrl: s.imageUrl,
            })),
            brandContext,
            pairCount: 10,
            copyExamples,
            campaignImageUrl, // Pass full campaign image for QA
          }),
        });

        if (!generateResponse.ok) {
          const errorText = await generateResponse.text();
          console.error(`[Background SL] Generation failed:`, errorText);
          return;
        }

        const generateData = await generateResponse.json();
        
        if (!generateData.subjectLines?.length && !generateData.previewTexts?.length) {
          console.error('[Background SL] No content generated');
          return;
        }

        // Save to campaign - spelling QA is now handled by dedicated function
        const { error: updateError } = await supabase
          .from('campaigns')
          .update({
            generated_copy: {
              subjectLines: generateData.subjectLines || [],
              previewTexts: generateData.previewTexts || [],
              generatedAt: new Date().toISOString(),
            },
          })
          .eq('id', campaignId);

        if (updateError) {
          console.error('[Background SL] Failed to save:', updateError);
          return;
        }

        const elapsed = Date.now() - startTime;
        console.log(`[Background SL] Completed for campaign ${campaignId} in ${elapsed}ms - ${generateData.subjectLines?.length} SLs, ${generateData.previewTexts?.length} PTs`);
      } catch (err) {
        console.error('[Background SL] Background task error:', err);
      }
    };

    // Use waitUntil for true background execution
    EdgeRuntime.waitUntil(backgroundTask());

    // Return immediately
    return new Response(
      JSON.stringify({ success: true, message: 'Background generation started' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Background SL] Error:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
