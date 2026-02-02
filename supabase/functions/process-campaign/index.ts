import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// Processing constants
const ANALYSIS_MAX_WIDTH = 600;
const ANALYSIS_MAX_HEIGHT = 7900;

// Module types for training database
const MODULE_TYPES = [
  'announcement_bar',
  'logo_header', 
  'hero',
  'product_card',
  'benefits_list',
  'free_gifts_module',
  'value_props_strip',
  'timeline_journey',
  'feature_diagram',
  'educational_block',
  'lifestyle_block',
  'mid_email_cta_banner',
  'footer'
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let campaignId: string | undefined;

  try {
    const body = await req.json();
    campaignId = body.campaignId;
    
    if (!campaignId) throw new Error('campaignId is required');
    
    const { data: campaign, error: fetchError } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();
    
    if (fetchError || !campaign) throw new Error('Campaign not found');
    
    console.log(`\n========== PROCESSING: ${campaign.name} ==========`);
    
    // ========================================================================
    // STEP 1: UPLOAD TO CLOUDINARY
    // ========================================================================
    await updateStatus(campaignId, 'processing', 'Uploading to Cloudinary...', 5);
    
    const imageUrl = campaign.raw_image_url || campaign.original_image_url;
    if (!imageUrl) throw new Error('No image URL found for campaign');
    
    const cloudinaryResult = await uploadToCloudinary(imageUrl, campaign.brand_id, campaignId);
    
    const { 
      publicId, 
      secureUrl, 
      originalWidth, 
      originalHeight 
    } = cloudinaryResult;
    
    console.log(`Cloudinary: ${originalWidth}×${originalHeight}, publicId: ${publicId}`);
    
    // Update campaign with cloudinary info
    await supabase
      .from('campaigns')
      .update({ 
        cloudinary_public_id: publicId,
        original_image_url: secureUrl
      })
      .eq('id', campaignId);
    
    // Calculate analysis dimensions (resize for Claude if needed)
    const { analysisWidth, analysisHeight, scaleFactor } = calculateAnalysisDimensions(
      originalWidth, 
      originalHeight,
      ANALYSIS_MAX_WIDTH,
      ANALYSIS_MAX_HEIGHT
    );
    
    console.log(`Analysis: ${analysisWidth}×${analysisHeight}, scaleFactor: ${scaleFactor}`);
    
    // Get resized image URL for Vision/Claude (Cloudinary handles resize)
    const analysisImageUrl = buildCloudinaryUrl(publicId, {
      width: analysisWidth,
      crop: 'scale'
    });
    
    // ========================================================================
    // STEP 2: GOOGLE VISION (3 parallel calls)
    // ========================================================================
    await updateStatus(campaignId, 'vision_processing', 'Running Google Vision...', 15);
    
    // Fetch the analysis-sized image
    const imageResponse = await fetch(analysisImageUrl);
    const imageBuffer = await imageResponse.arrayBuffer();
    const imageBase64 = arrayBufferToBase64(imageBuffer);
    
    console.log('Running Google Vision (3 parallel calls)...');
    
    // Run all 3 Vision calls in parallel
    const [ocrResult, objectsResult, logosResult] = await Promise.all([
      callVisionAPI(imageBase64, 'DOCUMENT_TEXT_DETECTION'),
      callVisionAPI(imageBase64, 'OBJECT_LOCALIZATION', 50),
      callVisionAPI(imageBase64, 'LOGO_DETECTION', 10),
    ]);
    
    const visionData = {
      paragraphs: parseOcrParagraphs(ocrResult),
      objects: parseObjects(objectsResult, analysisHeight),
      logos: parseLogos(logosResult)
    };
    
    console.log(`Vision: ${visionData.paragraphs.length} paragraphs, ${visionData.objects.length} objects, ${visionData.logos.length} logos`);
    
    await supabase
      .from('campaigns')
      .update({ 
        vision_data: visionData,
        processing_percent: 30 
      })
      .eq('id', campaignId);
    
    // ========================================================================
    // STEP 3: AI MODULE SLICING
    // ========================================================================
    await updateStatus(campaignId, 'slicing', 'AI detecting modules...', 35);
    
    console.log('Calling Claude for module detection...');
    
    const moduleBoundaries = await detectModuleBoundaries(
      imageBase64,
      visionData,
      analysisWidth,
      analysisHeight
    );
    
    console.log(`Claude identified ${moduleBoundaries.length} modules`);
    
    // Validate and fix boundaries
    const validatedBoundaries = validateBoundaries(moduleBoundaries, analysisHeight);
    
    await supabase
      .from('campaigns')
      .update({ 
        module_boundaries: validatedBoundaries,
        processing_percent: 50 
      })
      .eq('id', campaignId);
    
    // ========================================================================
    // STEP 4: GENERATE CLOUDINARY CROP URLs (NO ACTUAL CROPPING!)
    // ========================================================================
    await updateStatus(campaignId, 'analyzing', 'Generating module images...', 55);
    
    console.log('Generating Cloudinary crop URLs...');
    
    const moduleIds = await createModulesWithCropUrls(
      campaign,
      validatedBoundaries,
      publicId,
      scaleFactor,
      originalWidth,
      originalHeight
    );
    
    console.log(`Created ${moduleIds.length} modules`);
    
    // ========================================================================
    // STEP 5: DEEP MODULE ANALYSIS
    // ========================================================================
    for (let i = 0; i < moduleIds.length; i++) {
      const progress = 60 + Math.round((i / moduleIds.length) * 35);
      await updateStatus(campaignId, 'analyzing', `Analyzing module ${i + 1}/${moduleIds.length}...`, progress);
      
      await analyzeModuleDeep(moduleIds[i]);
    }
    
    // ========================================================================
    // STEP 6: FINALIZE
    // ========================================================================
    await updateStatus(campaignId, 'analyzing', 'Finalizing...', 98);
    
    const campaignAnalysis = {
      campaign_type: detectCampaignType(visionData),
      structure_pattern: validatedBoundaries.map((m: any) => m.module_type),
      module_count: validatedBoundaries.length
    };
    
    // Generate embedding
    const embeddingText = [campaign.name, campaignAnalysis.campaign_type, ...campaignAnalysis.structure_pattern].join(' ');
    const embedding = await generateEmbedding(embeddingText);
    
    await supabase
      .from('campaigns')
      .update({
        status: 'complete',
        processing_step: 'Done',
        processing_percent: 100,
        campaign_analysis: campaignAnalysis,
        processed_at: new Date().toISOString()
      })
      .eq('id', campaignId);
    
    await updateBrandStats(campaign.brand_id);
    await checkBrandProfileTrigger(campaign.brand_id);
    
    console.log(`\n========== COMPLETE ==========\n`);
    
    return new Response(JSON.stringify({ success: true, moduleCount: moduleIds.length }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
    
  } catch (error) {
    console.error('process-campaign error:', error);
    
    if (campaignId) {
      await supabase
        .from('campaigns')
        .update({ 
          status: 'failed', 
          error_message: error instanceof Error ? error.message : 'Unknown error' 
        })
        .eq('id', campaignId);
    }
    
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});

// ============================================================================
// CLOUDINARY FUNCTIONS
// ============================================================================

async function uploadToCloudinary(imageUrl: string, brandId: string, campaignId: string) {
  const cloudName = Deno.env.get('CLOUDINARY_CLOUD_NAME');
  const apiKey = Deno.env.get('CLOUDINARY_API_KEY');
  const apiSecret = Deno.env.get('CLOUDINARY_API_SECRET');
  
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('Cloudinary credentials not configured');
  }
  
  const timestamp = Math.floor(Date.now() / 1000);
  const publicId = `emailforge/${brandId}/${campaignId}`;
  
  // Create signature
  const signatureString = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(signatureString);
  const hashBuffer = await crypto.subtle.digest('SHA-1', data);
  const signature = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  const formData = new FormData();
  formData.append('file', imageUrl);
  formData.append('public_id', publicId);
  formData.append('timestamp', timestamp.toString());
  formData.append('api_key', apiKey);
  formData.append('signature', signature);
  
  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: 'POST',
    body: formData
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Cloudinary upload failed: ${error}`);
  }
  
  const result = await response.json();
  
  return {
    publicId: result.public_id,
    secureUrl: result.secure_url,
    originalWidth: result.width,
    originalHeight: result.height
  };
}

function buildCloudinaryUrl(publicId: string, transforms: Record<string, any>): string {
  const cloudName = Deno.env.get('CLOUDINARY_CLOUD_NAME');
  
  const transformParts: string[] = [];
  
  if (transforms.crop) transformParts.push(`c_${transforms.crop}`);
  if (transforms.width) transformParts.push(`w_${transforms.width}`);
  if (transforms.height) transformParts.push(`h_${transforms.height}`);
  if (transforms.x !== undefined) transformParts.push(`x_${transforms.x}`);
  if (transforms.y !== undefined) transformParts.push(`y_${transforms.y}`);
  if (transforms.quality) transformParts.push(`q_${transforms.quality}`);
  if (transforms.format) transformParts.push(`f_${transforms.format}`);
  
  const transformString = transformParts.join(',');
  
  return `https://res.cloudinary.com/${cloudName}/image/upload/${transformString}/${publicId}`;
}

function calculateAnalysisDimensions(
  originalWidth: number, 
  originalHeight: number,
  maxWidth: number,
  maxHeight: number
): { analysisWidth: number; analysisHeight: number; scaleFactor: number } {
  
  // If image fits within limits, use original
  if (originalWidth <= maxWidth && originalHeight <= maxHeight) {
    return { 
      analysisWidth: originalWidth, 
      analysisHeight: originalHeight, 
      scaleFactor: 1 
    };
  }
  
  // Scale to fit within limits while maintaining aspect ratio
  const widthRatio = maxWidth / originalWidth;
  const heightRatio = maxHeight / originalHeight;
  const ratio = Math.min(widthRatio, heightRatio);
  
  const analysisWidth = Math.round(originalWidth * ratio);
  const analysisHeight = Math.round(originalHeight * ratio);
  const scaleFactor = originalWidth / analysisWidth;
  
  return { analysisWidth, analysisHeight, scaleFactor };
}

// ============================================================================
// GOOGLE VISION FUNCTIONS
// ============================================================================

async function callVisionAPI(imageBase64: string, featureType: string, maxResults?: number) {
  const apiKey = Deno.env.get('GOOGLE_CLOUD_VISION_API_KEY');
  if (!apiKey) throw new Error('GOOGLE_CLOUD_VISION_API_KEY not configured');
  
  const feature: any = { type: featureType };
  if (maxResults) feature.maxResults = maxResults;
  
  const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [{ image: { content: imageBase64 }, features: [feature] }]
    })
  });
  
  if (!response.ok) {
    throw new Error(`Vision API error: ${response.status}`);
  }
  
  return response.json();
}

