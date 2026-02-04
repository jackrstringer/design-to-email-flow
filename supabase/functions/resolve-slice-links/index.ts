import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SliceToResolve {
  index: number;
  description: string;  // Product name, text, etc.
  altText?: string;
  imageUrl?: string;    // Cloudinary crop URL for this slice
  currentLink?: string; // Current assigned link (to check if imperfect)
  column?: number;
  totalColumns?: number;
}

interface ResolvedLink {
  index: number;
  url: string | null;
  source: 'cache' | 'shopify_suggest' | 'web_search' | 'not_found';
  confidence: number;
}

interface RequestBody {
  brandId: string;
  brandDomain: string;
  slices: SliceToResolve[];
}

/**
 * Try Shopify predictive search first (fast, free, no AI)
 */
async function tryShopifySearch(domain: string, query: string): Promise<string | null> {
  try {
    // Clean up query - extract product-like terms
    const cleanQuery = query
      .replace(/shop\s*(now|the|our)?/gi, '')
      .replace(/click\s*to\s*/gi, '')
      .replace(/\$[\d,.]+/g, '')  // Remove prices
      .replace(/[^\w\s-]/g, ' ')
      .trim()
      .split(/\s+/)
      .slice(0, 4)  // First 4 words
      .join(' ');
    
    if (!cleanQuery || cleanQuery.length < 3) {
      console.log(`[resolve] Query too short after cleaning: "${cleanQuery}"`);
      return null;
    }
    
    console.log(`[resolve] Shopify search: "${cleanQuery}" on ${domain}`);
    
    const searchUrl = `https://${domain}/search/suggest.json?q=${encodeURIComponent(cleanQuery)}&resources[type]=product&resources[limit]=4`;
    
    const response = await fetch(searchUrl, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(5000)  // 5s timeout
    });
    
    if (!response.ok) {
      console.log(`[resolve] Shopify search failed: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    const products = data.resources?.results?.products || [];
    
    if (products.length === 0) {
      console.log(`[resolve] Shopify search: no products found`);
      return null;
    }
    
    // Return first product URL
    const product = products[0];
    const productUrl = `https://${domain}${product.url}`;
    
    console.log(`[resolve] Shopify found: ${productUrl}`);
    return productUrl;
    
  } catch (err) {
    console.log(`[resolve] Shopify search error:`, err);
    return null;
  }
}

/**
 * Verify URL returns 200 (basic health check)
 */
async function verifyUrl(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000)
    });
    return response.ok;
  } catch {
    try {
      // Fallback to GET if HEAD not supported
      const response = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

/**
 * Check brand cache for known product URL
 */
async function checkCache(
  supabase: any,
  brandId: string,
  query: string
): Promise<string | null> {
  try {
    const { data: brand } = await supabase
      .from('brands')
      .select('all_links')
      .eq('id', brandId)
      .single();
    
    const productUrls = brand?.all_links?.productUrls || {};
    
    // Look for exact or fuzzy match
    const cleanQuery = query.toLowerCase().trim();
    
    // Exact match first
    if (productUrls[cleanQuery]) {
      console.log(`[resolve] Cache hit (exact): ${cleanQuery}`);
      return productUrls[cleanQuery];
    }
    
    // Fuzzy match - check if query contains a cached product name
    for (const [name, url] of Object.entries(productUrls)) {
      if (cleanQuery.includes(name) || name.includes(cleanQuery)) {
        console.log(`[resolve] Cache hit (fuzzy): ${name}`);
        return url as string;
      }
    }
    
    return null;
  } catch (err) {
    console.log(`[resolve] Cache check error:`, err);
    return null;
  }
}

/**
 * Save resolved URL to brand cache for future use
 */
async function saveToCache(
  supabase: any,
  brandId: string,
  productName: string,
  url: string
): Promise<void> {
  try {
    const { data: brand } = await supabase
      .from('brands')
      .select('all_links')
      .eq('id', brandId)
      .single();
    
    const existingLinks = brand?.all_links || {};
    const productUrls = existingLinks.productUrls || {};
    
    const key = productName.toLowerCase().trim();
    if (!productUrls[key]) {
      productUrls[key] = url;
      
      await supabase
        .from('brands')
        .update({ all_links: { ...existingLinks, productUrls } })
        .eq('id', brandId);
      
      console.log(`[resolve] Cached: ${key} -> ${url}`);
    }
  } catch (err) {
    console.log(`[resolve] Cache save error:`, err);
  }
}

/**
 * Use Firecrawl search as fallback (uses API credits)
 */
async function tryFirecrawlSearch(domain: string, query: string): Promise<string | null> {
  const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');
  if (!FIRECRAWL_API_KEY) {
    console.log('[resolve] Firecrawl API key not configured');
    return null;
  }
  
  try {
    console.log(`[resolve] Firecrawl search: "${query}" on ${domain}`);
    
    const response = await fetch('https://api.firecrawl.dev/v1/map', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        url: `https://${domain}`,
        search: query,
        limit: 5,
        includeSubdomains: false
      }),
      signal: AbortSignal.timeout(10000)
    });
    
    if (!response.ok) {
      console.log(`[resolve] Firecrawl failed: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    const links = data.links || [];
    
    // Find first product URL
    const productLink = links.find((url: string) => url.includes('/products/'));
    if (productLink) {
      console.log(`[resolve] Firecrawl found: ${productLink}`);
      return productLink;
    }
    
    console.log(`[resolve] Firecrawl: no product URLs in results`);
    return null;
    
  } catch (err) {
    console.log(`[resolve] Firecrawl error:`, err);
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: RequestBody = await req.json();
    const { brandId, brandDomain, slices } = body;

    if (!brandId || !brandDomain || !slices || slices.length === 0) {
      return new Response(
        JSON.stringify({ error: 'brandId, brandDomain, and slices are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[resolve] Resolving ${slices.length} slices for ${brandDomain}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const results: ResolvedLink[] = [];

    // Process slices in parallel (max 5 concurrent)
    const BATCH_SIZE = 5;
    for (let i = 0; i < slices.length; i += BATCH_SIZE) {
      const batch = slices.slice(i, i + BATCH_SIZE);
      
      const batchResults = await Promise.all(
        batch.map(async (slice): Promise<ResolvedLink> => {
          const query = slice.description || slice.altText || '';
          
          if (!query || query.length < 3) {
            console.log(`[resolve] Slice ${slice.index}: No description, skipping`);
            return { index: slice.index, url: null, source: 'not_found', confidence: 0 };
          }
          
          // 1. Check brand cache first
          const cachedUrl = await checkCache(supabase, brandId, query);
          if (cachedUrl) {
            const isHealthy = await verifyUrl(cachedUrl);
            if (isHealthy) {
              return { index: slice.index, url: cachedUrl, source: 'cache', confidence: 0.95 };
            }
            console.log(`[resolve] Cached URL unhealthy, trying other sources`);
          }
          
          // 2. Try Shopify predictive search (fast, free)
          const shopifyUrl = await tryShopifySearch(brandDomain, query);
          if (shopifyUrl) {
            const isHealthy = await verifyUrl(shopifyUrl);
            if (isHealthy) {
              // Cache for future use
              await saveToCache(supabase, brandId, query, shopifyUrl);
              return { index: slice.index, url: shopifyUrl, source: 'shopify_suggest', confidence: 0.9 };
            }
          }
          
          // 3. Try Firecrawl search (uses API credits)
          const firecrawlUrl = await tryFirecrawlSearch(brandDomain, query);
          if (firecrawlUrl) {
            const isHealthy = await verifyUrl(firecrawlUrl);
            if (isHealthy) {
              await saveToCache(supabase, brandId, query, firecrawlUrl);
              return { index: slice.index, url: firecrawlUrl, source: 'web_search', confidence: 0.85 };
            }
          }
          
          // 4. Not found
          console.log(`[resolve] Slice ${slice.index}: No URL found for "${query.substring(0, 50)}..."`);
          return { index: slice.index, url: null, source: 'not_found', confidence: 0 };
        })
      );
      
      results.push(...batchResults);
    }

    // Summary logging
    const found = results.filter(r => r.url !== null).length;
    const sources = results.reduce((acc, r) => {
      acc[r.source] = (acc[r.source] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    console.log(`[resolve] Resolved ${found}/${slices.length} slices. Sources:`, sources);

    return new Response(
      JSON.stringify({ results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[resolve] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
