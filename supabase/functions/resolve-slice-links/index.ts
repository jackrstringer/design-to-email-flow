import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

// ============================================================================
// OCR: Extract product name from slice image using Google Cloud Vision
// ============================================================================

async function extractProductNameFromImage(imageUrl: string): Promise<string | null> {
  const apiKey = Deno.env.get("GOOGLE_CLOUD_VISION_API_KEY");
  if (!apiKey || !imageUrl) {
    return null;
  }
  
  try {
    console.log(`[resolve] OCR: Analyzing image ${imageUrl.substring(0, 60)}...`);
    
    const response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: [{
            image: { 
              source: { imageUri: imageUrl } // Use imageUri directly, no download needed
            },
            features: [{ type: "TEXT_DETECTION" }]
          }]
        }),
        signal: AbortSignal.timeout(8000)
      }
    );
    
    if (!response.ok) {
      console.log(`[resolve] OCR failed: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    const fullText = data.responses?.[0]?.fullTextAnnotation?.text || '';
    
    if (!fullText || fullText.length < 3) {
      console.log(`[resolve] OCR: No text detected`);
      return null;
    }
    
    // Extract product name by filtering out noise
    const lines = fullText.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0);
    
    // Filter out common noise patterns
    const noisePatterns = [
      /^(shop|buy|add|view|learn|get|click|order)\s*(now|more|here|it)?$/i,
      /^\$[\d,.]+$/,  // Just a price
      /^(xs|s|m|l|xl|xxl|one\s*size)$/i,  // Sizes
      /^(new|sale|sold\s*out|limited|exclusive)$/i,  // Status labels
      /^(free|fast|express)\s*(shipping|delivery)$/i,
      /^\d+%\s*off$/i,  // Discount percentages
    ];
    
    const productLines = lines.filter((line: string) => {
      // Skip if too short or too long
      if (line.length < 3 || line.length > 80) return false;
      // Skip if matches noise pattern
      if (noisePatterns.some(p => p.test(line))) return false;
      // Skip if just numbers or special chars
      if (/^[\d\s$%,.]+$/.test(line)) return false;
      return true;
    });
    
    if (productLines.length === 0) {
      console.log(`[resolve] OCR: All text filtered as noise`);
      return null;
    }
    
    // Take the first 1-2 meaningful lines as the product name
    const productName = productLines.slice(0, 2).join(' ');
    console.log(`[resolve] OCR extracted: "${productName}"`);
    return productName;
    
  } catch (err) {
    console.log(`[resolve] OCR error:`, err);
    return null;
  }
}

// ============================================================================
// URL CLEANUP: Strip tracking parameters
// ============================================================================

function cleanUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Remove common tracking params
    const trackingParams = ['srsltid', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ref', 'fbclid', 'gclid'];
    trackingParams.forEach(param => parsed.searchParams.delete(param));
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * Validate that a URL actually contains the category keyword
 */
function validateCategoryMatch(query: string, url: string): boolean {
  const keywords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const urlLower = url.toLowerCase();
  
  // At least one keyword should appear in the URL
  return keywords.some(keyword => urlLower.includes(keyword));
}

/**
 * SIMPLIFIED RESOLVER: OCR + Firecrawl Search
 * 1. If imageUrl provided, run OCR to extract product name
 * 2. Use OCR text (or fallback to description) for Firecrawl search
 * 3. Clean tracking params from result URLs
 * 4. For category searches, prioritize collection URLs with keyword validation
 */
async function searchForProductUrl(domain: string, query: string, imageUrl?: string): Promise<string | null> {
  const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');
  if (!FIRECRAWL_API_KEY) {
    console.log('[resolve] Firecrawl API key not configured');
    return null;
  }
  
  // Step 1: Try OCR on the image for more accurate product name
  let ocrQuery: string | null = null;
  if (imageUrl) {
    ocrQuery = await extractProductNameFromImage(imageUrl);
  }
  
  // Use OCR result if available and meaningful, otherwise clean the description
  const baseQuery = ocrQuery || query;
  
  // Clean query - extract product-like terms
  const cleanQuery = baseQuery
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
  
  // Detect if this is a category search (short query, likely a section header)
  const wordCount = cleanQuery.split(/\s+/).length;
  const isCategorySearch = wordCount <= 2 && 
                           cleanQuery.length < 20 &&
                           !cleanQuery.toLowerCase().includes('product');
  
  // For category searches, explicitly search for collections
  const searchQuery = isCategorySearch 
    ? `${cleanQuery} collection site:${domain}`
    : `${cleanQuery} site:${domain}`;
  
  console.log(`[resolve] Search type: ${isCategorySearch ? 'CATEGORY' : 'product'}, query: "${searchQuery}" (OCR: ${ocrQuery ? 'yes' : 'no'})`);
  
  try {
    const response = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: searchQuery,
        limit: 10 // Increased to have more options for validation
      }),
      signal: AbortSignal.timeout(10000)
    });
    
    if (!response.ok) {
      console.log(`[resolve] Firecrawl search failed: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    const results = data.data || [];
    
    // For category searches, ONLY accept collection URLs that contain the keyword
    if (isCategorySearch) {
      const primaryKeyword = cleanQuery.toLowerCase().split(/\s+/)[0];
      
      // First pass: Find collection URLs containing the keyword
      for (const result of results) {
        const url = result.url || '';
        if (url.includes('/collections/') && 
            url.toLowerCase().includes(primaryKeyword)) {
          const cleaned = cleanUrl(url);
          console.log(`[resolve] Found matching collection for category: ${cleaned}`);
          return cleaned;
        }
      }
      
      // Second pass: Any URL on-domain containing the keyword (may be /category/ or other patterns)
      for (const result of results) {
        const url = result.url || '';
        if (url.includes(domain) && 
            !url.includes('/products/') && 
            url.toLowerCase().includes(primaryKeyword)) {
          const cleaned = cleanUrl(url);
          console.log(`[resolve] Found keyword-matching URL for category: ${cleaned}`);
          return cleaned;
        }
      }
      
      // If no collection found with keyword, return null - don't fall back to random product
      console.log(`[resolve] No matching collection found for category "${cleanQuery}" (keyword: ${primaryKeyword})`);
      return null;
    }
    
    // For product searches, find product URLs first
    for (const result of results) {
      const url = result.url || '';
      if (url.includes('/products/') || url.includes('/product/')) {
        // Validate that the URL is actually relevant to the query
        if (validateCategoryMatch(cleanQuery, url)) {
          const cleaned = cleanUrl(url);
          console.log(`[resolve] Found validated product URL: ${cleaned}`);
          return cleaned;
        }
      }
    }
    
    // Fallback: first result that's on the domain and passes validation
    for (const result of results) {
      const url = result.url || '';
      if (url.includes(domain) && validateCategoryMatch(cleanQuery, url)) {
        const cleaned = cleanUrl(url);
        console.log(`[resolve] Found validated domain URL: ${cleaned}`);
        return cleaned;
      }
    }
    
    console.log(`[resolve] No matching URLs in search results for "${cleanQuery}"`);
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
          
          // Web search with OCR enhancement for per-column accuracy
          const url = await searchForProductUrl(brandDomain, query, slice.imageUrl);
          
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