function parseOcrParagraphs(result: any): any[] {
  const annotation = result.responses?.[0]?.fullTextAnnotation;
  if (!annotation) return [];
  
  const paragraphs: any[] = [];
  
  for (const page of annotation.pages || []) {
    for (const block of page.blocks || []) {
      for (const para of block.paragraphs || []) {
        const vertices = para.boundingBox?.vertices || [];
        if (vertices.length < 4) continue;
        
        let text = '';
        for (const word of para.words || []) {
          for (const symbol of word.symbols || []) {
            text += symbol.text || '';
          }
          text += ' ';
        }
        
        paragraphs.push({
          text: text.trim(),
          yTop: Math.min(...vertices.map((v: any) => v.y || 0)),
          yBottom: Math.max(...vertices.map((v: any) => v.y || 0)),
          xLeft: Math.min(...vertices.map((v: any) => v.x || 0)),
          xRight: Math.max(...vertices.map((v: any) => v.x || 0)),
        });
      }
    }
  }
  
  return paragraphs.sort((a, b) => a.yTop - b.yTop);
}

function parseObjects(result: any, imageHeight: number): any[] {
  const objects = result.responses?.[0]?.localizedObjectAnnotations || [];
  
  return objects.map((obj: any) => {
    const vertices = obj.boundingPoly?.normalizedVertices || [];
    return {
      name: obj.name,
      score: obj.score,
      // Convert normalized (0-1) to pixel coordinates
      yTop: Math.round(Math.min(...vertices.map((v: any) => v.y || 0)) * imageHeight),
      yBottom: Math.round(Math.max(...vertices.map((v: any) => v.y || 0)) * imageHeight),
    };
  });
}

