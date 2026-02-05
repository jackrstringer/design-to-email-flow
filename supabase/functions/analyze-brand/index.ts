// deploy-trigger
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
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
    console.log('Branding data:', JSON.stringify(firecrawlData.data?.branding || firecrawlData.branding, null, 2));

    const branding = firecrawlData.data?.branding || firecrawlData.branding || {};
    const links = firecrawlData.data?.links || firecrawlData.links || [];

    // Extract ALL colors from Firecrawl
    const colors = {
      primary: branding.colors?.primary || '#3b82f6',
      secondary: branding.colors?.secondary || '#64748b',
      accent: branding.colors?.accent || undefined,
      background: branding.colors?.background || '#ffffff',
      textPrimary: branding.colors?.textPrimary || '#333333',
      link: branding.colors?.link || branding.colors?.primary || '#3b82f6',
    };

    // Extract typography data
    const typography = branding.typography ? {
      fontFamilies: branding.typography.fontFamilies || {},
      fontSizes: branding.typography.fontSizes || {},
      fontWeights: branding.typography.fontWeights || {},
    } : null;

    // Extract ALL fonts with roles
    const fonts = branding.fonts || [];

    // Extract spacing (baseUnit, borderRadius)
    const spacing = branding.spacing || null;

    // Extract component styles (buttons)
    const components = branding.components || null;

    // Extract logo
    const logo = branding.logo || branding.images?.logo || null;

    // Extract color scheme (light/dark)
    const colorScheme = branding.colorScheme || null;

    // Find social links
    const socialLinks: Array<{ platform: string; url: string }> = [];
    const foundPlatforms = new Set<string>();

    // Store all links for future linking purposes
    const allLinks: string[] = [];

    for (const link of links) {
      const url = typeof link === 'string' ? link : link.url || link.href;
      if (!url) continue;

      // Add to allLinks
      allLinks.push(url);

      // Check for social links
      for (const { pattern, platform } of SOCIAL_DOMAINS) {
        if (pattern.test(url) && !foundPlatforms.has(platform)) {
          foundPlatforms.add(platform);
          socialLinks.push({ platform, url });
          break;
        }
      }
    }

    console.log('Extracted colors:', colors);
    console.log('Extracted typography:', typography);
    console.log('Extracted fonts:', fonts);
    console.log('Extracted spacing:', spacing);
    console.log('Extracted components:', components);
    console.log('Found social links:', socialLinks);
    console.log('Total links found:', allLinks.length);

    const result = {
      success: true,
      colors,
      typography,
      fonts,
      spacing,
      components,
      logo,
      colorScheme,
      socialLinks,
      allLinks,
    };

    console.log('Extracted logo URL:', logo);
    console.log('Brand analysis complete');

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
