// deploy-trigger
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { logoUrl, brandDomain, targetVariant } = await req.json();

    const CLOUDINARY_CLOUD_NAME = Deno.env.get('CLOUDINARY_CLOUD_NAME');
    const CLOUDINARY_API_KEY = Deno.env.get('CLOUDINARY_API_KEY');
    const CLOUDINARY_API_SECRET = Deno.env.get('CLOUDINARY_API_SECRET');

    if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
      throw new Error('Cloudinary credentials not configured');
    }

    if (!logoUrl) {
      throw new Error('Logo URL is required');
    }

    console.log(`Inverting logo for ${targetVariant} variant:`, logoUrl);

    // Download the original image
    const imageResponse = await fetch(logoUrl);
    if (!imageResponse.ok) {
      throw new Error('Failed to download original logo');
    }
    const imageBlob = await imageResponse.blob();
    const imageBuffer = await imageBlob.arrayBuffer();
    const base64Image = btoa(String.fromCharCode(...new Uint8Array(imageBuffer)));
    const mimeType = imageBlob.type || 'image/png';
    const dataUrl = `data:${mimeType};base64,${base64Image}`;

    // Upload to Cloudinary with negate transformation
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = `brands/${brandDomain || 'unknown'}/logos`;
    const publicId = `${targetVariant}_logo_inverted_${timestamp}`;
    
    // Create signature for upload
    const signatureString = `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}&transformation=e_negate${CLOUDINARY_API_SECRET}`;
    const encoder = new TextEncoder();
    const data = encoder.encode(signatureString);
    const hashBuffer = await crypto.subtle.digest('SHA-1', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const signature = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // Upload with transformation
    const formData = new FormData();
    formData.append('file', dataUrl);
    formData.append('folder', folder);
    formData.append('public_id', publicId);
    formData.append('timestamp', timestamp.toString());
    formData.append('transformation', 'e_negate');
    formData.append('api_key', CLOUDINARY_API_KEY);
    formData.append('signature', signature);

    const uploadResponse = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
      { method: 'POST', body: formData }
    );

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('Cloudinary upload error:', errorText);
      throw new Error('Failed to upload inverted logo');
    }

    const uploadResult = await uploadResponse.json();
    console.log('Inverted logo uploaded:', uploadResult.secure_url);

    return new Response(JSON.stringify({
      success: true,
      invertedUrl: uploadResult.secure_url,
      publicId: uploadResult.public_id,
      targetVariant
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Invert logo error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