function parseLogos(result: any): any[] {
  const logos = result.responses?.[0]?.logoAnnotations || [];
  
  return logos.map((logo: any) => {
    const vertices = logo.boundingPoly?.vertices || [];
    return {
      description: logo.description,
      score: logo.score,
      yTop: vertices.length ? Math.min(...vertices.map((v: any) => v.y || 0)) : 0,
      yBottom: vertices.length ? Math.max(...vertices.map((v: any) => v.y || 0)) : 0,
    };
  });
}

// ============================================================================
// AI MODULE SLICING - THE CRITICAL PROMPT
// ============================================================================

async function detectModuleBoundaries(
  imageBase64: string, 
  visionData: any, 
  width: number, 
  height: number
) {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');
  
  // Format vision data for Claude (include coordinates!)
  const textBlocks = visionData.paragraphs
    .map((p: any) => `[y:${p.yTop}-${p.yBottom}] "${p.text.substring(0, 100)}"`)
    .join('\n');
  
  const objectBlocks = visionData.objects
    .map((o: any) => `[y:${o.yTop}-${o.yBottom}] ${o.name} (${Math.round(o.score * 100)}%)`)
    .join('\n');
  
  const logoBlocks = visionData.logos
    .map((l: any) => `[y:${l.yTop}-${l.yBottom}] Logo: ${l.description}`)
    .join('\n');

  const prompt = `You are analyzing an email design to slice it into DESIGN MODULES for a training database.

## CRITICAL CONTEXT

We are building an AI system that learns brand design patterns. We need to identify COMPLETE DESIGN MODULES - not individual clickable elements.

A hero section (logo + headline + CTA + image) = ONE MODULE
Keep cohesive design units together.

## Image Dimensions
${width}px wide × ${height}px tall

## Detected Text Blocks (with Y coordinates in pixels)
${textBlocks || 'None detected'}

## Detected Objects
${objectBlocks || 'None detected'}

## Detected Logos
${logoBlocks || 'None detected'}

---

## MODULE TYPES (use these exact names)

- announcement_bar — Colored strip at top with promo/urgency text
- logo_header — Brand logo, sometimes with preheader text  
- hero — Big headline + subhead + CTA + hero image (lifestyle or product)
- product_card — Image + product name + details + CTA, possibly with badge
- benefits_list — Bullet points explaining product value or problem/solution
- free_gifts_module — Multi-column layout showing GWP offers
- value_props_strip — Horizontal list of offer benefits with icons
- timeline_journey — Progressive results (first use → 1 week → 1 month)
- feature_diagram — Product image with callouts pointing to specs
- educational_block — Problem agitation + solution positioning (text-heavy)
- lifestyle_block — Emotional copy about hosting, gifting, impressing guests
- mid_email_cta_banner — Colored strip with secondary CTA
- footer — Logo + social icons + address + unsubscribe

---

## SLICING RULES (CRITICAL - FOLLOW EXACTLY)

### RULE 1: PADDING FROM CONTENT
**NEVER slice right at the edge of text or elements.**
- Leave at least 30-50px MINIMUM padding from any text block
- Look at the yTop and yBottom values in the text blocks above
- Cut in the CENTER of gaps between sections, not at edges
- If there's a background color change, slice in the MIDDLE of the transition

### RULE 2: KEEP COHESIVE SECTIONS TOGETHER
- Hero = logo + headline + subhead + CTA + image = ONE module
- Don't split a headline from its accompanying image or CTA
- Product sections include their badges, prices, and buttons

### RULE 3: USE THE VISION DATA
- The text coordinates tell you exactly where content is
- Find gaps where there's NO text for 50+ pixels
- Those gaps are your slice points

### RULE 4: BOUNDARIES
- First module MUST start at y_start: 0
- Last module MUST end at y_end: ${height}
- No gaps between modules
- Minimum module height: 80px

---

## EXAMPLE OF CORRECT SLICING

Given text blocks at:
- y:0-40 "FREE SHIPPING"
- y:80-180 "Upgrade the everyday" (headline)
- y:200-240 "Start the year with cleaner water" 
- y:260-300 "Shop up to 40% off"
- y:500-800 (big image area - no text)
- y:850-900 "WHY ESKIIN?"
- y:920-980 "Benefit 1..."
- y:1000-1500 (footer area)

Correct slices:
1. announcement_bar: y_start=0, y_end=60 (gap at ~60)
2. hero: y_start=60, y_end=820 (includes headline through image, gap at ~820)
3. benefits_list: y_start=820, y_end=980 (benefits section)
4. footer: y_start=980, y_end=1500

---

## OUTPUT FORMAT

Return ONLY valid JSON, no markdown:

{
  "modules": [
    {
      "y_start": 0,
      "y_end": 60,
      "module_type": "announcement_bar",
      "confidence": 0.95
    },
    {
      "y_start": 60,
      "y_end": 820,
      "module_type": "hero", 
      "confidence": 0.92
    }
  ]
}

CRITICAL: y_end of each module MUST equal y_start of the next module. No gaps!`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: imageBase64 } },
          { type: 'text', text: prompt }
        ]
      }]
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API error: ${response.status} - ${errorText}`);
  }
  
  const result = await response.json();
  const content = result.content?.[0]?.text || '';
  
  // Parse JSON
  let jsonStr = content;
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonStr = jsonMatch[1];
  
  const parsed = JSON.parse(jsonStr.trim());
  return parsed.modules || [];
}

// ============================================================================
// BOUNDARY VALIDATION
// ============================================================================

function validateBoundaries(boundaries: any[], imageHeight: number): any[] {
  if (!boundaries || boundaries.length === 0) {
    throw new Error('No module boundaries detected');
  }
  
  // Sort by y_start
  const sorted = [...boundaries].sort((a, b) => a.y_start - b.y_start);
  
  // Fix first module
  if (sorted[0].y_start !== 0) {
    sorted[0].y_start = 0;
  }
  
  // Fix last module
  if (sorted[sorted.length - 1].y_end !== imageHeight) {
    sorted[sorted.length - 1].y_end = imageHeight;
  }
  
  // Fix gaps between modules
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].y_start !== sorted[i - 1].y_end) {
      sorted[i].y_start = sorted[i - 1].y_end;
    }
  }
  
  // Filter out too-small modules
  return sorted.filter(m => (m.y_end - m.y_start) >= 50);
}

// ============================================================================
// CREATE MODULES WITH CLOUDINARY CROP URLs
// ============================================================================

async function createModulesWithCropUrls(
  campaign: any,
  boundaries: any[],
  cloudinaryPublicId: string,
  scaleFactor: number,
  originalWidth: number,
  originalHeight: number
) {
  const moduleIds: string[] = [];
  
  for (let i = 0; i < boundaries.length; i++) {
    const boundary = boundaries[i];
    
    // CRITICAL: Scale coordinates from analysis space to original image space
    const yTopOriginal = Math.round(boundary.y_start * scaleFactor);
    const yBottomOriginal = Math.round(boundary.y_end * scaleFactor);
    const heightOriginal = yBottomOriginal - yTopOriginal;
    
    // Skip invalid
    if (heightOriginal < 50) continue;
    
    // Generate Cloudinary crop URL - NO ACTUAL CROPPING HAPPENS HERE
    const moduleImageUrl = buildCloudinaryUrl(cloudinaryPublicId, {
      crop: 'crop',
      x: 0,
      y: yTopOriginal,
      width: originalWidth,
      height: heightOriginal,
      quality: 90,
      format: 'jpg'
    });
    
    // Thumbnail is same URL with width constraint added
    const thumbnailUrl = buildCloudinaryUrl(cloudinaryPublicId, {
      crop: 'crop',
      x: 0,
      y: yTopOriginal,
      width: originalWidth,
      height: heightOriginal,
    }) + ',w_300';
    
    const moduleId = crypto.randomUUID();
    
    await supabase.from('modules').insert({
      id: moduleId,
      campaign_id: campaign.id,
      brand_id: campaign.brand_id,
      module_index: i,
      module_type: boundary.module_type,
      module_type_confidence: boundary.confidence || 0.8,
      image_url: moduleImageUrl,
      thumbnail_url: thumbnailUrl,
      y_start: yTopOriginal,
      y_end: yBottomOriginal,
      width: originalWidth,
      height: heightOriginal
    });
    
    moduleIds.push(moduleId);
    
    console.log(`  Module ${i}: ${boundary.module_type} (y: ${yTopOriginal}-${yBottomOriginal})`);
  }
  
  return moduleIds;
}

// ============================================================================
// DEEP MODULE ANALYSIS
// ============================================================================

async function analyzeModuleDeep(moduleId: string) {
  const { data: module } = await supabase
    .from('modules')
    .select('*')
    .eq('id', moduleId)
    .single();
  
  if (!module) return;
  
  // Fetch module image
  const imageResponse = await fetch(module.image_url);
  const imageBuffer = await imageResponse.arrayBuffer();
  const imageBase64 = arrayBufferToBase64(imageBuffer);

  const prompt = `Analyze this email module in detail for AI training.

