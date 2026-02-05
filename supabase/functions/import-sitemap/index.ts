// deploy-trigger
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// URLs to skip during import - only utility/transactional pages
const SKIP_PATTERNS = [
  '/cart', '/checkout', '/account', '/login', '/register', '/password',
  '/policies', '/apps/', '/admin', '/api/', '/sitemap',
  '/search', '/wishlist', '/compare', '/blogs/',
];

function shouldSkipUrl(url: string): boolean {
  const lowerUrl = url.toLowerCase();
  return SKIP_PATTERNS.some(pattern => lowerUrl.includes(pattern));
}

function categorizeUrl(url: string): 'product' | 'collection' | 'page' | null {
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes('/products/')) return 'product';
  if (lowerUrl.includes('/collections/')) return 'collection';
  if (lowerUrl.includes('/pages/')) return 'page';
  return null;
}

async function fetchWithTimeout(url: string, timeout = 10000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { 
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SentrBot/1.0)' }
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function extractTitle(html: string): Promise<string | null> {
  // Try og:title first
  const ogMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
  if (ogMatch) return ogMatch[1];

  // Fallback to <title>
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) {
    // Clean up title - remove brand name suffixes
    let title = titleMatch[1].trim();
    // Remove common suffixes like " | Brand Name" or " - Brand Name"
    title = title.replace(/\s*[\|\-–—]\s*[^|\-–—]+$/, '');
    return title;
  }

  return null;
}

// NEW: Extract navigation links from homepage
async function extractNavLinks(domain: string): Promise<Array<{ url: string; title: string; link_type: 'product' | 'collection' | 'page' }>> {
  try {
    const homepageUrl = `https://${domain}`;
    console.log(`[import-sitemap] Crawling homepage: ${homepageUrl}`);
    
    const response = await fetchWithTimeout(homepageUrl, 15000);
    if (!response.ok) {
      console.log(`[import-sitemap] Homepage fetch failed: ${response.status}`);
      return [];
    }
    
    const html = await response.text();
    const navLinks: Array<{ url: string; title: string; link_type: 'product' | 'collection' | 'page' }> = [];
    
    // Extract anchor tags from HTML
    const linkRegex = /<a[^>]*href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi;
    let match;
    
    while ((match = linkRegex.exec(html)) !== null) {
      let url = match[1];
      const title = match[2].trim();
      
      // Skip invalid links
      if (!title || title.length < 2) continue;
      if (url.startsWith('#') || url.startsWith('javascript:') || url.startsWith('mailto:') || url.startsWith('tel:')) continue;
      
      // Convert relative URLs to absolute
      if (url.startsWith('/')) {
        url = `https://${domain}${url}`;
      }
      
      // Only same-domain links
      if (!url.includes(domain)) continue;
      
      // Skip utility pages
      if (shouldSkipUrl(url)) continue;
      
      // Categorize
      let link_type: 'product' | 'collection' | 'page' = 'page';
      if (url.includes('/products/')) link_type = 'product';
      else if (url.includes('/collections/')) link_type = 'collection';
      
      navLinks.push({ url, title, link_type });
    }
    
    // Deduplicate by URL
    const seen = new Set<string>();
    const uniqueLinks = navLinks.filter(link => {
      if (seen.has(link.url)) return false;
      seen.add(link.url);
      return true;
    });
    
    console.log(`[import-sitemap] Found ${uniqueLinks.length} unique nav links`);
    return uniqueLinks;
  } catch (error) {
    console.error('[import-sitemap] Failed to crawl nav:', error);
    return [];
  }
}

