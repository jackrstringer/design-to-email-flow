import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Cloudinary's free tier limit is 10MB
const CLOUDINARY_MAX_BYTES = 10 * 1024 * 1024; // 10MB
const SAFETY_THRESHOLD = 9.5 * 1024 * 1024; // 9.5MB to leave buffer

// Helper function to create SHA-1 hash
async function sha1(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-1', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Estimate decoded size from base64 string
function estimateDecodedSize(base64Data: string): number {
  // Remove data URL prefix if present
  const base64Only = base64Data.includes(',') 
    ? base64Data.split(',')[1] 
    : base64Data;
  // Base64 encodes 3 bytes into 4 characters
  return Math.ceil(base64Only.length * 3 / 4);
}

// Decode base64 to Uint8Array
function decodeBase64(base64Data: string): Uint8Array {
  const base64Only = base64Data.includes(',') 
    ? base64Data.split(',')[1] 
    : base64Data;
  const binaryString = atob(base64Only);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Encode Uint8Array to base64 data URL
function encodeToDataUrl(bytes: Uint8Array, mimeType: string): string {
  let binary = '';
  const chunkSize = 32768; // Process in chunks to avoid stack overflow
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

interface CompressionResult {
  dataUrl: string;
  wasCompressed: boolean;
  originalBytes: number;
  finalBytes: number;
  finalFormat: string;
  originalWidth?: number;
  originalHeight?: number;
  finalWidth?: number;
  finalHeight?: number;
}

// Compress image if needed to fit under Cloudinary limit
async function compressIfNeeded(imageData: string): Promise<CompressionResult> {
  const originalBytes = estimateDecodedSize(imageData);
  
  console.log(`[upload-to-cloudinary] Original size: ${(originalBytes / 1024 / 1024).toFixed(2)}MB`);
  
  // If already under threshold, return as-is
  if (originalBytes < SAFETY_THRESHOLD) {
    return {
      dataUrl: imageData,
      wasCompressed: false,
      originalBytes,
      finalBytes: originalBytes,
      finalFormat: imageData.includes('image/png') ? 'png' : 'jpeg',
    };
  }
  
  console.log(`[upload-to-cloudinary] Image exceeds ${(SAFETY_THRESHOLD / 1024 / 1024).toFixed(1)}MB, compressing...`);
  
  // Decode the image
  const bytes = decodeBase64(imageData);
  let img: Image;
  
  try {
    img = await Image.decode(bytes);
  } catch (decodeErr) {
    console.error('[upload-to-cloudinary] Failed to decode image for compression:', decodeErr);
    // Return original and let Cloudinary reject it with clear error
    return {
      dataUrl: imageData,
      wasCompressed: false,
      originalBytes,
      finalBytes: originalBytes,
      finalFormat: 'unknown',
    };
  }
  
  const originalWidth = img.width;
  const originalHeight = img.height;
  
  console.log(`[upload-to-cloudinary] Image dimensions: ${originalWidth}x${originalHeight}`);
  
  // Try progressively lower quality JPEG encoding
  const qualityLevels = [92, 85, 78, 70];
  
  for (const quality of qualityLevels) {
    console.log(`[upload-to-cloudinary] Trying JPEG quality ${quality}...`);
    
    const jpegBytes = await img.encodeJPEG(quality);
    const jpegSize = jpegBytes.length;
    
    console.log(`[upload-to-cloudinary] JPEG q${quality} size: ${(jpegSize / 1024 / 1024).toFixed(2)}MB`);
    
    if (jpegSize < SAFETY_THRESHOLD) {
      const dataUrl = encodeToDataUrl(jpegBytes, 'image/jpeg');
      return {
        dataUrl,
        wasCompressed: true,
        originalBytes,
        finalBytes: jpegSize,
        finalFormat: `jpeg-q${quality}`,
        originalWidth,
        originalHeight,
        finalWidth: originalWidth,
        finalHeight: originalHeight,
      };
    }
  }
  
  // If still too large, we need to downscale
  console.log(`[upload-to-cloudinary] Quality reduction insufficient, applying downscale...`);
  
  // Calculate scale factor to get under limit
  // Assume JPEG at q70 is roughly 1 byte per pixel for estimation
  const targetPixels = SAFETY_THRESHOLD * 0.8; // Leave more buffer for downscaled
  const currentPixels = originalWidth * originalHeight;
  const scaleFactor = Math.sqrt(targetPixels / currentPixels);
  
  const newWidth = Math.round(originalWidth * scaleFactor);
  const newHeight = Math.round(originalHeight * scaleFactor);
  
  console.log(`[upload-to-cloudinary] Downscaling to ${newWidth}x${newHeight} (scale: ${scaleFactor.toFixed(2)})`);
  
  const resizedImg = img.resize(newWidth, newHeight);
  const resizedJpegBytes = await resizedImg.encodeJPEG(85);
  
  console.log(`[upload-to-cloudinary] Downscaled JPEG size: ${(resizedJpegBytes.length / 1024 / 1024).toFixed(2)}MB`);
  
  const dataUrl = encodeToDataUrl(resizedJpegBytes, 'image/jpeg');
  
  return {
    dataUrl,
    wasCompressed: true,
    originalBytes,
    finalBytes: resizedJpegBytes.length,
    finalFormat: 'jpeg-downscaled',
    originalWidth,
    originalHeight,
    finalWidth: newWidth,
    finalHeight: newHeight,
  };
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageData, folder } = await req.json();

    if (!imageData) {
      console.error('No image data provided');
      return new Response(
        JSON.stringify({ error: 'No image data provided' }),
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

    // Compress if needed to fit under Cloudinary's limit
    const compression = await compressIfNeeded(imageData);
    
    if (compression.wasCompressed) {
      console.log(`[upload-to-cloudinary] Compressed: ${(compression.originalBytes / 1024 / 1024).toFixed(2)}MB → ${(compression.finalBytes / 1024 / 1024).toFixed(2)}MB (${compression.finalFormat})`);
      if (compression.originalWidth && compression.finalWidth) {
        console.log(`[upload-to-cloudinary] Dimensions: ${compression.originalWidth}x${compression.originalHeight} → ${compression.finalWidth}x${compression.finalHeight}`);
      }
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
    formData.append('file', compression.dataUrl);
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
      
      // Check for file size error
      if (errorText.includes('File size too large')) {
        return new Response(
          JSON.stringify({ 
            error: 'Image too large for upload', 
            details: errorText,
            originalBytes: compression.originalBytes,
            finalBytes: compression.finalBytes,
            hint: 'Try exporting at 1x scale or as JPG from Figma'
          }),
          { status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
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
        // Include compression metadata for debugging
        compression: compression.wasCompressed ? {
          wasCompressed: true,
          originalBytes: compression.originalBytes,
          finalBytes: compression.finalBytes,
          finalFormat: compression.finalFormat,
          originalWidth: compression.originalWidth,
          originalHeight: compression.originalHeight,
          finalWidth: compression.finalWidth,
          finalHeight: compression.finalHeight,
        } : { wasCompressed: false },
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
