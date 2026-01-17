import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper function to create SHA-1 hash
async function sha1(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-1', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Analyze image to determine if it's a "dark" logo (for light backgrounds) or "light" logo (for dark backgrounds)
async function analyzeLogoBrightness(imageData: Uint8Array): Promise<'dark' | 'light'> {
  let totalBrightness = 0;
  let sampleCount = 0;
  
  for (let i = 0; i < imageData.length; i += 100) {
    totalBrightness += imageData[i];
    sampleCount++;
  }
  
  const avgBrightness = sampleCount > 0 ? totalBrightness / sampleCount : 128;
  return avgBrightness > 140 ? 'light' : 'dark';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { logoUrl, footerLogoUrl, brandDomain, colorScheme } = await req.json();

    console.log('Processing logos...');
    console.log('Header logo URL:', logoUrl);
    console.log('Footer logo URL:', footerLogoUrl);
    console.log('Brand domain:', brandDomain);
    console.log('Website color scheme:', colorScheme);

    const cloudName = Deno.env.get('CLOUDINARY_CLOUD_NAME');
    const apiKey = Deno.env.get('CLOUDINARY_API_KEY');
    const apiSecret = Deno.env.get('CLOUDINARY_API_SECRET');

    if (!cloudName || !apiKey || !apiSecret) {
      console.error('Missing Cloudinary credentials');
      return new Response(
        JSON.stringify({ success: false, error: 'Cloudinary not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const folder = brandDomain ? `brands/${brandDomain}/logos` : 'brands/logos';

    // Helper function to upload a logo to Cloudinary
    const uploadLogo = async (url: string, suffix: string): Promise<{ url: string; publicId: string } | null> => {
      try {
        console.log(`Downloading ${suffix} logo from: ${url}`);
        const response = await fetch(url);
        if (!response.ok) {
          console.error(`Failed to download ${suffix} logo: ${response.status}`);
          return null;
        }
        
        const arrayBuffer = await response.arrayBuffer();
        const data = new Uint8Array(arrayBuffer);
        const contentType = response.headers.get('content-type') || 'image/png';
        
        console.log(`${suffix} logo downloaded, size: ${data.length}, type: ${contentType}`);
        
        const timestamp = Math.round(Date.now() / 1000);
        const base64Logo = btoa(String.fromCharCode(...data));
        const dataUrl = `data:${contentType};base64,${base64Logo}`;
        
        const signatureString = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
        const signature = await sha1(signatureString);

        const formData = new FormData();
        formData.append('file', dataUrl);
        formData.append('api_key', apiKey);
        formData.append('timestamp', timestamp.toString());
        formData.append('signature', signature);
        formData.append('folder', folder);

        console.log(`Uploading ${suffix} logo to Cloudinary...`);
        const uploadResponse = await fetch(
          `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
          { method: 'POST', body: formData }
        );

        if (!uploadResponse.ok) {
          const errorText = await uploadResponse.text();
          console.error(`Cloudinary upload failed for ${suffix}:`, errorText);
          return null;
        }

        const uploadResult = await uploadResponse.json();
        console.log(`${suffix} logo uploaded:`, uploadResult.public_id);
        
        return {
          url: uploadResult.secure_url,
          publicId: uploadResult.public_id,
        };
      } catch (error) {
        console.error(`Error uploading ${suffix} logo:`, error);
        return null;
      }
    };

    let darkLogoUrl: string | null = null;
    let darkLogoPublicId: string | null = null;
    let lightLogoUrl: string | null = null;
    let lightLogoPublicId: string | null = null;
    let originalUrl: string | null = null;
    let originalPublicId: string | null = null;

    // Case 1: We have both header and footer logos - assume header is dark, footer is light
    if (logoUrl && footerLogoUrl && logoUrl !== footerLogoUrl) {
      console.log('Processing both header and footer logos...');
      
      // Header logo is typically dark (shown on light header backgrounds)
      const headerResult = await uploadLogo(logoUrl, 'header');
      if (headerResult) {
        darkLogoUrl = headerResult.url;
        darkLogoPublicId = headerResult.publicId;
        originalUrl = headerResult.url;
        originalPublicId = headerResult.publicId;
      }
      
      // Footer logo is typically light (shown on dark footer backgrounds)
      const footerResult = await uploadLogo(footerLogoUrl, 'footer');
      if (footerResult) {
        lightLogoUrl = footerResult.url;
        lightLogoPublicId = footerResult.publicId;
      }
      
      console.log('Both logos processed');
      console.log('Dark logo (from header):', darkLogoUrl);
      console.log('Light logo (from footer):', lightLogoUrl);
      
      const hasBothVariants = darkLogoUrl && lightLogoUrl;
      
      return new Response(
        JSON.stringify({
          success: true,
          originalUrl,
          detectedType: 'dark',
          darkLogoUrl,
          darkLogoPublicId,
          lightLogoUrl,
          lightLogoPublicId,
          originalPublicId,
          hasOnlyOneVariant: !hasBothVariants,
          missingVariant: !darkLogoUrl ? 'dark' : (!lightLogoUrl ? 'light' : null),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Case 2: Only have one logo - use brightness detection
    const singleLogoUrl = logoUrl || footerLogoUrl;
    if (!singleLogoUrl) {
      return new Response(
        JSON.stringify({ success: false, error: 'Logo URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Processing single logo...');
    
    // Download and analyze the logo
    const logoResponse = await fetch(singleLogoUrl);
    if (!logoResponse.ok) {
      throw new Error(`Failed to download logo: ${logoResponse.status}`);
    }
    
    const logoArrayBuffer = await logoResponse.arrayBuffer();
    const logoData = new Uint8Array(logoArrayBuffer);
    const contentType = logoResponse.headers.get('content-type') || 'image/png';
    
    console.log('Logo downloaded, size:', logoData.length, 'type:', contentType);

    // Analyze if the logo is dark or light
    let detectedType = await analyzeLogoBrightness(logoData);
    
    // If website has a dark color scheme, the logo shown is likely the light version
    if (colorScheme === 'dark') {
      detectedType = 'light';
      console.log('Website is dark, assuming logo is light variant');
    } else if (colorScheme === 'light') {
      detectedType = 'dark';
      console.log('Website is light, assuming logo is dark variant');
    }
    
    console.log('Detected logo type:', detectedType);

    // Upload to Cloudinary
    const timestamp = Math.round(Date.now() / 1000);
    const base64Logo = btoa(String.fromCharCode(...logoData));
    const dataUrl = `data:${contentType};base64,${base64Logo}`;
    
    const signatureString = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
    const signature = await sha1(signatureString);

    const formData = new FormData();
    formData.append('file', dataUrl);
    formData.append('api_key', apiKey);
    formData.append('timestamp', timestamp.toString());
    formData.append('signature', signature);
    formData.append('folder', folder);

    console.log('Uploading original logo to Cloudinary...');
    const uploadResponse = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      { method: 'POST', body: formData }
    );

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('Cloudinary upload failed:', errorText);
      throw new Error('Failed to upload to Cloudinary');
    }

    const uploadResult = await uploadResponse.json();
    console.log('Original logo uploaded:', uploadResult.public_id);

    originalUrl = uploadResult.secure_url;
    originalPublicId = uploadResult.public_id;

    let missingVariant: 'dark' | 'light';

    if (detectedType === 'dark') {
      darkLogoUrl = originalUrl;
      darkLogoPublicId = uploadResult.public_id;
      missingVariant = 'light';
      console.log('Stored as dark logo - MISSING light variant (for dark backgrounds)');
    } else {
      lightLogoUrl = originalUrl;
      lightLogoPublicId = uploadResult.public_id;
      missingVariant = 'dark';
      console.log('Stored as light logo - MISSING dark variant (for light backgrounds)');
    }

    console.log('Logo processing complete');
    console.log('Dark logo URL:', darkLogoUrl);
    console.log('Light logo URL:', lightLogoUrl);
    console.log('Missing variant:', missingVariant);

    return new Response(
      JSON.stringify({
        success: true,
        originalUrl,
        detectedType,
        darkLogoUrl,
        darkLogoPublicId,
        lightLogoUrl,
        lightLogoPublicId,
        originalPublicId,
        hasOnlyOneVariant: true,
        missingVariant,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error processing logo:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to process logo';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