async function parseSitemap(xml: string, baseUrl: string): Promise<string[]> {
  const urls: string[] = [];

  // Check if it's a sitemap index
  if (xml.includes('<sitemapindex')) {
    // Extract child sitemap URLs
    const sitemapMatches = xml.matchAll(/<sitemap[^>]*>[\s\S]*?<loc>([^<]+)<\/loc>[\s\S]*?<\/sitemap>/gi);
    const childSitemapUrls: string[] = [];
    for (const match of sitemapMatches) {
      childSitemapUrls.push(match[1].trim());
    }

    console.log(`Found ${childSitemapUrls.length} child sitemaps`);

    // Fetch and parse each child sitemap (limit to 10 to avoid timeout)
    for (const childUrl of childSitemapUrls.slice(0, 10)) {
      try {
        const response = await fetchWithTimeout(childUrl);
        if (response.ok) {
          const childXml = await response.text();
          const childUrls = await parseSitemap(childXml, baseUrl);
          urls.push(...childUrls);
        }
      } catch (error) {
        console.error(`Error fetching child sitemap ${childUrl}:`, error);
      }
    }
  } else {
    // Regular sitemap - extract URLs
    const urlMatches = xml.matchAll(/<url[^>]*>[\s\S]*?<loc>([^<]+)<\/loc>[\s\S]*?<\/url>/gi);
    for (const match of urlMatches) {
      urls.push(match[1].trim());
    }
  }

  return urls;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let jobId: string | null = null;

  try {
    const { brand_id, sitemap_url, job_id } = await req.json();
    jobId = job_id;

    if (!brand_id || !sitemap_url || !job_id) {
      throw new Error('brand_id, sitemap_url, and job_id are required');
    }

    console.log(`Starting sitemap import for brand ${brand_id}, job ${job_id}`);

    // Get brand domain for nav crawling
    const { data: brand } = await supabase
      .from('brands')
      .select('domain')
      .eq('id', brand_id)
      .single();
    
    const domain = brand?.domain || new URL(sitemap_url).hostname;

    // Update job status to parsing
    await supabase
      .from('sitemap_import_jobs')
      .update({ status: 'parsing', started_at: new Date().toISOString() })
      .eq('id', job_id);

    // Fetch sitemap
    const sitemapResponse = await fetchWithTimeout(sitemap_url, 30000);
    if (!sitemapResponse.ok) {
      throw new Error(`Could not fetch sitemap: ${sitemapResponse.status}`);
    }

    const sitemapXml = await sitemapResponse.text();
    console.log(`Fetched sitemap, size: ${sitemapXml.length} bytes`);

    // Parse sitemap
    const baseUrl = new URL(sitemap_url).origin;
    const allUrls = await parseSitemap(sitemapXml, baseUrl);
    console.log(`Found ${allUrls.length} total URLs in sitemap`);

    // Filter and categorize sitemap URLs
    const sitemapUrlsToProcess: { url: string; link_type: 'product' | 'collection' | 'page'; title?: string; source: string }[] = [];
    for (const url of allUrls) {
      if (shouldSkipUrl(url)) continue;
      const category = categorizeUrl(url);
      if (category) {
        sitemapUrlsToProcess.push({ url, link_type: category, source: 'sitemap' });
      }
    }

    console.log(`Filtered sitemap to ${sitemapUrlsToProcess.length} URLs`);

    // NEW: Crawl homepage navigation
    await supabase
      .from('sitemap_import_jobs')
      .update({ status: 'crawling_nav' })
      .eq('id', job_id);

    console.log('[import-sitemap] Crawling homepage navigation...');
    const navLinks = await extractNavLinks(domain);
    console.log(`[import-sitemap] Found ${navLinks.length} navigation links`);

    // Merge URLs - nav links may add pages that sitemap missed
    const urlMap = new Map<string, { url: string; link_type: 'product' | 'collection' | 'page'; title?: string; source: string }>();

    // Add sitemap URLs first
    for (const item of sitemapUrlsToProcess) {
      urlMap.set(item.url, item);
    }

    // Add nav links (especially pages that sitemap missed)
    for (const navLink of navLinks) {
      if (!urlMap.has(navLink.url)) {
        urlMap.set(navLink.url, { 
          url: navLink.url, 
          link_type: navLink.link_type, 
          title: navLink.title,
          source: 'navigation' 
        });
      } else {
        // If nav link has a title and existing doesn't, use nav title
        const existing = urlMap.get(navLink.url)!;
        if (navLink.title && !existing.title) {
          urlMap.set(navLink.url, { ...existing, title: navLink.title });
        }
      }
    }

    const urlsToProcess = Array.from(urlMap.values());
    console.log(`Combined: ${urlsToProcess.length} URLs (${sitemapUrlsToProcess.length} from sitemap, ${navLinks.length} nav links)`);

    // Update job with urls_found
    await supabase
      .from('sitemap_import_jobs')
      .update({
        status: 'fetching_titles',
        urls_found: urlsToProcess.length,
      })
      .eq('id', job_id);

    // Check which URLs already exist
    const { data: existingLinks } = await supabase
      .from('brand_link_index')
      .select('url')
      .eq('brand_id', brand_id);

    const existingUrls = new Set((existingLinks || []).map(l => l.url));
    const newUrls = urlsToProcess.filter(u => !existingUrls.has(u.url));
    console.log(`${newUrls.length} new URLs to process (${existingUrls.size} already exist)`);

    // Fetch titles for new URLs that don't have one (in batches of 20)
    const BATCH_SIZE = 20;
    const urlsWithTitles: { url: string; link_type: 'product' | 'collection' | 'page'; title: string; source: string }[] = [];
    let processed = 0;
    let failed = 0;

    // URLs that already have titles from nav crawling
    const urlsNeedingTitles = newUrls.filter(u => !u.title);
    const urlsWithNavTitles = newUrls.filter(u => u.title);
    
    // Add URLs with nav titles directly
    for (const item of urlsWithNavTitles) {
      urlsWithTitles.push({ 
        url: item.url, 
        link_type: item.link_type, 
        title: item.title!, 
        source: item.source 
      });
    }

    for (let i = 0; i < urlsNeedingTitles.length; i += BATCH_SIZE) {
      const batch = urlsNeedingTitles.slice(i, i + BATCH_SIZE);
      
      const batchResults = await Promise.allSettled(
        batch.map(async ({ url, link_type, source }) => {
          try {
            const response = await fetchWithTimeout(url, 8000);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const html = await response.text();
            const title = await extractTitle(html);
            if (title) {
              return { url, link_type, title, source };
            }
            return null;
          } catch (error) {
            return null;
          }
        })
      );

      for (const result of batchResults) {
        if (result.status === 'fulfilled' && result.value) {
          urlsWithTitles.push(result.value);
        } else {
          failed++;
        }
        processed++;
      }

      // Update progress
      await supabase
        .from('sitemap_import_jobs')
        .update({
          urls_processed: processed + urlsWithNavTitles.length,
          urls_failed: failed,
        })
        .eq('id', job_id);

      console.log(`Processed ${processed}/${urlsNeedingTitles.length} URLs, ${urlsWithTitles.length} with titles`);
    }

    if (urlsWithTitles.length === 0) {
      await supabase
        .from('sitemap_import_jobs')
        .update({
          status: 'complete',
          completed_at: new Date().toISOString(),
          product_urls_count: 0,
          collection_urls_count: 0,
        })
        .eq('id', job_id);

      return new Response(JSON.stringify({ success: true, imported: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update job status to generating embeddings
    await supabase
      .from('sitemap_import_jobs')
      .update({ status: 'generating_embeddings' })
      .eq('id', job_id);

    // Generate embeddings in batches of 100
    const EMBED_BATCH_SIZE = 100;
    const allLinks: any[] = [];

    for (let i = 0; i < urlsWithTitles.length; i += EMBED_BATCH_SIZE) {
      const batch = urlsWithTitles.slice(i, i + EMBED_BATCH_SIZE);
      const titles = batch.map(u => u.title);

      try {
        // Call generate-embedding function
        const embedResponse = await fetch(`${supabaseUrl}/functions/v1/generate-embedding`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ texts: titles }),
        });

        if (!embedResponse.ok) {
          console.error('Embedding generation failed:', await embedResponse.text());
          // Continue without embeddings for this batch
          for (const item of batch) {
            allLinks.push({
              brand_id,
              url: item.url,
              link_type: item.link_type,
              title: item.title,
              source: item.source,
              is_healthy: true,
              last_verified_at: new Date().toISOString(),
            });
          }
        } else {
          const { embeddings } = await embedResponse.json();
          for (let j = 0; j < batch.length; j++) {
            allLinks.push({
              brand_id,
              url: batch[j].url,
              link_type: batch[j].link_type,
              title: batch[j].title,
              embedding: embeddings[j] ? `[${embeddings[j].join(',')}]` : null,
              source: batch[j].source,
              is_healthy: true,
              last_verified_at: new Date().toISOString(),
            });
          }
        }
      } catch (error) {
        console.error('Error generating embeddings for batch:', error);
        // Continue without embeddings
        for (const item of batch) {
          allLinks.push({
            brand_id,
            url: item.url,
            link_type: item.link_type,
            title: item.title,
            source: item.source,
            is_healthy: true,
            last_verified_at: new Date().toISOString(),
          });
        }
      }

      console.log(`Generated embeddings for batch ${i / EMBED_BATCH_SIZE + 1}`);
    }

    // Bulk insert into brand_link_index
    const INSERT_BATCH_SIZE = 50;
    for (let i = 0; i < allLinks.length; i += INSERT_BATCH_SIZE) {
      const batch = allLinks.slice(i, i + INSERT_BATCH_SIZE);
      const { error: insertError } = await supabase
        .from('brand_link_index')
        .upsert(batch, { onConflict: 'brand_id,url' });

      if (insertError) {
        console.error('Error inserting links batch:', insertError);
      }
    }

    // Count by type
    const productCount = allLinks.filter(l => l.link_type === 'product').length;
    const collectionCount = allLinks.filter(l => l.link_type === 'collection').length;
    const pageCount = allLinks.filter(l => l.link_type === 'page').length;

    // Update job as complete
    await supabase
      .from('sitemap_import_jobs')
      .update({
        status: 'complete',
        completed_at: new Date().toISOString(),
        product_urls_count: productCount,
        collection_urls_count: collectionCount + pageCount, // Include pages in collection count for now
      })
      .eq('id', job_id);

    // Update brand's link_preferences
    const { data: brandData } = await supabase
      .from('brands')
      .select('link_preferences')
      .eq('id', brand_id)
      .single();

    const currentPrefs = brandData?.link_preferences || {};
    await supabase
      .from('brands')
      .update({
        link_preferences: {
          ...currentPrefs,
          sitemap_url,
          last_sitemap_import_at: new Date().toISOString(),
        },
      })
      .eq('id', brand_id);

    console.log(`Import complete: ${productCount} products, ${collectionCount} collections, ${pageCount} pages`);

    return new Response(JSON.stringify({
      success: true,
      imported: allLinks.length,
      products: productCount,
      collections: collectionCount,
      pages: pageCount,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error importing sitemap:', error);

    // Update job as failed
    if (jobId) {
      await supabase
        .from('sitemap_import_jobs')
        .update({
          status: 'failed',
          error_message: error instanceof Error ? error.message : 'Unknown error',
          completed_at: new Date().toISOString(),
        })
        .eq('id', jobId);
    }

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
