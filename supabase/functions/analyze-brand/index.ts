import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SOCIAL_DOMAINS = [
  { pattern: /facebook\.com/i, platform: 'facebook' },
  { pattern: /instagram\.com/i, platform: 'instagram' },
  { pattern: /twitter\.com|x\.com/i, platform: 'twitter' },
  { pattern: /linkedin\.com/i, platform: 'linkedin' },
  { pattern: /youtube\.com/i, platform: 'youtube' },
  { pattern: /tiktok\.com/i, platform: 'tiktok' },
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { websiteUrl } = await req.json();

    if (!websiteUrl) {
      return new Response(
        JSON.stringify({ success: false, error: 'Website URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!firecrawlKey) {
      console.error('FIRECRAWL_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Firecrawl not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Format URL
    let formattedUrl = websiteUrl.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = `https://${formattedUrl}`;
    }

    console.log('Analyzing brand from:', formattedUrl);

    // Call Firecrawl with branding and links formats
    const firecrawlResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: formattedUrl,
        formats: ['branding', 'links'],
        onlyMainContent: false,
      }),
    });

    const firecrawlData = await firecrawlResponse.json();

    if (!firecrawlResponse.ok) {
      console.error('Firecrawl error:', firecrawlData);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to analyze website' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Firecrawl response received');

    // Extract branding info
    const branding = firecrawlData.data?.branding || firecrawlData.branding || {};
    const links = firecrawlData.data?.links || firecrawlData.links || [];

    // Extract colors from branding
    const colors = {
      primary: branding.colors?.primary || '#3b82f6',
      secondary: branding.colors?.secondary || branding.colors?.background || '#64748b',
      accent: branding.colors?.accent || undefined,
    };

    // Find social links from discovered links
    const socialLinks: Array<{ platform: string; url: string }> = [];
    const foundPlatforms = new Set<string>();

    for (const link of links) {
      const url = typeof link === 'string' ? link : link.url || link.href;
      if (!url) continue;

      for (const { pattern, platform } of SOCIAL_DOMAINS) {
        if (pattern.test(url) && !foundPlatforms.has(platform)) {
          foundPlatforms.add(platform);
          socialLinks.push({ platform, url });
          break;
        }
      }
    }

    console.log('Extracted colors:', colors);
    console.log('Found social links:', socialLinks);

    const result = {
      success: true,
      colors,
      socialLinks,
      logoUrl: branding.images?.logo || branding.logo || undefined,
    };

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error analyzing brand:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to analyze brand';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
