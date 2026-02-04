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

// Product cap - collections are uncapped
const MAX_PRODUCTS = 100;
const MAX_NAV_COLLECTIONS = 5000; // High limit to get all nav structure

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

function isProductUrl(url: string): boolean {
  return url.toLowerCase().includes('/products/');
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

    console.log(`[crawl-brand-site] Starting TWO-CATEGORY crawl for ${domain}, job ${job_id}`);

    // Update job status to crawling
    await supabase
      .from('sitemap_import_jobs')
      .update({ 
        status: 'crawling_nav', 
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', job_id);

    // =========================================================================
    // PHASE 1: Navigation & Collections (UNCAPPED)
    // Get all navigation structure - collections, categories, pages
    // =========================================================================
    console.log(`[crawl-brand-site] Phase 1: Discovering ALL nav/collection pages for https://${domain}`);
    
    const navResponse = await fetch(`${FIRECRAWL_API_URL}/map`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        url: `https://${domain}`,
        search: 'collections categories navigation menu',
        limit: MAX_NAV_COLLECTIONS,
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
    const allNavUrls: string[] = navData.links || [];
    console.log(`[crawl-brand-site] Phase 1 found ${allNavUrls.length} total URLs`);

    // Filter nav URLs - EXCLUDE product URLs, only keep collections/pages
    const navUrls = allNavUrls.filter(url => {
      if (!url) return false;
      if (shouldSkipUrl(url)) return false;
      if (!url.includes(domain)) return false;
      // Exclude product URLs - we'll get those separately
      if (isProductUrl(url)) return false;
      return true;
    });
    
    console.log(`[crawl-brand-site] Phase 1: ${navUrls.length} nav/collection URLs after filtering (uncapped)`);

    // Update job status
    await supabase
      .from('sitemap_import_jobs')
      .update({ 
        status: 'crawling',
        urls_found: navUrls.length,
        updated_at: new Date().toISOString()
      })
      .eq('id', job_id);

    // =========================================================================
    // PHASE 2: Products (SMART CAPPED at 100)
    // Prioritize best sellers, new arrivals, featured products
    // =========================================================================
    console.log(`[crawl-brand-site] Phase 2: Discovering priority products (max ${MAX_PRODUCTS})`);
    
    const productResponse = await fetch(`${FIRECRAWL_API_URL}/map`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        url: `https://${domain}`,
        // Priority search terms for relevant products
        search: 'products best sellers new arrivals featured popular trending sale',
        limit: MAX_PRODUCTS * 2, // Get more to filter down
        includeSubdomains: false
      })
    });

    let productUrls: string[] = [];
    if (productResponse.ok) {
      const productData = await productResponse.json();
      const allProductUrls: string[] = productData.links || [];
      
      // Filter to ONLY product URLs and cap at MAX_PRODUCTS
      productUrls = allProductUrls
        .filter(url => url && isProductUrl(url) && !shouldSkipUrl(url) && url.includes(domain))
        .slice(0, MAX_PRODUCTS);
      
      console.log(`[crawl-brand-site] Phase 2: ${productUrls.length} product URLs (capped at ${MAX_PRODUCTS})`);
    } else {
      console.warn(`[crawl-brand-site] Phase 2 product fetch failed, continuing with nav URLs only`);
    }

    // =========================================================================
    // COMBINE AND DEDUPE
    // =========================================================================
    const allUrls = [...new Set([...navUrls, ...productUrls])];
    const collectionCount = navUrls.length;
    const productCount = productUrls.length;
    
    console.log(`[crawl-brand-site] Total unique URLs: ${allUrls.length} (${collectionCount} nav/collections + ${productCount} products)`);

    // Update job with final counts
    await supabase
      .from('sitemap_import_jobs')
      .update({ 
        status: 'generating_embeddings',
        urls_found: allUrls.length,
        product_urls_count: productCount,
        collection_urls_count: collectionCount,
        updated_at: new Date().toISOString()
      })
      .eq('id', job_id);

    // Build links with titles from URL
    const links = allUrls.map(url => ({
      url,
      title: titleFromUrl(url),
      link_type: categorizeUrl(url)
    }));

    // =========================================================================
    // GENERATE EMBEDDINGS AND SAVE
    // =========================================================================
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

    // =========================================================================
    // COMPLETE JOB AND UPDATE BRAND
    // =========================================================================
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

    // Update brand's last_crawled_at timestamp
    await supabase
      .from('brands')
      .update({ 
        last_crawled_at: new Date().toISOString()
      })
      .eq('id', brand_id);

    console.log(`[crawl-brand-site] Job complete. Imported ${links.length} links (${collectionCount} nav/collections + ${productCount} products)`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        linksImported: links.length,
        collectionCount,
        productCount
      }),
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
