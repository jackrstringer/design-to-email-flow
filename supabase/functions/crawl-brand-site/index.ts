import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');
const FIRECRAWL_API_URL = 'https://api.firecrawl.dev/v1';

// Skip patterns for utility pages
const SKIP_PATTERNS = [
  '/cart', '/account', '/login', '/checkout', '/search',
  '/policies', '/apps/', '/admin', '/password', '/register',
  '/wishlist', '/compare', '/api/', '/sitemap',
];

function categorizeUrl(url: string): 'product' | 'collection' | 'page' {
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes('/products/')) return 'product';
  if (lowerUrl.includes('/collections/')) return 'collection';
  return 'page';
}

function shouldSkipUrl(url: string): boolean {
  const lowerUrl = url.toLowerCase();
  return SKIP_PATTERNS.some(pattern => lowerUrl.includes(pattern));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let job_id: string | undefined;

  try {
    const body = await req.json();
    const { brand_id, domain } = body;
    job_id = body.job_id;

    if (!brand_id || !domain || !job_id) {
      throw new Error('brand_id, domain, and job_id are required');
    }

    if (!FIRECRAWL_API_KEY) {
      throw new Error('FIRECRAWL_API_KEY not configured');
    }

    console.log(`[crawl-brand-site] Starting crawl for ${domain}, job ${job_id}`);

    // Update job status to crawling
    await supabase
      .from('sitemap_import_jobs')
      .update({ 
        status: 'crawling', 
        started_at: new Date().toISOString() 
      })
      .eq('id', job_id);

    // Start Firecrawl crawl
    console.log(`[crawl-brand-site] Calling Firecrawl API for https://${domain}`);
    
    const crawlResponse = await fetch(`${FIRECRAWL_API_URL}/crawl`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        url: `https://${domain}`,
        limit: 200,  // Max pages to crawl
        scrapeOptions: {
          formats: ['markdown'],
          onlyMainContent: true
        }
      })
    });

    if (!crawlResponse.ok) {
      const errorText = await crawlResponse.text();
      console.error(`[crawl-brand-site] Firecrawl API error: ${crawlResponse.status}`, errorText);
      throw new Error(`Firecrawl API error: ${crawlResponse.status}`);
    }

    const crawlData = await crawlResponse.json();
    const crawlId = crawlData.id;

    if (!crawlId) {
      throw new Error('Firecrawl did not return a crawl ID');
    }

    console.log(`[crawl-brand-site] Crawl started with ID: ${crawlId}`);

    // Poll for crawl completion
    let crawlResult = null;
    let attempts = 0;
    const maxAttempts = 60;  // 5 minutes max (5s intervals)

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000));  // Wait 5 seconds
      
      const statusResponse = await fetch(`${FIRECRAWL_API_URL}/crawl/${crawlId}`, {
        headers: { 'Authorization': `Bearer ${FIRECRAWL_API_KEY}` }
      });

      if (!statusResponse.ok) {
        console.warn(`[crawl-brand-site] Status check failed: ${statusResponse.status}`);
        attempts++;
        continue;
      }

      const statusData = await statusResponse.json();
      
      console.log(`[crawl-brand-site] Crawl status: ${statusData.status}, completed: ${statusData.completed || 0}/${statusData.total || 0}`);

      // Update progress in database
      await supabase
        .from('sitemap_import_jobs')
        .update({ 
          urls_found: statusData.total || 0,
          urls_processed: statusData.completed || 0
        })
        .eq('id', job_id);

      if (statusData.status === 'completed') {
        crawlResult = statusData;
        break;
      } else if (statusData.status === 'failed') {
        throw new Error('Firecrawl crawl failed');
      }

      attempts++;
    }

    if (!crawlResult) {
      throw new Error('Crawl timed out after 5 minutes');
    }

    console.log(`[crawl-brand-site] Crawl complete. Found ${crawlResult.data?.length || 0} pages`);

    // Process crawled pages
    const links: Array<{ url: string; title: string; link_type: string }> = [];

    for (const page of crawlResult.data || []) {
      const url = page.metadata?.sourceURL || page.url;
      const title = page.metadata?.title || '';

      if (!url) continue;

      // Skip non-content pages
      if (shouldSkipUrl(url)) {
        continue;
      }

      // Only include same-domain URLs
      if (!url.includes(domain)) {
        continue;
      }

      const linkType = categorizeUrl(url);
      links.push({ url, title, link_type: linkType });
    }

    // Deduplicate by URL
    const uniqueLinks = Array.from(
      new Map(links.map(l => [l.url, l])).values()
    );

    console.log(`[crawl-brand-site] Filtered to ${uniqueLinks.length} unique content pages`);

    // Update job status to generating embeddings
    await supabase
      .from('sitemap_import_jobs')
      .update({ 
        status: 'generating_embeddings',
        urls_found: uniqueLinks.length,
        product_urls_count: uniqueLinks.filter(l => l.link_type === 'product').length,
        collection_urls_count: uniqueLinks.filter(l => l.link_type === 'collection').length
      })
      .eq('id', job_id);

    // Generate embeddings in batches
    const batchSize = 50;
    let processedCount = 0;

    for (let i = 0; i < uniqueLinks.length; i += batchSize) {
      const batch = uniqueLinks.slice(i, i + batchSize);
      const texts = batch.map(l => l.title || l.url);

      console.log(`[crawl-brand-site] Generating embeddings for batch ${Math.floor(i / batchSize) + 1}`);

      // Call our embedding function
      const embeddingResponse = await fetch(
        `${supabaseUrl}/functions/v1/generate-embedding`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ texts })
        }
      );

      if (!embeddingResponse.ok) {
        console.error(`[crawl-brand-site] Embedding generation failed:`, await embeddingResponse.text());
        // Continue without embeddings for this batch
        const insertData = batch.map((link) => ({
          brand_id,
          url: link.url,
          title: link.title || null,
          link_type: link.link_type,
          embedding: null,
          source: 'firecrawl',
          is_healthy: true,
          last_verified_at: new Date().toISOString()
        }));

        await supabase
          .from('brand_link_index')
          .upsert(insertData, { onConflict: 'brand_id,url', ignoreDuplicates: false });
      } else {
        const { embeddings } = await embeddingResponse.json();

        // Insert links with embeddings
        const insertData = batch.map((link, idx) => ({
          brand_id,
          url: link.url,
          title: link.title || null,
          link_type: link.link_type,
          embedding: embeddings?.[idx] || null,
          source: 'firecrawl',
          is_healthy: true,
          last_verified_at: new Date().toISOString()
        }));

        await supabase
          .from('brand_link_index')
          .upsert(insertData, { onConflict: 'brand_id,url', ignoreDuplicates: false });
      }

      processedCount += batch.length;

      // Update progress
      await supabase
        .from('sitemap_import_jobs')
        .update({ urls_processed: processedCount })
        .eq('id', job_id);
    }

    // Complete the job
    await supabase
      .from('sitemap_import_jobs')
      .update({ 
        status: 'complete',
        completed_at: new Date().toISOString(),
        urls_found: uniqueLinks.length,
        urls_processed: uniqueLinks.length
      })
      .eq('id', job_id);

    console.log(`[crawl-brand-site] Job complete. Imported ${uniqueLinks.length} links`);

    return new Response(
      JSON.stringify({ success: true, linksImported: uniqueLinks.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[crawl-brand-site] Error:', error);

    if (job_id) {
      await supabase
        .from('sitemap_import_jobs')
        .update({ 
          status: 'failed',
          error_message: error instanceof Error ? error.message : 'Unknown error'
        })
        .eq('id', job_id);
    }

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
