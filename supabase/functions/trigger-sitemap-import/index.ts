import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { brand_id, sitemap_url } = await req.json();

    if (!brand_id || !sitemap_url) {
      throw new Error('brand_id and sitemap_url are required');
    }

    console.log(`Triggering sitemap import for brand ${brand_id}: ${sitemap_url}`);

    // Check if there's already a running import for this brand
    const { data: existingJob } = await supabase
      .from('sitemap_import_jobs')
      .select('id, status')
      .eq('brand_id', brand_id)
      .in('status', ['pending', 'parsing', 'fetching_titles', 'generating_embeddings'])
      .single();

    if (existingJob) {
      throw new Error('An import is already in progress for this brand');
    }

    // Create job record
    const { data: job, error: jobError } = await supabase
      .from('sitemap_import_jobs')
      .insert({
        brand_id,
        sitemap_url,
        status: 'pending',
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (jobError) throw jobError;

    console.log(`Created import job ${job.id}`);

    // Update brand's link_preferences with sitemap_url
    const { data: brand } = await supabase
      .from('brands')
      .select('link_preferences')
      .eq('id', brand_id)
      .single();

    const currentPrefs = brand?.link_preferences || {};
    await supabase
      .from('brands')
      .update({
        link_preferences: {
          ...currentPrefs,
          sitemap_url,
        },
      })
      .eq('id', brand_id);

    // Fire async call to import-sitemap (non-blocking)
    const importUrl = `${supabaseUrl}/functions/v1/import-sitemap`;
    fetch(importUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        brand_id,
        sitemap_url,
        job_id: job.id,
      }),
    }).catch(err => {
      console.error('Error triggering import-sitemap:', err);
    });

    console.log(`Triggered import-sitemap for job ${job.id}`);

    return new Response(JSON.stringify({ job }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error triggering sitemap import:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
