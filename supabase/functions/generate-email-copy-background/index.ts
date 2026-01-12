import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const EdgeRuntime: {
  waitUntil: (promise: Promise<unknown>) => void;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    console.log(`[Background] Starting generation for campaign ${campaignId}`);

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
          console.log(`[Background] Using campaign image: ${campaignImageUrl!.substring(0, 80)}...`);
        }
        
        if (brandId) {
          const { data: brandData } = await supabase
            .from('brands')
            .select('copy_examples')
            .eq('id', brandId)
            .single();
          
          if (brandData?.copy_examples) {
            copyExamples = brandData.copy_examples as { subjectLines: string[]; previewTexts: string[] };
            console.log(`[Background] Found ${copyExamples.subjectLines?.length || 0} copy examples`);
          }
        }

        // Run SL/PT generation and spelling QA in parallel
        const [generateResponse, qaResponse] = await Promise.all([
          // Generate subject lines and preview texts
          fetch(`${supabaseUrl}/functions/v1/generate-email-copy`, {
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
              campaignImageUrl,
            }),
          }),
          // Run spelling QA with imageUrl (background-friendly)
          campaignImageUrl ? fetch(`${supabaseUrl}/functions/v1/qa-spelling-check`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({ imageUrl: campaignImageUrl }),
          }) : Promise.resolve(null),
        ]);

        if (!generateResponse.ok) {
          const errorText = await generateResponse.text();
          console.error(`[Background] Generation failed:`, errorText);
          return;
        }

        const generateData = await generateResponse.json();
        
        if (!generateData.subjectLines?.length && !generateData.previewTexts?.length) {
          console.error('[Background] No content generated');
          return;
        }

        // Process spelling QA results
        let spellingErrors: Array<{ text: string; correction: string; location: string }> = [];
        if (qaResponse && qaResponse.ok) {
          const qaData = await qaResponse.json();
          if (qaData?.errors?.length > 0) {
            spellingErrors = qaData.errors;
            console.log(`[Background] Found ${spellingErrors.length} spelling errors`);
          } else {
            console.log('[Background] No spelling errors found');
          }
        } else if (qaResponse) {
          console.error('[Background] QA check failed:', await qaResponse.text());
        }

        // Save to campaign with spelling errors
        const { error: updateError } = await supabase
          .from('campaigns')
          .update({
            generated_copy: {
              subjectLines: generateData.subjectLines || [],
              previewTexts: generateData.previewTexts || [],
              spellingErrors,
              generatedAt: new Date().toISOString(),
            },
          })
          .eq('id', campaignId);

        if (updateError) {
          console.error('[Background] Failed to save:', updateError);
          return;
        }

        const elapsed = Date.now() - startTime;
        console.log(`[Background] Completed for campaign ${campaignId} in ${elapsed}ms - ${generateData.subjectLines?.length} SLs, ${generateData.previewTexts?.length} PTs, ${spellingErrors.length} spelling errors`);
      } catch (err) {
        console.error('[Background] Background task error:', err);
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
    console.error('[Background] Error:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
