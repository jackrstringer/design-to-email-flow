import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProcessRequest {
  jobId: string;
}

interface LinkIndexEntry {
  title: string;
  url: string;
  link_type: string;
}

interface BrandPreferenceRule {
  name: string;
  destination_url: string;
}

interface LegalSectionData {
  yStart: number;
  yEnd?: number;
  backgroundColor: string;
  textColor: string;
  content?: string;  // Rich text content with Klaviyo merge tags
  fontSize?: number;
  lineHeight?: number;
  textAlign?: 'left' | 'center' | 'right';
  paddingTop?: number;
  paddingBottom?: number;
  paddingHorizontal?: number;
  detectedElements: Array<{
    type: 'unsubscribe' | 'preferences' | 'address' | 'org_name' | 'copyright';
    text: string;
  }>;
  hasOrgName?: boolean;
  hasOrgAddress?: boolean;
  hasUnsubscribe?: boolean;
}

// Fine print content extracted by Claude
interface FinePrintContent {
  rawText: string;
  detectedOrgName?: string;
  detectedAddress?: string;
  hasUnsubscribeText: boolean;
  hasManagePreferences: boolean;
  hasCopyright: boolean;
  textAlignment: 'left' | 'center' | 'right';
  estimatedFontSize: number;
  backgroundColor?: string;
  textColor?: string;
}

// Detect MIME type from base64 magic bytes
function detectMimeType(base64: string): string {
  try {
    // Decode first 12 bytes to check magic bytes
    const binaryStr = atob(base64.substring(0, 16));
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
      return 'image/png';
    }
    // JPEG: FF D8 FF
    if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
      return 'image/jpeg';
    }
    // WebP: 52 49 46 46 ... 57 45 42 50
    if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
      return 'image/webp';
    }
    // GIF: 47 49 46 38
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
      return 'image/gif';
    }
  } catch (e) {
    console.warn('[process-footer] Failed to detect MIME type from bytes:', e);
  }
  
  // Fallback
  return 'image/jpeg';
}

// Transform Cloudinary URL to include resize parameters
function getResizedCloudinaryUrl(url: string, maxWidth: number, maxHeight: number): string {
  if (!url || !url.includes('cloudinary.com/')) return url;
  
  const uploadIndex = url.indexOf('/upload/');
  if (uploadIndex === -1) return url;
  
  const before = url.substring(0, uploadIndex + 8);
  const after = url.substring(uploadIndex + 8);
  
  return `${before}c_limit,w_${maxWidth},h_${maxHeight}/${after}`;
}

// Helper to update job status
async function updateJob(
  supabase: any,
  jobId: string,
  updates: Record<string, unknown>
) {
  const { error } = await supabase
    .from('footer_processing_jobs')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', jobId);
  
  if (error) {
    console.error('[process-footer] Failed to update job:', error);
  }
}

// Step 1: Fetch image as base64
async function fetchImageAsBase64(imageUrl: string): Promise<string | null> {
  console.log('[process-footer] Step 1: Fetching image...');
  
  try {
    const resizedUrl = getResizedCloudinaryUrl(imageUrl, 600, 4000);
    console.log('[process-footer] Using resized URL:', resizedUrl.substring(0, 80) + '...');
    
    const response = await fetch(resizedUrl);
    if (!response.ok) throw new Error('Failed to fetch image');
    
    const buffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < uint8Array.length; i++) {
      binary += String.fromCharCode(uint8Array[i]);
    }
    return btoa(binary);
  } catch (err) {
    console.error('[process-footer] Failed to fetch image:', err);
    return null;
  }
}

