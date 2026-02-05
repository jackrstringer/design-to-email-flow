// deploy-trigger
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Legal keywords to detect (case-insensitive)
const LEGAL_KEYWORDS = [
  'unsubscribe',
  'manage preferences',
  'email preferences',
  'no longer want to receive',
  'update preferences',
  'opt out',
  'opt-out',
];

// Address pattern: matches common US address formats
const ADDRESS_PATTERNS = [
  /\d+\s+[\w\s]+,\s*[\w\s]+,?\s*[A-Z]{2}\s*\d{5}/i,
  /\d+\s+[\w\s]+(street|st|avenue|ave|road|rd|drive|dr|boulevard|blvd)/i,
  /P\.?O\.?\s*Box\s+\d+/i,
];

// Copyright patterns
const COPYRIGHT_PATTERNS = [
  /©\s*\d{4}/,
  /\(c\)\s*\d{4}/i,
  /copyright\s*\d{4}/i,
  /all rights reserved/i,
];

interface TextAnnotation {
  description: string;
  boundingPoly?: {
    vertices?: Array<{ x?: number; y?: number }>;
  };
}

interface VisionResponse {
  responses?: Array<{
    textAnnotations?: TextAnnotation[];
    imagePropertiesAnnotation?: {
      dominantColors?: {
        colors?: Array<{
          color?: { red?: number; green?: number; blue?: number };
          score?: number;
          pixelFraction?: number;
        }>;
      };
    };
    error?: { message?: string };
  }>;
}

interface LegalTextBlock {
  text: string;
  yMin: number;
  yMax: number;
  type: 'unsubscribe' | 'preferences' | 'address' | 'org_name' | 'copyright' | 'legal_other';
}

interface ImageSlice {
  id: string;
  imageUrl: string;
  yTop: number;
  yBottom: number;
  yTopPercent: number;
  yBottomPercent: number;
  altText: string;
  link: string | null;
  isClickable: boolean;
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(x => Math.round(x).toString(16).padStart(2, '0')).join('');
}

function detectLegalType(text: string): LegalTextBlock['type'] | null {
  const lowerText = text.toLowerCase();
  
  // Check for unsubscribe
  if (lowerText.includes('unsubscribe')) {
    return 'unsubscribe';
  }
  
  // Check for preferences
  if (lowerText.includes('preferences') || lowerText.includes('opt out') || lowerText.includes('opt-out')) {
    return 'preferences';
  }
  
  // Check for address patterns
  for (const pattern of ADDRESS_PATTERNS) {
    if (pattern.test(text)) {
      return 'address';
    }
  }
  
  // Check for copyright
  for (const pattern of COPYRIGHT_PATTERNS) {
    if (pattern.test(text)) {
      return 'copyright';
    }
  }
  
  return null;
}

function isLegalText(text: string): boolean {
  const lowerText = text.toLowerCase();
  
  // Check keywords
  for (const keyword of LEGAL_KEYWORDS) {
    if (lowerText.includes(keyword)) return true;
  }
  
  // Check address patterns
  for (const pattern of ADDRESS_PATTERNS) {
    if (pattern.test(text)) return true;
  }
  
  // Check copyright patterns
  for (const pattern of COPYRIGHT_PATTERNS) {
    if (pattern.test(text)) return true;
  }
  
  return false;
}

