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

// Get base URL without query parameters for comparison
function getBaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url.split('?')[0];
  }
}

// Analyze image brightness and return numeric value (0-255)
async function analyzeLogoBrightness(imageData: Uint8Array): Promise<number> {
  let totalBrightness = 0;
  let sampleCount = 0;
  
  // Sample every 100th byte
  for (let i = 0; i < imageData.length; i += 100) {
    totalBrightness += imageData[i];
    sampleCount++;
  }
  
  return sampleCount > 0 ? totalBrightness / sampleCount : 128;
}

// Download an image and return its data
async function downloadImage(url: string): Promise<{ data: Uint8Array; contentType: string } | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });
    if (!response.ok) return null;
    
    const arrayBuffer = await response.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);
    const contentType = response.headers.get('content-type') || 'image/png';
    
    return { data, contentType };
  } catch (error) {
    console.error('Failed to download image:', url, error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      logoUrl,           // Primary branding logo
      footerLogoUrl,     // Footer extraction
      headerLogoUrl,     // Header extraction (if different from logoUrl)
      whiteLogoUrl,      // Explicitly detected white logo
      darkLogoUrl,       // Explicitly detected dark logo
      allLogos,          // Array of all found logos
      brandDomain, 
      colorScheme 
    } = await req.json();

    console.log('=== PROCESSING LOGOS ===');
    console.log('Logo URL:', logoUrl);
    console.log('Footer logo URL:', footerLogoUrl);
    console.log('Header logo URL:', headerLogoUrl);
    console.log('White logo URL:', whiteLogoUrl);
    console.log('Dark logo URL:', darkLogoUrl);
    console.log('All logos count:', allLogos?.length || 0);
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
    const uploadLogo = async (imageData: Uint8Array, contentType: string, suffix: string): Promise<{ url: string; publicId: string } | null> => {
      try {
        console.log(`Uploading ${suffix} logo, size: ${imageData.length}`);
        
        const timestamp = Math.round(Date.now() / 1000);
        const base64Logo = btoa(String.fromCharCode(...imageData));
        const dataUrl = `data:${contentType};base64,${base64Logo}`;
        
        const signatureString = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
        const signature = await sha1(signatureString);

        const formData = new FormData();
        formData.append('file', dataUrl);
        formData.append('api_key', apiKey);
        formData.append('timestamp', timestamp.toString());
        formData.append('signature', signature);
        formData.append('folder', folder);

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

    // Collect all unique logo candidates
    const candidateUrls = new Set<string>();
    
    // Add explicitly identified logos first (higher priority)
    if (darkLogoUrl && darkLogoUrl.startsWith('http')) candidateUrls.add(darkLogoUrl);
    if (whiteLogoUrl && whiteLogoUrl.startsWith('http')) candidateUrls.add(whiteLogoUrl);
    if (headerLogoUrl && headerLogoUrl.startsWith('http')) candidateUrls.add(headerLogoUrl);
    if (footerLogoUrl && footerLogoUrl.startsWith('http')) candidateUrls.add(footerLogoUrl);
    if (logoUrl && logoUrl.startsWith('http')) candidateUrls.add(logoUrl);
    
    // Add all other logo candidates
    if (allLogos && Array.isArray(allLogos)) {
      for (const url of allLogos) {
        if (url && typeof url === 'string' && url.startsWith('http')) {
          candidateUrls.add(url);
        }
      }
    }

    console.log('Total unique candidates:', candidateUrls.size);

    // Filter to get truly unique logos (by base URL)
    const baseUrlMap = new Map<string, string>();
    for (const url of candidateUrls) {
      const base = getBaseUrl(url);
      if (!baseUrlMap.has(base)) {
        baseUrlMap.set(base, url);
      }
    }

    const uniqueUrls = Array.from(baseUrlMap.values());
    console.log('Unique logos after base URL dedup:', uniqueUrls.length);

    if (uniqueUrls.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No valid logo URLs provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Download all candidates and analyze brightness
    const analyzed: Array<{ url: string; data: Uint8Array; contentType: string; brightness: number }> = [];
    
    for (const url of uniqueUrls) {
      const downloaded = await downloadImage(url);
      if (downloaded && downloaded.data.length > 100) { // Ensure it's a real image
        const brightness = await analyzeLogoBrightness(downloaded.data);
        analyzed.push({
          url,
          data: downloaded.data,
          contentType: downloaded.contentType,
          brightness,
        });
        console.log(`Analyzed: ${url.substring(0, 80)}... brightness: ${brightness.toFixed(1)}`);
      }
    }

    console.log('Successfully analyzed', analyzed.length, 'logos');

    if (analyzed.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to download any logos' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let finalDarkLogo: { url: string; publicId: string } | null = null;
    let finalLightLogo: { url: string; publicId: string } | null = null;
    let detectedType: 'dark' | 'light' = 'dark';

    // Case 1: Multiple logo candidates - find the darkest and lightest
    if (analyzed.length >= 2) {
      // Sort by brightness
      analyzed.sort((a, b) => a.brightness - b.brightness);
      
      const darkest = analyzed[0];
      const lightest = analyzed[analyzed.length - 1];
      const brightnessDiff = lightest.brightness - darkest.brightness;

      console.log('Darkest logo brightness:', darkest.brightness.toFixed(1), darkest.url.substring(0, 60));
      console.log('Lightest logo brightness:', lightest.brightness.toFixed(1), lightest.url.substring(0, 60));
      console.log('Brightness difference:', brightnessDiff.toFixed(1));

      // If there's a significant brightness difference (>30), we found a pair
      if (brightnessDiff > 30) {
        console.log('Found distinct dark/light logo pair!');
        
        // Upload both
        const darkResult = await uploadLogo(darkest.data, darkest.contentType, 'dark');
        const lightResult = await uploadLogo(lightest.data, lightest.contentType, 'light');
        
        if (darkResult) finalDarkLogo = darkResult;
        if (lightResult) finalLightLogo = lightResult;
        
        const hasBothVariants = finalDarkLogo && finalLightLogo;
        
        return new Response(
          JSON.stringify({
            success: true,
            originalUrl: finalDarkLogo?.url || finalLightLogo?.url,
            detectedType: 'dark',
            darkLogoUrl: finalDarkLogo?.url || null,
            darkLogoPublicId: finalDarkLogo?.publicId || null,
            lightLogoUrl: finalLightLogo?.url || null,
            lightLogoPublicId: finalLightLogo?.publicId || null,
            originalPublicId: finalDarkLogo?.publicId || finalLightLogo?.publicId,
            hasOnlyOneVariant: !hasBothVariants,
            missingVariant: !finalDarkLogo ? 'dark' : (!finalLightLogo ? 'light' : null),
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } else {
        console.log('All logos have similar brightness - treating as single logo');
      }
    }

    // Case 2: Single logo or all logos are similar brightness
    const singleLogo = analyzed[0];
    
    // Determine if it's dark or light based on brightness and website color scheme
    if (singleLogo.brightness > 140) {
      detectedType = 'light';
    } else {
      detectedType = 'dark';
    }
    
    // Override based on website color scheme
    if (colorScheme === 'dark') {
      detectedType = 'light';
      console.log('Website is dark themed, assuming logo is light variant');
    } else if (colorScheme === 'light') {
      detectedType = 'dark';
      console.log('Website is light themed, assuming logo is dark variant');
    }

    console.log('Single logo processing - detected type:', detectedType);

    // Upload the single logo
    const uploadedLogo = await uploadLogo(singleLogo.data, singleLogo.contentType, detectedType);
    
    if (!uploadedLogo) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to upload logo' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const missingVariant: 'dark' | 'light' = detectedType === 'dark' ? 'light' : 'dark';

    return new Response(
      JSON.stringify({
        success: true,
        originalUrl: uploadedLogo.url,
        detectedType,
        darkLogoUrl: detectedType === 'dark' ? uploadedLogo.url : null,
        darkLogoPublicId: detectedType === 'dark' ? uploadedLogo.publicId : null,
        lightLogoUrl: detectedType === 'light' ? uploadedLogo.url : null,
        lightLogoPublicId: detectedType === 'light' ? uploadedLogo.publicId : null,
        originalPublicId: uploadedLogo.publicId,
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
