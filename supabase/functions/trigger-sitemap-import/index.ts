// deploy-trigger
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

    const { brand_id, sitemap_url, domain } = await req.json();

    if (!brand_id) {
      throw new Error('brand_id is required');
    }

    // Domain is required for Firecrawl crawling
    if (!domain && !sitemap_url) {
      throw new Error('Either domain or sitemap_url is required');
    }

    const effectiveDomain = domain || new URL(sitemap_url).hostname;
    const useFirecrawl = !sitemap_url; // Use Firecrawl if no sitemap URL provided

    console.log(`[trigger-sitemap-import] ${useFirecrawl ? 'Firecrawl crawl' : 'Sitemap import'} for brand ${brand_id}: ${effectiveDomain}`);

    const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

    // Check if there's already a running import for this brand
    const { data: existingJob } = await supabase
      .from('sitemap_import_jobs')
      .select('id, status, updated_at')
      .eq('brand_id', brand_id)
      .in('status', ['pending', 'parsing', 'crawling', 'crawling_nav', 'fetching_titles', 'generating_embeddings'])
      .single();

    if (existingJob) {
      // Check if job is stale (no activity for 10+ minutes)
      const lastUpdate = new Date(existingJob.updated_at).getTime();
      const isStale = (Date.now() - lastUpdate) > STALE_THRESHOLD_MS;
      
      if (isStale) {
        // Mark stale job as failed and allow new trigger
        console.log(`[trigger-sitemap-import] Marking stale job ${existingJob.id} as failed (last update: ${existingJob.updated_at})`);
        await supabase
          .from('sitemap_import_jobs')
          .update({ 
            status: 'failed',
            error_message: 'Job timed out - no activity for 10+ minutes',
            completed_at: new Date().toISOString()
          })
          .eq('id', existingJob.id);
      } else {
        throw new Error('An import is already in progress for this brand');
      }
    }

    // Create job record
    const { data: job, error: jobError } = await supabase
      .from('sitemap_import_jobs')
      .insert({
        brand_id,
        sitemap_url: sitemap_url || `https://${effectiveDomain}`, // Store domain URL if no sitemap
        status: 'pending',
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (jobError) throw jobError;

    console.log(`[trigger-sitemap-import] Created import job ${job.id}`);

    // Update brand's link_preferences if sitemap_url provided
    if (sitemap_url) {
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
    }

    // Choose which function to call based on whether we have a sitemap URL
    if (useFirecrawl) {
      // Use Firecrawl for comprehensive site crawling
      const crawlUrl = `${supabaseUrl}/functions/v1/crawl-brand-site`;
      fetch(crawlUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          brand_id,
          domain: effectiveDomain,
          job_id: job.id,
        }),
      }).catch(err => {
        console.error('[trigger-sitemap-import] Error triggering crawl-brand-site:', err);
      });

      console.log(`[trigger-sitemap-import] Triggered crawl-brand-site for job ${job.id}`);
    } else {
      // Use legacy sitemap import
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
        console.error('[trigger-sitemap-import] Error triggering import-sitemap:', err);
      });

      console.log(`[trigger-sitemap-import] Triggered import-sitemap for job ${job.id}`);
    }

    return new Response(JSON.stringify({ job }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[trigger-sitemap-import] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
