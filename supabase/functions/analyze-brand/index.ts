import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

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

    let formattedUrl = websiteUrl.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = `https://${formattedUrl}`;
    }

    console.log('Analyzing brand from:', formattedUrl);

    // Call Firecrawl with branding, links, images, and extract formats
    // Request ALL data to maximize logo discovery chances
    const firecrawlResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: formattedUrl,
        formats: ['branding', 'links', 'screenshot', 'extract'],
        onlyMainContent: false,
        extract: {
          schema: {
            type: "object",
            properties: {
              headerLogo: {
                type: "string",
                description: "URL of the logo image in the website header/navigation area (top of page). Usually a dark/colored logo on light background."
              },
              footerLogo: {
                type: "string",
                description: "URL of the logo image in the website footer section (bottom of page). Often a white/light-colored version for dark footer backgrounds."
              },
              whiteLogo: {
                type: "string",
                description: "URL of a white or light-colored version of the brand logo, often found on dark backgrounds or in the footer."
              },
              darkLogo: {
                type: "string",
                description: "URL of a dark/black/colored version of the brand logo, often found on light backgrounds or in the header."
              },
              allLogos: {
                type: "array",
                items: { type: "string" },
                description: "Array of ALL logo image URLs found anywhere on the page - header, footer, mobile menu, etc. Include any image that appears to be the brand logo."
              },
              footerBackgroundColor: {
                type: "string",
                description: "Background color of the footer section (hex format like #000000 or rgb format)"
              }
            }
          }
        }
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
    const extract = firecrawlData.data?.extract || firecrawlData.extract || {};

    // Log all extracted logo data
    console.log('Extract data:', JSON.stringify(extract, null, 2));

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

    // Extract logos from multiple sources
    const brandingLogo = branding.logo || branding.images?.logo || null;
    const brandingImages = branding.images || {};

    // Extract logos from LLM extraction
    const headerLogo = extract?.headerLogo || null;
    const footerLogo = extract?.footerLogo || null;
    const whiteLogo = extract?.whiteLogo || null;
    const darkLogo = extract?.darkLogo || null;
    const allLogosFromExtract = extract?.allLogos || [];
    const footerBackgroundColor = extract?.footerBackgroundColor || null;

    // Extract color scheme (light/dark)
    const colorScheme = branding.colorScheme || null;

    // Find social links
    const socialLinks: Array<{ platform: string; url: string }> = [];
    const foundPlatforms = new Set<string>();

    // Store all links for future linking purposes
    const allLinks: string[] = [];

    // Also collect potential logo URLs from links (images in links array)
    const potentialLogoUrls: string[] = [];
    const logoKeywords = ['logo', 'brand', 'mark', 'wordmark', 'logotype'];
    const logoExclusions = ['icon', 'favicon', 'social', 'facebook', 'twitter', 'instagram', 'linkedin', 'youtube', 'tiktok', 'pinterest', 'snapchat'];

    for (const link of links) {
      const url = typeof link === 'string' ? link : link.url || link.href;
      if (!url) continue;

      // Add to allLinks
      allLinks.push(url);

      // Check if this could be a logo image
      const lowerUrl = url.toLowerCase();
      const isImage = /\.(png|jpg|jpeg|svg|webp|gif)(\?|$)/i.test(lowerUrl);
      const hasLogoKeyword = logoKeywords.some(kw => lowerUrl.includes(kw));
      const hasExclusion = logoExclusions.some(ex => lowerUrl.includes(ex));
      
      if (isImage && hasLogoKeyword && !hasExclusion) {
        potentialLogoUrls.push(url);
      }

      // Check for social links
      for (const { pattern, platform } of SOCIAL_DOMAINS) {
        if (pattern.test(url) && !foundPlatforms.has(platform)) {
          foundPlatforms.add(platform);
          socialLinks.push({ platform, url });
          break;
        }
      }
    }

    // Combine all logo candidates from various sources
    const allLogoCandidates = [
      brandingLogo,
      headerLogo,
      footerLogo,
      whiteLogo,
      darkLogo,
      brandingImages.logo,
      brandingImages.favicon,
      ...allLogosFromExtract,
      ...potentialLogoUrls,
    ].filter((url): url is string => {
      if (!url || typeof url !== 'string') return false;
      return url.startsWith('http');
    });

    // Deduplicate logo candidates
    const uniqueLogoCandidates = [...new Set(allLogoCandidates)];

    console.log('=== LOGO DISCOVERY SUMMARY ===');
    console.log('Branding logo:', brandingLogo);
    console.log('Header logo (extracted):', headerLogo);
    console.log('Footer logo (extracted):', footerLogo);
    console.log('White logo (extracted):', whiteLogo);
    console.log('Dark logo (extracted):', darkLogo);
    console.log('All logos from extract:', allLogosFromExtract);
    console.log('Potential logos from links:', potentialLogoUrls);
    console.log('Total unique logo candidates:', uniqueLogoCandidates.length);
    console.log('Candidates:', uniqueLogoCandidates);
    console.log('Footer background color:', footerBackgroundColor);
    console.log('Color scheme:', colorScheme);

    const result = {
      success: true,
      colors,
      typography,
      fonts,
      spacing,
      components,
      colorScheme,
      socialLinks,
      allLinks,
      
      // Primary logo from branding
      logo: brandingLogo,
      
      // Extracted logos with specific roles
      headerLogo,
      footerLogo,
      whiteLogo,
      darkLogo,
      
      // All logo candidates for processing
      allLogos: uniqueLogoCandidates,
      
      // Additional branding images
      brandingImages,
      
      footerBackgroundColor,
    };

    console.log('Brand analysis complete - returning', uniqueLogoCandidates.length, 'logo candidates');

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