## Module Type: ${module.module_type}
## Dimensions: ${module.width}px × ${module.height}px

Extract all information in this JSON structure:

{
  "content": {
    "headline": "EXACT headline text or null",
    "subheadline": "EXACT subheadline or null", 
    "body_copy": "Body text or null",
    "bullet_points": ["point 1", "point 2"],
    "cta_text": "Button text or null",
    "offer_text": "Discount/promo text or null",
    "product_names": ["product 1"],
    "has_logo": true,
    "logo_position": "top_center"
  },
  "visuals": {
    "background_color": "#FFFFFF",
    "background_type": "solid",
    "text_color_primary": "#1A1A1A",
    "text_color_secondary": "#666666",
    "accent_color": "#C8FF00",
    "has_image": true,
    "image_type": "lifestyle or product",
    "image_position": "bottom",
    "image_coverage_percent": 60,
    "cta_style": {
      "shape": "pill or rectangle",
      "fill_color": "#C8FF00",
      "text_color": "#000000"
    }
  },
  "layout": {
    "alignment": "center or left",
    "content_width_percent": 85,
    "element_order": ["logo", "headline", "cta", "image"]
  },
  "composition_notes": "3-5 sentences describing EXACTLY how to recreate this module. Include specific details about positioning, typography feel, color usage, image style, and overall aesthetic.",
  "quality_score": 0.9,
  "is_reference_quality": true
}