// Step 2: Run auto-slice-v2 with link intelligence
async function autoSliceFooter(
  imageBase64: string,
  imageWidth: number,
  imageHeight: number,
  linkIndex?: LinkIndexEntry[],
  defaultDestinationUrl?: string,
  brandPreferenceRules?: BrandPreferenceRule[]
): Promise<{
  slices: any[];
  footerStartY: number;
  imageHeight: number;
  analyzedWidth: number;
  analyzedHeight: number;
  needsLinkSearch?: Array<{ sliceIndex: number; description: string }>;
  finePrintContent?: FinePrintContent | null;
} | null> {
  const hasLinkIndex = linkIndex && linkIndex.length > 0;
  console.log(`[process-footer] Step 2: Auto-slicing footer... (link index: ${hasLinkIndex ? linkIndex.length + ' links' : 'none'})`);

  try {
    // Detect MIME type from image data
    const mimeType = detectMimeType(imageBase64);
    console.log(`[process-footer] Detected MIME type: ${mimeType}`);
    
    const sliceUrl = Deno.env.get('SUPABASE_URL') + '/functions/v1/auto-slice-v2';
    const response = await fetch(sliceUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
      },
      body: JSON.stringify({
        imageDataUrl: `data:${mimeType};base64,${imageBase64}`,
        imageWidth,
        imageHeight,
        linkIndex: hasLinkIndex ? linkIndex : undefined,
        defaultDestinationUrl: hasLinkIndex ? defaultDestinationUrl : undefined,
        brandPreferenceRules: hasLinkIndex ? brandPreferenceRules : undefined,
        // For footers, we want ALL slices including what would normally be "footer"
        isFooterMode: true
      })
    });

    if (!response.ok) {
      console.error('[process-footer] Auto-slice failed:', await response.text());
      return null;
    }

    const result = await response.json();
    
    if (!result.success) {
      console.error('[process-footer] Auto-slice unsuccessful:', result.error);
      return null;
    }

    // For footers, we keep ALL slices (we handle legal section detection separately)
    console.log(`[process-footer] Sliced into ${result.slices?.length || 0} sections`);
    
    return {
      slices: result.slices || [],
      footerStartY: result.footerStartY,
      imageHeight: result.imageHeight,
      analyzedWidth: result.imageWidth || imageWidth,
      analyzedHeight: result.imageHeight || imageHeight,
      needsLinkSearch: result.needsLinkSearch || [],
      finePrintContent: result.finePrintContent || null
    };

  } catch (err) {
    console.error('[process-footer] Auto-slice error:', err);
    return null;
  }
}

