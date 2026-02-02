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
  '/wishlist', '/compare', '/api/', '/sitemap', '?', '#',
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

// Extract title from URL path (fallback when we can't fetch)
function titleFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const segments = pathname.split('/').filter(Boolean);
    const lastSegment = segments[segments.length - 1] || '';
    return lastSegment
      .replace(/-/g, ' ')
      .replace(/_/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  } catch {
    return url;
  }
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
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', job_id);

    // Two-phase discovery: collections first, then products
    const MAX_TOTAL = 100;
    
    // Phase 1: Discover navigation/collection pages first
    console.log(`[crawl-brand-site] Phase 1: Discovering collection/nav pages for https://${domain}`);
    
    const navResponse = await fetch(`${FIRECRAWL_API_URL}/map`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        url: `https://${domain}`,
        search: 'collections',
        limit: MAX_TOTAL,
        includeSubdomains: false
      })
    });

    // Handle API errors with user-friendly messages
    if (!navResponse.ok) {
      const errorText = await navResponse.text();
      console.error(`[crawl-brand-site] Firecrawl Map API error: ${navResponse.status}`, errorText);
      
      let userMessage = 'Failed to crawl site';
      if (navResponse.status === 402) {
        userMessage = 'Firecrawl API credits exhausted. Please add credits at firecrawl.dev/pricing';
      } else if (navResponse.status === 429) {
        userMessage = 'Rate limited by Firecrawl. Please try again in a few minutes.';
      } else if (navResponse.status === 401) {
        userMessage = 'Firecrawl API key is invalid. Please check your configuration.';
      } else {
        try {
          const errorData = JSON.parse(errorText);
          if (errorData.error) {
            userMessage = errorData.error;
          }
        } catch {
          userMessage = `Firecrawl API error (${navResponse.status})`;
        }
      }
      
      await supabase
        .from('sitemap_import_jobs')
        .update({ 
          status: 'failed',
          error_message: userMessage,
          updated_at: new Date().toISOString()
        })
        .eq('id', job_id);
      
      throw new Error(userMessage);
    }

    const navData = await navResponse.json();
    const navUrls: string[] = navData.links || [];
    console.log(`[crawl-brand-site] Phase 1 found ${navUrls.length} collection/nav URLs`);

    // Filter nav URLs
    const navFiltered = navUrls.filter(url => {
      if (!url) return false;
      if (shouldSkipUrl(url)) return false;
      if (!url.includes(domain)) return false;
      return true;
    });

    // Phase 2: Fill remaining quota with products
    const remainingQuota = Math.max(0, MAX_TOTAL - navFiltered.length);
    let productUrls: string[] = [];

    if (remainingQuota > 0) {
      console.log(`[crawl-brand-site] Phase 2: Discovering up to ${remainingQuota} product pages`);
      
      const productResponse = await fetch(`${FIRECRAWL_API_URL}/map`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          url: `https://${domain}`,
          search: 'products',
          limit: remainingQuota,
          includeSubdomains: false
        })
      });

      if (productResponse.ok) {
        const productData = await productResponse.json();
        productUrls = (productData.links || []).filter((url: string) => 
          url && !shouldSkipUrl(url) && url.includes(domain)
        );
        console.log(`[crawl-brand-site] Phase 2 found ${productUrls.length} product URLs`);
      } else {
        console.warn(`[crawl-brand-site] Phase 2 product fetch failed, continuing with nav URLs only`);
      }
    } else {
      console.log(`[crawl-brand-site] Phase 2 skipped - nav URLs already at quota`);
    }

    // Merge and deduplicate (nav links take priority)
    const allUrls = [...new Set([...navFiltered, ...productUrls])];
    console.log(`[crawl-brand-site] Total unique URLs after merge: ${allUrls.length}`);

    // Immediately update with URLs found count
    await supabase
      .from('sitemap_import_jobs')
      .update({ 
        urls_found: allUrls.length,
        updated_at: new Date().toISOString()
      })
      .eq('id', job_id);

    // Build links with titles from URL (already filtered)
    const links = allUrls.map(url => ({
      url,
      title: titleFromUrl(url),
      link_type: categorizeUrl(url)
    }));

    const productCount = links.filter(l => l.link_type === 'product').length;
    const collectionCount = links.filter(l => l.link_type === 'collection').length;

    // Update job status to generating embeddings
    await supabase
      .from('sitemap_import_jobs')
      .update({ 
        status: 'generating_embeddings',
        urls_found: links.length,
        product_urls_count: productCount,
        collection_urls_count: collectionCount,
        updated_at: new Date().toISOString()
      })
      .eq('id', job_id);

    // Generate embeddings in batches
    const batchSize = 50;
    let processedCount = 0;

    for (let i = 0; i < links.length; i += batchSize) {
      const batch = links.slice(i, i + batchSize);
      const texts = batch.map(l => l.title || l.url);

      console.log(`[crawl-brand-site] Generating embeddings for batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(links.length / batchSize)}`);

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

      let embeddings: any[] | null = null;
      if (embeddingResponse.ok) {
        const embeddingData = await embeddingResponse.json();
        embeddings = embeddingData.embeddings;
      } else {
        console.error(`[crawl-brand-site] Embedding generation failed:`, await embeddingResponse.text());
      }

      // Insert links with or without embeddings
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

      processedCount += batch.length;

      // Update progress AND updated_at to show job is alive
      await supabase
        .from('sitemap_import_jobs')
        .update({ 
          urls_processed: processedCount,
          updated_at: new Date().toISOString()
        })
        .eq('id', job_id);

      console.log(`[crawl-brand-site] Saved batch ${Math.floor(i / batchSize) + 1}, ${processedCount}/${links.length}`);
    }

    // Complete the job
    await supabase
      .from('sitemap_import_jobs')
      .update({ 
        status: 'complete',
        completed_at: new Date().toISOString(),
        urls_found: links.length,
        urls_processed: links.length,
        product_urls_count: productCount,
        collection_urls_count: collectionCount
      })
      .eq('id', job_id);

    console.log(`[crawl-brand-site] Job complete. Imported ${links.length} links`);

    return new Response(
      JSON.stringify({ success: true, linksImported: links.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[crawl-brand-site] Error:', error);

    if (job_id) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await supabase
        .from('sitemap_import_jobs')
        .update({ 
          status: 'failed',
          error_message: errorMessage,
          updated_at: new Date().toISOString()
        })
        .eq('id', job_id);
    }

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
