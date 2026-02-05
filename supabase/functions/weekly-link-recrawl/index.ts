// deploy-trigger
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

/**
 * Weekly Link Re-crawl Automation
 * 
 * This function is triggered weekly (via cron) to refresh the link index for all brands.
 * It finds brands that haven't been crawled in 7+ days (or never) and triggers a re-crawl.
 * 
 * This ensures:
 * - New seasonal collections are indexed (e.g., Winter 2025 replaces Winter 2024)
 * - New products from best sellers/new arrivals are captured
 * - Dead links are eventually replaced
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    console.log('[weekly-link-recrawl] Starting weekly link refresh check...');

    // Calculate 7 days ago
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoISO = sevenDaysAgo.toISOString();

    // Find brands that need re-crawling:
    // - Never crawled (last_crawled_at is null)
    // - Last crawled more than 7 days ago
    const { data: brands, error: brandsError } = await supabase
      .from('brands')
      .select('id, domain, name, last_crawled_at')
      .or(`last_crawled_at.is.null,last_crawled_at.lt.${sevenDaysAgoISO}`);

    if (brandsError) {
      console.error('[weekly-link-recrawl] Error fetching brands:', brandsError);
      throw brandsError;
    }

    if (!brands || brands.length === 0) {
      console.log('[weekly-link-recrawl] No brands need re-crawling');
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No brands need re-crawling',
          brandsProcessed: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[weekly-link-recrawl] Found ${brands.length} brands that need re-crawling`);

    const results: Array<{ brandId: string; brandName: string; status: string; jobId?: string; error?: string }> = [];
    
    // Process each brand with staggered timing to avoid rate limits
    for (let i = 0; i < brands.length; i++) {
      const brand = brands[i];
      
      // Skip brands without a domain
      if (!brand.domain) {
        console.log(`[weekly-link-recrawl] Skipping ${brand.name} - no domain configured`);
        results.push({ 
          brandId: brand.id, 
          brandName: brand.name || 'Unknown', 
          status: 'skipped', 
          error: 'No domain configured' 
        });
        continue;
      }

      try {
        console.log(`[weekly-link-recrawl] Triggering re-crawl for ${brand.name} (${brand.domain})`);

        // Create a new sitemap import job
        const { data: job, error: jobError } = await supabase
          .from('sitemap_import_jobs')
          .insert({
            brand_id: brand.id,
            sitemap_url: `https://${brand.domain}`,
            status: 'pending',
            urls_found: 0,
            urls_processed: 0,
            urls_failed: 0,
            product_urls_count: 0,
            collection_urls_count: 0
          })
          .select()
          .single();

        if (jobError || !job) {
          console.error(`[weekly-link-recrawl] Failed to create job for ${brand.name}:`, jobError);
          results.push({ 
            brandId: brand.id, 
            brandName: brand.name || 'Unknown', 
            status: 'failed', 
            error: jobError?.message || 'Failed to create job' 
          });
          continue;
        }

        // Trigger the crawl-brand-site function
        const crawlResponse = await fetch(
          `${supabaseUrl}/functions/v1/crawl-brand-site`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseServiceKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              brand_id: brand.id,
              domain: brand.domain,
              job_id: job.id
            })
          }
        );

        if (!crawlResponse.ok) {
          const errorText = await crawlResponse.text();
          console.error(`[weekly-link-recrawl] Crawl failed for ${brand.name}:`, errorText);
          results.push({ 
            brandId: brand.id, 
            brandName: brand.name || 'Unknown', 
            status: 'failed', 
            jobId: job.id,
            error: errorText 
          });
        } else {
          console.log(`[weekly-link-recrawl] Successfully triggered crawl for ${brand.name}`);
          results.push({ 
            brandId: brand.id, 
            brandName: brand.name || 'Unknown', 
            status: 'triggered', 
            jobId: job.id 
          });
        }

        // Stagger requests by 2 seconds to avoid rate limits
        if (i < brands.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }

      } catch (err) {
        console.error(`[weekly-link-recrawl] Error processing ${brand.name}:`, err);
        results.push({ 
          brandId: brand.id, 
          brandName: brand.name || 'Unknown', 
          status: 'error', 
          error: err instanceof Error ? err.message : 'Unknown error' 
        });
      }
    }

    const triggered = results.filter(r => r.status === 'triggered').length;
    const failed = results.filter(r => r.status === 'failed' || r.status === 'error').length;
    const skipped = results.filter(r => r.status === 'skipped').length;

    console.log(`[weekly-link-recrawl] Complete. Triggered: ${triggered}, Failed: ${failed}, Skipped: ${skipped}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Processed ${brands.length} brands`,
        brandsProcessed: brands.length,
        triggered,
        failed,
        skipped,
        results
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[weekly-link-recrawl] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
