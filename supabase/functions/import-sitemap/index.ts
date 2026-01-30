import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// URLs to skip during import
const SKIP_PATTERNS = [
  '/cart', '/checkout', '/account', '/login', '/register', '/password',
  '/policies', '/pages/faq', '/pages/contact', '/pages/about',
  '/blogs/', '/apps/', '/admin', '/api/', '/sitemap',
  '/search', '/wishlist', '/compare',
];

function shouldSkipUrl(url: string): boolean {
  const lowerUrl = url.toLowerCase();
  return SKIP_PATTERNS.some(pattern => lowerUrl.includes(pattern));
}

function categorizeUrl(url: string): 'product' | 'collection' | 'page' | null {
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes('/products/')) return 'product';
  if (lowerUrl.includes('/collections/')) return 'collection';
  // Skip other pages for now
  return null;
}

async function fetchWithTimeout(url: string, timeout = 10000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { signal: controller.signal });
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

    // Update job status to parsing
    await supabase
      .from('sitemap_import_jobs')
      .update({ status: 'parsing' })
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

    // Filter and categorize URLs
    const urlsToProcess: { url: string; link_type: 'product' | 'collection' }[] = [];
    for (const url of allUrls) {
      if (shouldSkipUrl(url)) continue;
      const category = categorizeUrl(url);
      if (category === 'product' || category === 'collection') {
        urlsToProcess.push({ url, link_type: category });
      }
    }

    console.log(`Filtered to ${urlsToProcess.length} product/collection URLs`);

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

    // Fetch titles for new URLs (in batches of 20)
    const BATCH_SIZE = 20;
    const urlsWithTitles: { url: string; link_type: 'product' | 'collection'; title: string }[] = [];
    let processed = 0;
    let failed = 0;

    for (let i = 0; i < newUrls.length; i += BATCH_SIZE) {
      const batch = newUrls.slice(i, i + BATCH_SIZE);
      
      const batchResults = await Promise.allSettled(
        batch.map(async ({ url, link_type }) => {
          try {
            const response = await fetchWithTimeout(url, 8000);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const html = await response.text();
            const title = await extractTitle(html);
            if (title) {
              return { url, link_type, title };
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
          urls_processed: processed,
          urls_failed: failed,
        })
        .eq('id', job_id);

      console.log(`Processed ${processed}/${newUrls.length} URLs, ${urlsWithTitles.length} with titles`);
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
              source: 'sitemap',
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
              source: 'sitemap',
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
            source: 'sitemap',
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

    // Count products and collections
    const productCount = allLinks.filter(l => l.link_type === 'product').length;
    const collectionCount = allLinks.filter(l => l.link_type === 'collection').length;

    // Update job as complete
    await supabase
      .from('sitemap_import_jobs')
      .update({
        status: 'complete',
        completed_at: new Date().toISOString(),
        product_urls_count: productCount,
        collection_urls_count: collectionCount,
      })
      .eq('id', job_id);

    // Update brand's link_preferences
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
          last_sitemap_import_at: new Date().toISOString(),
        },
      })
      .eq('id', brand_id);

    console.log(`Import complete: ${productCount} products, ${collectionCount} collections`);

    return new Response(JSON.stringify({
      success: true,
      imported: allLinks.length,
      products: productCount,
      collections: collectionCount,
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
