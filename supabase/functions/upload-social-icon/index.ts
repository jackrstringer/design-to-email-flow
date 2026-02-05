// deploy-trigger
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// SHA-1 hash function for Cloudinary signature
async function sha1(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-1', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Map platform names to Simple Icons slugs
const PLATFORM_SLUGS: Record<string, string> = {
  facebook: 'facebook',
  instagram: 'instagram',
  twitter: 'x',
  x: 'x',
  linkedin: 'linkedin',
  youtube: 'youtube',
  tiktok: 'tiktok',
  pinterest: 'pinterest',
  snapchat: 'snapchat',
  whatsapp: 'whatsapp',
  telegram: 'telegram',
  threads: 'threads',
  discord: 'discord',
  reddit: 'reddit',
  twitch: 'twitch',
  spotify: 'spotify',
  apple: 'apple',
  amazon: 'amazon',
};

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { platform, color = 'ffffff', brandDomain } = await req.json();

    if (!platform) {
      throw new Error('Platform is required');
    }

    const slug = PLATFORM_SLUGS[platform.toLowerCase()] || platform.toLowerCase();
    const cleanColor = color.replace('#', '');
    
    // Fetch SVG from Simple Icons CDN
    const svgUrl = `https://cdn.simpleicons.org/${slug}/${cleanColor}`;
    console.log(`Fetching SVG from: ${svgUrl}`);
    
    const svgResponse = await fetch(svgUrl);
    if (!svgResponse.ok) {
      throw new Error(`Failed to fetch icon for ${platform}: ${svgResponse.status}`);
    }
    
    const svgText = await svgResponse.text();
    
    // Convert SVG to PNG using a canvas approach via data URL
    // We'll upload the SVG directly to Cloudinary which can handle SVG and convert to other formats
    const svgBase64 = btoa(unescape(encodeURIComponent(svgText)));
    const svgDataUrl = `data:image/svg+xml;base64,${svgBase64}`;
    
    // Upload to Cloudinary
    const cloudName = Deno.env.get('CLOUDINARY_CLOUD_NAME');
    const apiKey = Deno.env.get('CLOUDINARY_API_KEY');
    const apiSecret = Deno.env.get('CLOUDINARY_API_SECRET')?.trim();

    if (!cloudName || !apiKey || !apiSecret) {
      throw new Error('Cloudinary credentials not configured');
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const folder = brandDomain ? `brands/${brandDomain}/social-icons` : 'social-icons';
    const publicId = `${slug}-${cleanColor}`;
    
    // Build signature string (parameters must be sorted alphabetically)
    const signatureParams = [
      `folder=${folder}`,
      `public_id=${publicId}`,
      `timestamp=${timestamp}`,
    ].sort().join('&');
    
    const signature = await sha1(signatureParams + apiSecret);
    
    // Prepare form data for upload
    const formData = new FormData();
    formData.append('file', svgDataUrl);
    formData.append('api_key', apiKey);
    formData.append('timestamp', timestamp);
    formData.append('signature', signature);
    formData.append('folder', folder);
    formData.append('public_id', publicId);
    
    const uploadResponse = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      {
        method: 'POST',
        body: formData,
      }
    );

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('Cloudinary upload error:', errorText);
      throw new Error(`Cloudinary upload failed: ${errorText}`);
    }

    const uploadResult = await uploadResponse.json();
    
    // Return the Cloudinary URL - use PNG format with explicit sizing for crisp icons
    // Add transformation for proper sizing: 64x64 with fit
    const pngUrl = uploadResult.secure_url
      .replace('/upload/', '/upload/w_64,h_64,c_fit,f_png/')
      .replace(/\.[^/.]+$/, '.png');
    
    console.log(`Successfully uploaded ${platform} icon to Cloudinary: ${pngUrl}`);
    return new Response(
      JSON.stringify({
        success: true,
        url: pngUrl,
        publicId: uploadResult.public_id,
        platform,
        color: cleanColor,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error uploading social icon:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
