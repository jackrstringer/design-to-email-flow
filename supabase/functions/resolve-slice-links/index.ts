import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SliceToResolve {
  index: number;
  description: string;
  altText?: string;
  imageUrl?: string;
}

interface ResolvedLink {
  index: number;
  url: string | null;
  source: 'web_search' | 'not_found';
  confidence: number;
}

interface RequestBody {
  brandId: string;
  brandDomain: string;
  slices: SliceToResolve[];
}

/**
 * SIMPLIFIED RESOLVER: Just use Firecrawl Search immediately
 * No caching layers, no Shopify-specific paths
 */
async function searchForProductUrl(domain: string, query: string): Promise<string | null> {
  const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');
  if (!FIRECRAWL_API_KEY) {
    console.log('[resolve] Firecrawl API key not configured');
    return null;
  }
  
  // Clean query - extract product-like terms
  const cleanQuery = query
    .replace(/shop\s*(now|the|our)?/gi, '')
    .replace(/click\s*to\s*/gi, '')
    .replace(/\$[\d,.]+/g, '')
    .replace(/[^\w\s-]/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 6)  // First 6 words
    .join(' ');
  
  if (!cleanQuery || cleanQuery.length < 3) {
    console.log(`[resolve] Query too short after cleaning: "${cleanQuery}"`);
    return null;
  }
  
  console.log(`[resolve] Firecrawl search: "${cleanQuery}" site:${domain}`);
  
  try {
    const response = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: `${cleanQuery} site:${domain}`,
        limit: 5
      }),
      signal: AbortSignal.timeout(10000)
    });
    
    if (!response.ok) {
      console.log(`[resolve] Firecrawl search failed: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    const results = data.data || [];
    
    // Find first product URL
    for (const result of results) {
      const url = result.url || '';
      if (url.includes('/products/') || url.includes('/product/')) {
        console.log(`[resolve] Found product URL: ${url}`);
        return url;
      }
    }
    
    // If no product URL, return first result that's on the domain
    for (const result of results) {
      const url = result.url || '';
      if (url.includes(domain)) {
        console.log(`[resolve] Found domain URL: ${url}`);
        return url;
      }
    }
    
    console.log(`[resolve] No matching URLs in search results`);
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
          
          // Direct web search - no caching, no Shopify path
          const url = await searchForProductUrl(brandDomain, query);
          
          if (url) {
            return { index: slice.index, url, source: 'web_search', confidence: 0.85 };
          }
          
          console.log(`[resolve] Slice ${slice.index}: No URL found for "${query.substring(0, 50)}..."`);
          return { index: slice.index, url: null, source: 'not_found', confidence: 0 };
        })
      );
      
      results.push(...batchResults);
    }

    // Summary logging
    const found = results.filter(r => r.url !== null).length;
    console.log(`[resolve] Resolved ${found}/${slices.length} slices via web search`);

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
