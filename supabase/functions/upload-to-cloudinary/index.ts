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

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageData, imageUrl, folder } = await req.json();

    // Support both base64 data and URL
    let uploadData: string;
    
    if (imageUrl) {
      // Fetch image from URL and convert to base64
      console.log('Fetching image from URL:', imageUrl.substring(0, 80) + '...');
      const response = await fetch(imageUrl);
      if (!response.ok) {
        console.error('Failed to fetch image from URL:', response.status);
        return new Response(
          JSON.stringify({ error: 'Failed to fetch image from URL' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      const arrayBuffer = await response.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < uint8Array.length; i++) {
        binary += String.fromCharCode(uint8Array[i]);
      }
      
      // Determine content type from response or URL
      const contentType = response.headers.get('content-type') || 'image/png';
      const base64Data = btoa(binary);
      uploadData = `data:${contentType};base64,${base64Data}`;
      console.log('Converted URL image to base64, size:', base64Data.length);
    } else if (imageData) {
      uploadData = imageData;
    } else {
      console.error('No image data or URL provided');
      return new Response(
        JSON.stringify({ error: 'No image data or URL provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const cloudName = Deno.env.get('CLOUDINARY_CLOUD_NAME');
    const apiKey = Deno.env.get('CLOUDINARY_API_KEY');
    const apiSecret = Deno.env.get('CLOUDINARY_API_SECRET');

    if (!cloudName || !apiKey || !apiSecret) {
      console.error('Missing Cloudinary credentials');
      return new Response(
        JSON.stringify({ error: 'Cloudinary not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate timestamp
    const timestamp = Math.round(Date.now() / 1000);
    const folderPath = folder || 'email-converter';
    
    // Build signature string - Cloudinary requires params to be sorted alphabetically
    // Format: param1=value1&param2=value2...{api_secret}
    const signatureString = `folder=${folderPath}&timestamp=${timestamp}${apiSecret}`;
    
    console.log('Generating signature for folder:', folderPath, 'timestamp:', timestamp);

    const signature = await sha1(signatureString);
    
    console.log('Uploading to Cloudinary folder:', folderPath);

    // Upload to Cloudinary using base64 data URL directly
    const formData = new FormData();
    formData.append('file', uploadData);
    formData.append('api_key', apiKey);
    formData.append('timestamp', timestamp.toString());
    formData.append('signature', signature);
    formData.append('folder', folderPath);

    const uploadResponse = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      {
        method: 'POST',
        body: formData,
      }
    );

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('Cloudinary upload failed:', errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to upload to Cloudinary', details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const result = await uploadResponse.json();
    console.log('Cloudinary upload successful:', result.public_id);

    return new Response(
      JSON.stringify({
        url: result.secure_url,
        publicId: result.public_id,
        width: result.width,
        height: result.height,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Upload error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Internal server error', message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
