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

    const timestamp = Math.floor(Date.now() / 1000).toString();
    
    // Build params object and sort alphabetically for signature
    const params: Record<string, string> = {
      folder: folder,
      timestamp: timestamp,
    };
    
    // Create signature string: sorted params joined with & then append secret
    const sortedKeys = Object.keys(params).sort();
    const signatureString = sortedKeys.map(key => `${key}=${params[key]}`).join('&') + apiSecret;
    
    console.log('Signature string (without secret):', sortedKeys.map(key => `${key}=${params[key]}`).join('&'));
    
    const encoder = new TextEncoder();
    const data = encoder.encode(signatureString);
    const hashBuffer = await crypto.subtle.digest('SHA-1', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const signature = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    const formData = new FormData();
    formData.append('file', imageData);
    formData.append('api_key', apiKey);
    formData.append('timestamp', timestamp);
    formData.append('signature', signature);
    formData.append('folder', folder);

    console.log('Uploading to Cloudinary with timestamp:', timestamp);

    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: 'POST',
      body: formData,
    });

    const result = await response.json();
    
    if (!response.ok) {
      console.error('Cloudinary upload error:', result);
      return null;
    }

    console.log('Cloudinary upload success, public_id:', result.public_id);

    return {
      url: result.secure_url,
      publicId: result.public_id,
    };
  } catch (error) {
    console.error('Error uploading to Cloudinary:', error);
    return null;
  }
}

function generateInvertedLogoUrl(originalUrl: string): string {
  // Cloudinary URL format: https://res.cloudinary.com/{cloud}/image/upload/{transformations}/{public_id}
  // Insert e_negate transformation to invert colors
  const uploadIndex = originalUrl.indexOf('/upload/');
  if (uploadIndex === -1) return originalUrl;
  
  const beforeUpload = originalUrl.substring(0, uploadIndex + 8); // includes '/upload/'
  const afterUpload = originalUrl.substring(uploadIndex + 8);
  
  // Use e_negate for color inversion - works great for solid logos
  return `${beforeUpload}e_negate/${afterUpload}`;
}

async function fetchImageAsBase64(imageUrl: string): Promise<string | null> {
  try {
    console.log('Fetching image from:', imageUrl);
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BrandAnalyzer/1.0)',
      },
    });
    if (!response.ok) {
      console.error('Failed to fetch image:', response.status, response.statusText);
      return null;
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < uint8Array.length; i++) {
      binary += String.fromCharCode(uint8Array[i]);
    }
    const base64 = btoa(binary);
    
    const contentType = response.headers.get('content-type') || 'image/png';
    console.log('Image fetched successfully, content-type:', contentType, 'size:', uint8Array.length);
    return `data:${contentType};base64,${base64}`;
  } catch (error) {
    console.error('Error fetching image:', error);
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
    console.log('Branding data:', JSON.stringify(firecrawlData.data?.branding || firecrawlData.branding, null, 2));

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

      // Fetch and upload original logo
      const logoBase64 = await fetchImageAsBase64(logoUrl);
      
      if (logoBase64) {
        console.log('Uploading logo to Cloudinary...');
        const uploadedLogo = await uploadToCloudinary(logoBase64, 'brand-assets');

        if (uploadedLogo) {
          console.log('Logo uploaded:', uploadedLogo.url);
          
          // Use original as dark logo
          darkLogo = uploadedLogo;
          
          // Generate inverted version URL using Cloudinary transformation
          const invertedUrl = generateInvertedLogoUrl(uploadedLogo.url);
          lightLogo = {
            url: invertedUrl,
            publicId: uploadedLogo.publicId + '_inverted',
          };
          
          console.log('Light logo (inverted) URL:', invertedUrl);
        }
      } else {
        console.log('Failed to fetch logo image');
      }
    } else {
      console.log('No logo found in branding data');
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