async function uploadSliceToCloudinary(
  imageUrl: string,
  yTop: number,
  yBottom: number,
  width: number,
  folder: string
): Promise<string> {
  // Use URL transformation for cropping
  const height = Math.round(yBottom - yTop);
  
  // Handle ImageKit URLs
  if (imageUrl.includes('ik.imagekit.io')) {
    // Parse ImageKit URL to extract base, path, and extension
    const ikMatch = imageUrl.match(/(https:\/\/ik\.imagekit\.io\/[^/]+)\/(.+)\.(png|jpg|jpeg|webp)/i);
    if (ikMatch) {
      const [, base, path, ext] = ikMatch;
      // MUST include file extension for ImageKit!
      return `${base}/tr:x-0,y-${Math.round(yTop)},w-${Math.round(width)},h-${height},cm-extract/${path}.${ext}`;
    }
    // Fallback for URLs without extension match
    const match = imageUrl.match(/(https:\/\/ik\.imagekit\.io\/[^/]+)\/(.+)/);
    if (match) {
      const [, base, path] = match;
      return `${base}/tr:x-0,y-${Math.round(yTop)},w-${Math.round(width)},h-${height},cm-extract/${path}`;
    }
    console.warn('Could not parse ImageKit URL for cropping:', imageUrl);
    return imageUrl;
  }
  
  // Handle Cloudinary URLs
  if (imageUrl.includes('cloudinary.com')) {
    const cropTransform = `c_crop,h_${height},w_${Math.round(width)},y_${Math.round(yTop)},x_0`;
    const transformedUrl = imageUrl.replace(
      /\/upload\//,
      `/upload/${cropTransform}/`
    );
    return transformedUrl;
  }
  
  // If not on either CDN, return original URL
  console.warn('Image not on Cloudinary or ImageKit, cropping not applied:', imageUrl);
  return imageUrl;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const { imageUrl, brandDomain, imageWidth, imageHeight } = await req.json();

    if (!imageUrl) {
      return new Response(
        JSON.stringify({ success: false, error: 'No image URL provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('GOOGLE_CLOUD_VISION_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Vision API not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Analyzing footer image for slicing:', imageUrl);

    // Call Google Cloud Vision API with TEXT_DETECTION and IMAGE_PROPERTIES
    const visionResponse = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{
            image: { source: { imageUri: imageUrl } },
            features: [
              { type: 'TEXT_DETECTION', maxResults: 100 },
              { type: 'IMAGE_PROPERTIES' },
            ],
          }],
        }),
      }
    );

    if (!visionResponse.ok) {
      const errorText = await visionResponse.text();
      console.error('Vision API error:', errorText);
      throw new Error(`Vision API error: ${visionResponse.status}`);
    }

    const visionData: VisionResponse = await visionResponse.json();
    const response = visionData.responses?.[0];

    if (response?.error) {
      throw new Error(response.error.message || 'Vision API returned an error');
    }

    const textAnnotations = response?.textAnnotations || [];
    const colorInfo = response?.imagePropertiesAnnotation?.dominantColors?.colors || [];

    console.log(`Found ${textAnnotations.length} text annotations`);

    // Get image dimensions from annotations or use provided values
    let imgWidth = imageWidth || 600;
    let imgHeight = imageHeight || 400;

    // Try to get dimensions from the full text annotation (first one)
    if (textAnnotations.length > 0) {
      const fullTextBounds = textAnnotations[0].boundingPoly?.vertices || [];
      if (fullTextBounds.length >= 4) {
        const maxX = Math.max(...fullTextBounds.map(v => v.x || 0));
        const maxY = Math.max(...fullTextBounds.map(v => v.y || 0));
        if (maxX > imgWidth) imgWidth = maxX;
        if (maxY > imgHeight) imgHeight = maxY;
      }
    }

    console.log(`Image dimensions: ${imgWidth}x${imgHeight}`);

    // Analyze each text block to find legal content
    const legalBlocks: LegalTextBlock[] = [];
    let minLegalY = imgHeight;

    // Skip the first annotation (full text) and analyze individual blocks
    for (let i = 1; i < textAnnotations.length; i++) {
      const annotation = textAnnotations[i];
      const text = annotation.description || '';
      const vertices = annotation.boundingPoly?.vertices || [];
      
      if (vertices.length < 4) continue;

      const yMin = Math.min(...vertices.map(v => v.y || 0));
      const yMax = Math.max(...vertices.map(v => v.y || 0));

      // Check if this is legal text
      if (isLegalText(text)) {
        const type = detectLegalType(text) || 'legal_other';
        legalBlocks.push({ text, yMin, yMax, type });
        
        if (yMin < minLegalY) {
          minLegalY = yMin;
        }
      }
    }

    console.log(`Found ${legalBlocks.length} legal text blocks`);
    console.log(`Legal section starts at Y=${minLegalY}`);

    // Add padding above legal section
    const legalCutoffY = Math.max(0, minLegalY - 20);
    const legalCutoffPercent = (legalCutoffY / imgHeight) * 100;

    // Extract background color from the legal section area
    // Use the most dominant color that's likely a background (high pixel fraction)
    let bgColor = '#ffffff';
    let textColor = '#666666';

    if (colorInfo.length > 0) {
      // Find the color with highest pixel fraction (likely background)
      const sortedColors = [...colorInfo].sort((a, b) => 
        (b.pixelFraction || 0) - (a.pixelFraction || 0)
      );
      
      const dominantColor = sortedColors[0]?.color;
      if (dominantColor) {
        bgColor = rgbToHex(
          dominantColor.red || 0,
          dominantColor.green || 0,
          dominantColor.blue || 0
        );
        
        // Determine text color based on background brightness
        const brightness = ((dominantColor.red || 0) * 299 + 
                          (dominantColor.green || 0) * 587 + 
                          (dominantColor.blue || 0) * 114) / 1000;
        textColor = brightness > 128 ? '#333333' : '#ffffff';
      }
    }

    console.log(`Detected colors - bg: ${bgColor}, text: ${textColor}`);

    // Create slices for the visual portion (above legal cutoff)
    // For now, create a single slice for the entire visual area
    // Future: could use object detection to split into logical sections
    const slices: ImageSlice[] = [];

    if (legalCutoffY > 50) { // Only if there's meaningful visual content
      const folder = brandDomain ? `brands/${brandDomain}/footer-slices` : 'footer-slices';
      
      const sliceUrl = await uploadSliceToCloudinary(
        imageUrl,
        0,
        legalCutoffY,
        imgWidth,
        folder
      );

      slices.push({
        id: 'visual-section',
        imageUrl: sliceUrl,
        yTop: 0,
        yBottom: legalCutoffY,
        yTopPercent: 0,
        yBottomPercent: legalCutoffPercent,
        altText: 'Footer visual content',
        link: null,
        isClickable: false,
      });
    }

    // Build legal section data
    const legalSection = legalBlocks.length > 0 ? {
      yStart: legalCutoffY,
      yStartPercent: legalCutoffPercent,
      backgroundColor: bgColor,
      textColor: textColor,
      detectedElements: legalBlocks.map(block => ({
        type: block.type,
        text: block.text,
        yPosition: block.yMin,
      })),
      rawText: legalBlocks.map(b => b.text).join(' '),
    } : null;

    const processingTime = Date.now() - startTime;
    console.log(`Footer slicing complete in ${processingTime}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        slices,
        legalSection,
        dimensions: { width: imgWidth, height: imgHeight },
        processingTimeMs: processingTime,
        debug: {
          totalTextBlocks: textAnnotations.length - 1,
          legalTextBlocks: legalBlocks.length,
          detectedKeywords: legalBlocks.map(b => b.type),
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Footer slicing error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTimeMs: Date.now() - startTime,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