// Step 3: Detect legal section using Vision OCR
async function detectLegalSection(
  imageBase64: string,
  imageHeight: number
): Promise<LegalSectionData | null> {
  console.log('[process-footer] Step 3: Detecting legal section...');
  
  const apiKey = Deno.env.get("GOOGLE_CLOUD_VISION_API_KEY");
  if (!apiKey) {
    console.log('[process-footer] No Vision API key, skipping legal detection');
    return null;
  }

  try {
    const response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: [{
            image: { content: imageBase64 },
            features: [
              { type: "DOCUMENT_TEXT_DETECTION" },
              { type: "IMAGE_PROPERTIES" }
            ]
          }]
        })
      }
    );

    if (!response.ok) {
      console.error('[process-footer] Vision API error:', await response.text());
      return null;
    }

    const data = await response.json();
    const annotation = data.responses?.[0]?.fullTextAnnotation;
    const imageProperties = data.responses?.[0]?.imagePropertiesAnnotation;
    
    if (!annotation) {
      console.log('[process-footer] No text detected in footer');
      return null;
    }

    // Legal keywords to detect
    const legalKeywords = [
      'unsubscribe', 'manage preferences', 'email preferences',
      'opt out', 'opt-out', 'no longer want to receive',
      'update your preferences', 'update preferences'
    ];
    
    // Address patterns
    const addressPatterns = [
      /\d+\s+[\w\s]+,\s*[\w\s]+,?\s*[A-Z]{2}\s*\d{5}/i,
      /P\.?O\.?\s*Box\s+\d+/i,
      /\d{5}(-\d{4})?/  // Zip code
    ];

    // Parse text blocks and find legal content
    const paragraphs: Array<{ text: string; yTop: number; yBottom: number }> = [];
    
    for (const page of annotation.pages || []) {
      for (const block of page.blocks || []) {
        for (const paragraph of block.paragraphs || []) {
          const vertices = paragraph.boundingBox?.vertices || [];
          if (vertices.length < 4) continue;
          
          const yCoords = vertices.map((v: any) => v.y || 0);
          const yTop = Math.min(...yCoords);
          const yBottom = Math.max(...yCoords);
          
          let text = '';
          for (const word of paragraph.words || []) {
            for (const symbol of word.symbols || []) {
              text += symbol.text || '';
            }
            text += ' ';
          }
          
          paragraphs.push({ text: text.trim(), yTop, yBottom });
        }
      }
    }

    // Find legal keywords and their Y positions
    const detectedElements: LegalSectionData['detectedElements'] = [];
    let legalYPositions: number[] = [];

    for (const para of paragraphs) {
      const textLower = para.text.toLowerCase();
      
      // Check for unsubscribe
      if (textLower.includes('unsubscribe')) {
        detectedElements.push({ type: 'unsubscribe', text: para.text });
        legalYPositions.push(para.yTop);
      }
      
      // Check for preferences
      if (textLower.includes('preferences') || textLower.includes('opt out') || textLower.includes('opt-out')) {
        detectedElements.push({ type: 'preferences', text: para.text });
        legalYPositions.push(para.yTop);
      }
      
      // Check for address
      for (const pattern of addressPatterns) {
        if (pattern.test(para.text)) {
          detectedElements.push({ type: 'address', text: para.text });
          legalYPositions.push(para.yTop);
          break;
        }
      }
      
      // Check for copyright
      if (textLower.includes('©') || textLower.includes('copyright') || textLower.includes('all rights reserved')) {
        detectedElements.push({ type: 'copyright', text: para.text });
        legalYPositions.push(para.yTop);
      }
    }

    if (legalYPositions.length === 0) {
      console.log('[process-footer] No legal content detected');
      return null;
    }

    // Legal section starts at the topmost legal element (with 20px buffer)
    const legalStartY = Math.min(...legalYPositions) - 20;
    console.log(`[process-footer] Legal section detected starting at Y=${legalStartY}`);

    // Extract dominant colors for the legal section area
    let backgroundColor = '#1a1a1a';  // Default dark
    let textColor = '#ffffff';  // Default white
    
    const dominantColors = imageProperties?.dominantColors?.colors || [];
    if (dominantColors.length > 0) {
      // Use the most dominant color as background
      const bgColor = dominantColors[0].color;
      if (bgColor) {
        backgroundColor = `#${Math.round(bgColor.red || 0).toString(16).padStart(2, '0')}${Math.round(bgColor.green || 0).toString(16).padStart(2, '0')}${Math.round(bgColor.blue || 0).toString(16).padStart(2, '0')}`;
        
        // Determine text color based on background luminance
        const luminance = (0.299 * (bgColor.red || 0) + 0.587 * (bgColor.green || 0) + 0.114 * (bgColor.blue || 0)) / 255;
        textColor = luminance > 0.5 ? '#000000' : '#ffffff';
      }
    }

    return {
      yStart: Math.max(0, legalStartY),
      backgroundColor,
      textColor,
      detectedElements
    };

  } catch (err) {
    console.error('[process-footer] Legal detection error:', err);
    return null;
  }
}

