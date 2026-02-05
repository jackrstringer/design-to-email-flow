import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageData, imageUrl, folder } = await req.json();

    const privateKey = Deno.env.get('IMAGEKIT_PRIVATE_KEY');
    const urlEndpoint = Deno.env.get('IMAGEKIT_URL_ENDPOINT');

    if (!privateKey || !urlEndpoint) {
      console.error('Missing ImageKit credentials');
      return new Response(
        JSON.stringify({ error: 'ImageKit not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Support both base64 data and URL
    let uploadFile: string;
    
    if (imageUrl) {
      // ImageKit can fetch from URL directly
      console.log('Using URL for upload:', imageUrl.substring(0, 80) + '...');
      uploadFile = imageUrl;
    } else if (imageData) {
      // Use base64 data directly
      uploadFile = imageData;
    } else {
      console.error('No image data or URL provided');
      return new Response(
        JSON.stringify({ error: 'No image data or URL provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const folderPath = folder || 'email-converter';
    const fileName = `upload_${Date.now()}.png`;

    console.log('Uploading to ImageKit folder:', folderPath);

    // ImageKit uses Basic Auth with private key
    const authHeader = 'Basic ' + btoa(privateKey + ':');

    // Prepare form data for upload
    const formData = new FormData();
    formData.append('file', uploadFile);
    formData.append('fileName', fileName);
    formData.append('folder', folderPath);
    formData.append('useUniqueFileName', 'true');

    const uploadResponse = await fetch('https://upload.imagekit.io/api/v1/files/upload', {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
      },
      body: formData,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('ImageKit upload failed:', errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to upload to ImageKit', details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const result = await uploadResponse.json();
    console.log('ImageKit upload successful:', result.fileId);

    // Return in same format as Cloudinary for compatibility
    return new Response(
      JSON.stringify({
        url: result.url,
        publicId: result.fileId,
        width: result.width,
        height: result.height,
        filePath: result.filePath,
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