IMPORTANT:
- Copy text EXACTLY as shown
- Sample actual colors from the image
- Be SPECIFIC in composition_notes`;

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey!,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
          { type: 'text', text: prompt }
        ]
      }]
    })
  });
  
  if (!response.ok) {
    console.error(`Deep analysis failed for module ${moduleId}: ${response.status}`);
    return;
  }
  
  const result = await response.json();
  const content = result.content?.[0]?.text || '';
  
  let jsonStr = content;
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonStr = jsonMatch[1];
  
  let analysis;
  try {
    analysis = JSON.parse(jsonStr.trim());
  } catch {
    console.error(`Failed to parse analysis for module ${moduleId}`);
    analysis = { content: {}, visuals: {}, layout: {}, composition_notes: '', quality_score: 0.5 };
  }
  
  // Generate embedding
  const embeddingText = [
    module.module_type,
    analysis.content?.headline,
    analysis.content?.subheadline,
    analysis.composition_notes
  ].filter(Boolean).join(' ');
  
  const embedding = await generateEmbedding(embeddingText);
  
  await supabase
    .from('modules')
    .update({
      content: analysis.content || {},
      visuals: analysis.visuals || {},
      layout: analysis.layout || {},
      composition_notes: analysis.composition_notes || '',
      quality_score: analysis.quality_score || 0,
      is_reference_quality: analysis.is_reference_quality || false,
      embedding
    })
    .eq('id', moduleId);
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 32768;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return btoa(binary);
}

async function updateStatus(campaignId: string, status: string, step: string, percent: number) {
  await supabase
    .from('campaigns')
    .update({ status, processing_step: step, processing_percent: percent })
    .eq('id', campaignId);
}

function detectCampaignType(visionData: any): string {
  const text = visionData.paragraphs?.map((p: any) => p.text.toLowerCase()).join(' ') || '';
  
  if (text.includes('% off') || text.includes('sale')) return 'sale_promotion';
  if (text.includes('new') || text.includes('introducing')) return 'product_launch';
  if (text.includes('gift') || text.includes('holiday')) return 'holiday_gift';
  return 'brand_general';
}

async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');
  
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: text.substring(0, 8000) })
  });
  
  const data = await response.json();
  return data.data[0].embedding;
}

async function updateBrandStats(brandId: string) {
  const { count: moduleCount } = await supabase
    .from('modules')
    .select('id', { count: 'exact', head: true })
    .eq('brand_id', brandId);
  
  const { count: campaignCount } = await supabase
    .from('campaigns')
    .select('id', { count: 'exact', head: true })
    .eq('brand_id', brandId)
    .eq('status', 'complete');
  
  await supabase
    .from('brands')
    .update({ total_modules: moduleCount || 0, total_campaigns: campaignCount || 0 })
    .eq('id', brandId);
}

async function checkBrandProfileTrigger(brandId: string) {
  const { count } = await supabase
    .from('modules')
    .select('id', { count: 'exact', head: true })
    .eq('brand_id', brandId)
    .eq('is_reference_quality', true);
  
  if ((count || 0) >= 5) {
    const { data: profile } = await supabase
      .from('brand_profiles')
      .select('last_analyzed_at')
      .eq('brand_id', brandId)
      .single();
    
    if (!profile || !profile.last_analyzed_at) {
      await supabase.from('processing_jobs').insert({
        job_type: 'generate_brand_profile',
        brand_id: brandId,
        priority: 0
      });
    }
  }
}