// Step 4: Generate Cloudinary crop URLs for slices
// NOTE: No longer filters by legalCutoffY - filtering is done BEFORE this is called
function generateSliceCropUrls(
  slices: any[],
  originalImageUrl: string,
  actualWidth: number,
  actualHeight: number,
  analyzedWidth: number,
  analyzedHeight: number
): any[] {
  console.log('[process-footer] Step 4: Generating crop URLs...');
  console.log(`[process-footer] Dimensions: ${actualWidth}x${actualHeight}, analyzed: ${analyzedWidth}x${analyzedHeight}`);
  console.log(`[process-footer] Processing ${slices.length} slices`);

  // Extract Cloudinary base URL and public ID - support both with and without transformations
  // Pattern 1: .../upload/v123456/path/to/image.png
  // Pattern 2: .../upload/c_limit,w_600,h_4000/v123456/path/to/image.png
  let match = originalImageUrl.match(/(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload)(?:\/[^/v][^/]*)*\/v\d+\/(.+)\.(png|jpg|jpeg|webp)/i);
  
  // Fallback pattern without version number
  if (!match) {
    match = originalImageUrl.match(/(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload)(?:\/[^/]+)*\/([^/]+)\.(png|jpg|jpeg|webp)/i);
  }
  
  if (!match) {
    console.error('[process-footer] Could not parse Cloudinary URL:', originalImageUrl);
    console.warn('[process-footer] Expected Cloudinary URL format. Slices will not have crop URLs.');
    
    // Return slices without crop URLs - they can still be displayed but won't be cropped
    return slices.map((slice, i) => ({
      ...slice,
      imageUrl: null,
      needsCloudinaryUpload: true,  // Signal to frontend that image needs to be on Cloudinary
      width: actualWidth,
      height: slice.yBottom - slice.yTop,
    }));
  }
  
  const [, baseUrl, publicId] = match;
  
  // Calculate scale factor
  const scaleX = actualWidth / analyzedWidth;
  const scaleY = actualHeight / analyzedHeight;
  
  const results: any[] = [];
  
  for (let i = 0; i < slices.length; i++) {
    const slice = slices[i];
    
    // Scale coordinates
    const yTop = Math.round(slice.yTop * scaleY);
    const yBottom = Math.round(slice.yBottom * scaleY);
    const sliceHeight = yBottom - yTop;
    
    if (slice.horizontalSplit && slice.horizontalSplit.columns > 1) {
      // Handle horizontal splits (social icons, nav links)
      const { columns, gutterPositions } = slice.horizontalSplit;
      
      const xBoundaries = [
        0,
        ...(gutterPositions || []).map((p: number) => Math.round(actualWidth * p / 100)),
        actualWidth
      ];
      
      console.log(`[process-footer] Slice ${i + 1}: ${columns} columns`);
      
      const columnSlices: any[] = [];
      for (let col = 0; col < columns; col++) {
        const xLeft = xBoundaries[col];
        const xRight = xBoundaries[col + 1];
        const colWidth = xRight - xLeft;
        
        const cropUrl = `${baseUrl}/c_crop,x_${xLeft},y_${yTop},w_${colWidth},h_${sliceHeight},q_90,f_jpg/${publicId}`;
        
        columnSlices.push({
          ...slice,
          imageUrl: cropUrl,
          width: colWidth,
          height: sliceHeight,
          column: col,
          totalColumns: columns,
          rowIndex: i,
        });
      }
      
      results.push(...columnSlices);
    } else {
      // Full-width slice
      const cropUrl = `${baseUrl}/c_crop,x_0,y_${yTop},w_${actualWidth},h_${sliceHeight},q_90,f_jpg/${publicId}`;
      
      results.push({
        ...slice,
        imageUrl: cropUrl,
        width: actualWidth,
        height: sliceHeight,
        column: 0,
        totalColumns: 1,
        rowIndex: i,
      });
    }
  }
  
  console.log(`[process-footer] Generated ${results.length} crop URLs`);
  return results;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const body: ProcessRequest = await req.json();
    const { jobId } = body;

    if (!jobId) {
      return new Response(
        JSON.stringify({ error: 'jobId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[process-footer] Starting processing for job:', jobId);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch the job
    const { data: job, error: fetchError } = await supabase
      .from('footer_processing_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (fetchError || !job) {
      console.error('[process-footer] Job not found:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Job not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate image is on Cloudinary (required for crop URLs)
    if (!job.image_url.includes('cloudinary.com')) {
      console.error('[process-footer] Image must be hosted on Cloudinary:', job.image_url.substring(0, 80));
      await updateJob(supabase, jobId, {
        status: 'failed',
        error_message: 'Image must be uploaded to Cloudinary first. Please re-upload your image.'
      });
      return new Response(
        JSON.stringify({ success: false, error: 'Image not on Cloudinary' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // === STEP 1: Fetch image (10%) ===
    await updateJob(supabase, jobId, {
      processing_step: 'fetching_image',
      processing_percent: 5
    });

    const imageBase64 = await fetchImageAsBase64(job.image_url);
    
    if (!imageBase64) {
      await updateJob(supabase, jobId, {
        status: 'failed',
        error_message: 'Failed to fetch image'
      });
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch image' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    await updateJob(supabase, jobId, { processing_percent: 10 });

    // === FETCH LINK INDEX FOR BRAND ===
    let linkIndex: LinkIndexEntry[] = [];
    let defaultDestinationUrl: string | null = null;
    let brandPreferenceRules: BrandPreferenceRule[] = [];
    let brandDomain: string | null = null;
    
    if (job.brand_id) {
      try {
        const { data: links } = await supabase
          .from('brand_link_index')
          .select('title, url, link_type')
          .eq('brand_id', job.brand_id)
          .eq('is_healthy', true)
          .order('use_count', { ascending: false })
          .limit(100);
        
        if (links && links.length > 0) {
          linkIndex = links.map((l: any) => ({
            title: l.title || '',
            url: l.url,
            link_type: l.link_type
          }));
          console.log(`[process-footer] Loaded ${linkIndex.length} links from brand index`);
        }

        // Fetch brand preferences and domain
        const { data: brand } = await supabase
          .from('brands')
          .select('website_url, link_preferences, domain')
          .eq('id', job.brand_id)
          .single();
        
        if (brand) {
          defaultDestinationUrl = brand.website_url || null;
          brandDomain = brand.domain || null;
          const prefs = brand.link_preferences as any;
          brandPreferenceRules = prefs?.rules || [];
        }
      } catch (err) {
        console.error('[process-footer] Failed to fetch brand data:', err);
      }
    }

    // === STEP 2: Auto-slice with link intelligence (40%) ===
    await updateJob(supabase, jobId, {
      processing_step: 'slicing_footer',
      processing_percent: 15
    });

    const sliceResult = await autoSliceFooter(
      imageBase64,
      job.image_width || 600,
      job.image_height || 800,
      linkIndex,
      defaultDestinationUrl || undefined,
      brandPreferenceRules
    );

    if (!sliceResult) {
      await updateJob(supabase, jobId, {
        status: 'failed',
        error_message: 'Failed to slice footer image'
      });
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to slice footer' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    await updateJob(supabase, jobId, { processing_percent: 40 });

    // === STEP 3: Identify fine_print slice and convert to legal section (50%) ===
    await updateJob(supabase, jobId, {
      processing_step: 'processing_fine_print',
      processing_percent: 45
    });

    // Find the fine_print slice from Claude's output (only if Claude actually created one)
    const finePrintSlice = sliceResult.slices.find((s: any) => 
      s.name?.toLowerCase().includes('fine_print') || 
      s.name?.toLowerCase().includes('legal') ||
      s.name?.toLowerCase() === 'fine print'
    );

    let legalSection: LegalSectionData | null = null;
    let imageSlices = sliceResult.slices;

    if (finePrintSlice) {
      console.log(`[process-footer] Found fine_print slice at Y=${finePrintSlice.yTop}-${finePrintSlice.yBottom}`);
      
      // Use Claude's extracted finePrintContent if available
      const finePrintContent = sliceResult.finePrintContent;
      
      if (finePrintContent && finePrintContent.rawText) {
        console.log(`[process-footer] Using Claude's extracted fine print content`);
        
        // Convert raw text to HTML with Klaviyo merge tags
        let htmlContent = finePrintContent.rawText;
        
        // Replace detected org name with merge tag
        if (finePrintContent.detectedOrgName) {
          htmlContent = htmlContent.replace(
            new RegExp(finePrintContent.detectedOrgName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
            '{{ organization.name }}'
          );
        }
        
        // Replace detected address with merge tag
        if (finePrintContent.detectedAddress) {
          htmlContent = htmlContent.replace(
            new RegExp(finePrintContent.detectedAddress.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
            '{{ organization.address }}'
          );
        }
        
        // Wrap unsubscribe text in link
        if (finePrintContent.hasUnsubscribeText) {
          htmlContent = htmlContent.replace(
            /unsubscribe/gi,
            '<a href="{% unsubscribe_url %}">Unsubscribe</a>'
          );
        }
        
        // Wrap manage preferences in link
        if (finePrintContent.hasManagePreferences) {
          htmlContent = htmlContent.replace(
            /manage\s*preferences/gi,
            '<a href="{% manage_preferences_url %}">Manage Preferences</a>'
          );
        }
        
        // Convert newlines to <br>
        htmlContent = htmlContent.replace(/\\n/g, '<br>').replace(/\n/g, '<br>');
        
        legalSection = {
          yStart: finePrintSlice.yTop,
          yEnd: finePrintSlice.yBottom,
          backgroundColor: finePrintContent.backgroundColor || '#1a1a1a',
          textColor: finePrintContent.textColor || '#ffffff',
          content: htmlContent,
          fontSize: finePrintContent.estimatedFontSize || 11,
          textAlign: finePrintContent.textAlignment || 'center',
          detectedElements: [],
          hasOrgName: htmlContent.includes('{{ organization.name }}'),
          hasOrgAddress: htmlContent.includes('{{ organization.address }}'),
          hasUnsubscribe: htmlContent.includes('{% unsubscribe_url %}'),
        };
        console.log(`[process-footer] Converted fine print to rich HTML content`);
      } else {
        // Fallback: Use OCR to extract metadata
        legalSection = await detectLegalSection(imageBase64, sliceResult.imageHeight);
        if (legalSection) {
          legalSection.yStart = finePrintSlice.yTop;
        } else {
          // Fallback: no OCR detected, default to matching footer style (white bg)
          legalSection = {
            yStart: finePrintSlice.yTop,
            backgroundColor: '#ffffff',
            textColor: '#1a1a1a',
            detectedElements: []
          };
        }
      }
      
      // Remove fine_print from image slices (it becomes HTML)
      imageSlices = sliceResult.slices.filter((s: any) => s !== finePrintSlice);
      console.log(`[process-footer] Removed fine_print from image slices. Remaining: ${imageSlices.length}`);
    } else {
      // NO fine_print slice found - keep ALL slices, append legal section at end
      console.log('[process-footer] No fine_print slice found - keeping ALL slices, will append legal section at end');
      imageSlices = sliceResult.slices;
      
      // Create legal section to append AFTER all image slices
      // Default to WHITE background with DARK text (most common for footers without fine print)
      legalSection = {
        yStart: sliceResult.imageHeight, // Appends at the very end
        backgroundColor: '#ffffff',
        textColor: '#1a1a1a',
        detectedElements: []
      };
    }
    
    await updateJob(supabase, jobId, { processing_percent: 50 });

    // === STEP 4: Generate crop URLs (60%) ===
    await updateJob(supabase, jobId, {
      processing_step: 'generating_crop_urls',
      processing_percent: 55
    });

    // NO filtering here - we already filtered above by removing fine_print only
    let processedSlices = generateSliceCropUrls(
      imageSlices,
      job.image_url,
      job.image_width || 600,
      job.image_height || 800,
      sliceResult.analyzedWidth,
      sliceResult.analyzedHeight
    );

    await updateJob(supabase, jobId, { processing_percent: 60 });

    // === STEP 5: Analyze slices for links and alt-text (like campaigns) ===
    await updateJob(supabase, jobId, {
      processing_step: 'analyzing_slices',
      processing_percent: 65
    });

    const analyzeUrl = Deno.env.get('SUPABASE_URL') + '/functions/v1/analyze-slices';
    const resizedImageUrl = getResizedCloudinaryUrl(job.image_url, 600, 7900);

    const sliceInputs = processedSlices.map((slice: any, index: number) => ({
      imageUrl: slice.imageUrl,
      index,
      column: slice.column,
      totalColumns: slice.totalColumns,
      rowIndex: slice.rowIndex
    }));

    try {
      console.log(`[process-footer] Calling analyze-slices with ${sliceInputs.length} slices, brandId: ${job.brand_id}`);
      
      const analyzeResponse = await fetch(analyzeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
        },
        body: JSON.stringify({
          slices: sliceInputs,
          brandDomain: brandDomain, // Pass the actual brand domain
          brandId: job.brand_id,
          fullCampaignImage: resizedImageUrl
        })
      });

      if (analyzeResponse.ok) {
        const { analyses } = await analyzeResponse.json();
        console.log(`[process-footer] Received ${analyses?.length || 0} slice analyses`);
        
        // Merge analysis back into slices
        const analysisByIndex = new Map((analyses || []).map((a: any) => [a.index, a]));
        processedSlices = processedSlices.map((slice: any, i: number) => {
          const analysis = analysisByIndex.get(i) as { altText?: string; suggestedLink?: string; isClickable?: boolean; linkVerified?: boolean } | undefined;
          if (analysis) {
            return {
              ...slice,
              altText: analysis.altText || slice.altText || `Footer section ${i + 1}`,
              link: analysis.suggestedLink || slice.link || null,
              isClickable: analysis.isClickable ?? slice.isClickable ?? true,
              linkVerified: analysis.linkVerified || false
            };
          }
          return slice;
        });
        console.log(`[process-footer] Analyzed ${analyses?.length || 0} slices for links/alt-text`);
      } else {
        console.error('[process-footer] analyze-slices failed:', await analyzeResponse.text());
      }
    } catch (err) {
      console.error('[process-footer] Failed to call analyze-slices:', err);
    }

    await updateJob(supabase, jobId, { processing_percent: 85 });

    // === STEP 5.5: Prefill social icon links from brand's saved social_links ===
    if (job.brand_id) {
      try {
        const { data: brandData } = await supabase
          .from('brands')
          .select('social_links')
          .eq('id', job.brand_id)
          .single();

        const socialLinks = (brandData?.social_links as any[]) || [];
        const socialPlatformUrls = new Map<string, string>();
        
        for (const social of socialLinks) {
          if (social.platform && social.url) {
            socialPlatformUrls.set(social.platform.toLowerCase(), social.url);
          }
        }

        if (socialPlatformUrls.size > 0) {
          console.log(`[process-footer] Found ${socialPlatformUrls.size} saved social links for brand`);
          
          // Match social icon slices to platform URLs
          for (const slice of processedSlices) {
            if (slice.name?.toLowerCase().includes('social')) {
              // Try to match by alt text
              const altLower = (slice.altText || '').toLowerCase();
              for (const [platform, url] of socialPlatformUrls) {
                if (altLower.includes(platform) && !slice.link) {
                  slice.link = url;
                  slice.linkSource = 'social_profile';
                  console.log(`[process-footer] Prefilled ${platform} link: ${url}`);
                  break;
                }
              }
            }
          }
        }
      } catch (err) {
        console.error('[process-footer] Failed to fetch social links:', err);
      }
    }
    
    await updateJob(supabase, jobId, {
      processing_step: 'finalizing',
      processing_percent: 90
    });

    // === STEP 6: Complete - save results ===
    const processingTimeMs = Date.now() - startTime;
    console.log(`[process-footer] Processing complete in ${processingTimeMs}ms with ${processedSlices.length} slices`);

    await updateJob(supabase, jobId, {
      status: 'pending_review',
      processing_step: 'complete',
      processing_percent: 100,
      processing_completed_at: new Date().toISOString(),
      slices: processedSlices,
      legal_section: legalSection,
      legal_cutoff_y: legalSection?.yStart || null
    });

    return new Response(
      JSON.stringify({
        success: true,
        slices: processedSlices,
        legalSection,
        processingTimeMs
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err: unknown) {
    console.error('[process-footer] Unexpected error:', err);
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
