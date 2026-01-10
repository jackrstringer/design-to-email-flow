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
  // Simple heuristic: sample some pixels and calculate average brightness
  // A "dark" logo has dark pixels (low brightness) - used on light backgrounds
  // A "light" logo has light pixels (high brightness) - used on dark backgrounds
  
  let totalBrightness = 0;
  let sampleCount = 0;
  
  // Sample every 100th byte (rough approximation)
  for (let i = 0; i < imageData.length; i += 100) {
    totalBrightness += imageData[i];
    sampleCount++;
  }
  
  const avgBrightness = sampleCount > 0 ? totalBrightness / sampleCount : 128;
  
  // If average brightness is high, it's likely a light-colored logo
  // Threshold at 140 (slightly above midpoint)
  return avgBrightness > 140 ? 'light' : 'dark';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { logoUrl, brandDomain, colorScheme } = await req.json();

    if (!logoUrl) {
      return new Response(
        JSON.stringify({ success: false, error: 'Logo URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Processing logo from:', logoUrl);
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

    // Step 1: Download the logo
    console.log('Downloading logo...');
    const logoResponse = await fetch(logoUrl);
    if (!logoResponse.ok) {
      throw new Error(`Failed to download logo: ${logoResponse.status}`);
    }
    
    const logoArrayBuffer = await logoResponse.arrayBuffer();
    const logoData = new Uint8Array(logoArrayBuffer);
    const contentType = logoResponse.headers.get('content-type') || 'image/png';
    
    console.log('Logo downloaded, size:', logoData.length, 'type:', contentType);

    // Step 2: Analyze if the logo is dark or light
    let detectedType = await analyzeLogoBrightness(logoData);
    
    // If website has a dark color scheme, the logo shown is likely the light version
    // and vice versa. Use this as a hint to override our detection.
    if (colorScheme === 'dark') {
      // Dark website likely shows light logo
      detectedType = 'light';
      console.log('Website is dark, assuming logo is light variant');
    } else if (colorScheme === 'light') {
      // Light website likely shows dark logo  
      detectedType = 'dark';
      console.log('Website is light, assuming logo is dark variant');
    }
    
    console.log('Detected logo type:', detectedType);

    // Step 3: Upload original to Cloudinary
    const timestamp = Math.round(Date.now() / 1000);
    const folder = brandDomain ? `brands/${brandDomain}/logos` : 'brands/logos';
    
    // Convert to base64 for upload
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

    const originalUrl = uploadResult.secure_url;

    // Step 4: Determine which URL is dark logo and which is light
    // IMPORTANT: We no longer generate inverted logos via e_negate as it produces poor results
    // Instead, we only store the variant we actually have and flag that we need the other
    let darkLogoUrl: string | null = null;
    let darkLogoPublicId: string | null = null;
    let lightLogoUrl: string | null = null;
    let lightLogoPublicId: string | null = null;
    let missingVariant: 'dark' | 'light';

    if (detectedType === 'dark') {
      // Original is dark logo (for light backgrounds)
      darkLogoUrl = originalUrl;
      darkLogoPublicId = uploadResult.public_id;
      missingVariant = 'light';
      console.log('Stored as dark logo - MISSING light variant (for dark backgrounds)');
    } else {
      // Original is light logo (for dark backgrounds)
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
        originalPublicId: uploadResult.public_id,
        // New fields to indicate incomplete logo set
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
