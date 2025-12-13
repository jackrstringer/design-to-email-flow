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

async function uploadToCloudinary(imageData: string, folder: string): Promise<{ url: string; publicId: string } | null> {
  try {
    const cloudName = Deno.env.get('CLOUDINARY_CLOUD_NAME');
    const apiKey = Deno.env.get('CLOUDINARY_API_KEY');
    const apiSecret = Deno.env.get('CLOUDINARY_API_SECRET');

    if (!cloudName || !apiKey || !apiSecret) {
      console.error('Cloudinary credentials not configured');
      return null;
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const paramsToSign = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
    
    const encoder = new TextEncoder();
    const data = encoder.encode(paramsToSign);
    const hashBuffer = await crypto.subtle.digest('SHA-1', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const signature = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    const formData = new FormData();
    formData.append('file', imageData);
    formData.append('api_key', apiKey);
    formData.append('timestamp', timestamp.toString());
    formData.append('signature', signature);
    formData.append('folder', folder);

    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: 'POST',
      body: formData,
    });

    const result = await response.json();
    
    if (!response.ok) {
      console.error('Cloudinary upload error:', result);
      return null;
    }

    return {
      url: result.secure_url,
      publicId: result.public_id,
    };
  } catch (error) {
    console.error('Error uploading to Cloudinary:', error);
    return null;
  }
}

async function fetchImageAsBase64(imageUrl: string): Promise<string | null> {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) return null;
    
    const arrayBuffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < uint8Array.length; i++) {
      binary += String.fromCharCode(uint8Array[i]);
    }
    const base64 = btoa(binary);
    
    const contentType = response.headers.get('content-type') || 'image/png';
    return `data:${contentType};base64,${base64}`;
  } catch (error) {
    console.error('Error fetching image:', error);
    return null;
  }
}

async function generateLogoVariant(logoBase64: string): Promise<string | null> {
  try {
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableApiKey) {
      console.error('LOVABLE_API_KEY not configured');
      return null;
    }

    console.log('Generating light logo variant with AI...');

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-image',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Create a white/light colored version of this logo suitable for use on dark backgrounds. Keep the exact same shape and design, but make the main colors white or very light gray. Preserve transparency if present. Output only the modified logo image.'
              },
              {
                type: 'image_url',
                image_url: {
                  url: logoBase64
                }
              }
            ]
          }
        ],
        modalities: ['image', 'text']
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI generation error:', response.status, errorText);
      return null;
    }

    const data = await response.json();
    const generatedImage = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    
    if (!generatedImage) {
      console.error('No image in AI response');
      return null;
    }

    console.log('Light logo variant generated successfully');
    return generatedImage;
  } catch (error) {
    console.error('Error generating logo variant:', error);
    return null;
  }
}

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

    const branding = firecrawlData.data?.branding || firecrawlData.branding || {};
    const links = firecrawlData.data?.links || firecrawlData.links || [];

    // Extract colors
    const colors = {
      primary: branding.colors?.primary || '#3b82f6',
      secondary: branding.colors?.secondary || branding.colors?.background || '#64748b',
      accent: branding.colors?.accent || undefined,
    };

    // Find social links
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

    // Process logo if found
    let darkLogo = null;
    let lightLogo = null;
    const logoUrl = branding.images?.logo || branding.logo;

    if (logoUrl) {
      console.log('Found logo URL:', logoUrl);

      // Fetch and upload original logo as dark logo
      const logoBase64 = await fetchImageAsBase64(logoUrl);
      
      if (logoBase64) {
        console.log('Uploading original logo to Cloudinary...');
        darkLogo = await uploadToCloudinary(logoBase64, 'brand-assets');

        if (darkLogo) {
          console.log('Dark logo uploaded:', darkLogo.url);

          // Generate light variant using AI
          const lightLogoBase64 = await generateLogoVariant(logoBase64);
          
          if (lightLogoBase64) {
            console.log('Uploading light logo variant to Cloudinary...');
            lightLogo = await uploadToCloudinary(lightLogoBase64, 'brand-assets');
            
            if (lightLogo) {
              console.log('Light logo uploaded:', lightLogo.url);
            }
          }
        }
      }
    }

    const result = {
      success: true,
      colors,
      socialLinks,
      darkLogo,
      lightLogo,
    };

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
