import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageDataUrl, width, height, isFirstCampaign } = await req.json();
    
    if (!imageDataUrl) {
      throw new Error('No image data provided');
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    console.log(`Analyzing image: ${width}x${height}, isFirstCampaign: ${isFirstCampaign}`);

const systemPrompt = `You are an expert email template analyst. Your job is to:
1. Segment an email design into HORIZONTAL FULL-WIDTH SECTIONS for HTML email production
2. IDENTIFY THE BRAND from the email (website URL and brand name)

## BRAND DETECTION (CRITICAL):
- Look for the brand's website URL in the footer, header, or any visible links
- Look for the company/brand name (usually in header logo area or footer)
- Extract the PRIMARY domain (e.g., "flightsmedia.co" not "instagram.com/flightsmedia")
- If you see social media links, those are NOT the brand URL - look for the actual website

## BLOCK DETECTION RULES:

### Block Types (ONLY TWO TYPES):

**CRITICAL: BE VERY CONSERVATIVE! When in doubt, use "image" - image slices are reliable and safe.**

1. **"image"** (will be shown in RED) - Use for:
   - Sections with PHOTOGRAPHY or complex graphics
   - Sections with TEXT OVERLAID on images/photos
   - ANY section with decorative elements (lines, borders, shapes, icons)
   - Hero banners with background images
   - Product photos
   - Complex illustrated graphics
   - Logo areas (headers, footers)
   - Sections with custom fonts or stylized typography
   - Sections with gradients or textures
   - Sections with visual timelines, progress indicators, or step graphics
   - Sections with numbered steps that have visual design elements
   - ANY section that is NOT a plain solid-color background with basic text
   
2. **"code"** (will be shown in BLUE) - Use ONLY for:
   - Sections with PLAIN SOLID COLOR backgrounds (no gradients, no decorations)
   - Simple text paragraphs with NO decorative elements
   - Simple buttons on solid backgrounds with NO icons
   - Plain text navigation links
   - Plain copyright text
   - ONLY use this if you are 100% certain it can be recreated with basic HTML tables and inline CSS

### Section Detection Rules:
- ALWAYS detect FULL-WIDTH HORIZONTAL sections spanning the entire email width
- NEVER detect individual text elements, buttons, or small components within a section
- If a section has a photo/image background with text on top, it's ONE "image" block
- Sections should NOT overlap
- Sort blocks from TOP to BOTTOM by Y position
- Each block's width should be approximately the full image width (${width}px)

### Footer Detection:
${isFirstCampaign ? `- IMPORTANT: This is the FIRST campaign for this brand. Identify the FOOTER section(s) and mark them with "isFooter": true
- Footer typically includes: brand logo, navigation links, social media icons, copyright text
- The footer usually starts after the main content and extends to the bottom` : '- Footer detection not needed for this analysis'}

## Output Format:
Return ONLY valid JSON with this structure:
{
  "detectedBrand": {
    "url": "example.com",
    "name": "Example Company"
  },
  "blocks": [
    {
      "id": "header-logo",
      "name": "Header Logo",
      "type": "image",
      "bounds": { "x": 0, "y": 0, "width": ${width}, "height": 100 },
      "suggestedLink": "https://brand.com",
      "altText": "Brand logo",
      "isFooter": false
    }
  ]
}

IMPORTANT: Return ONLY the JSON object. No markdown, no explanations, no code blocks.`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Analyze this email design (${width}x${height} pixels). 

FIRST: Identify the BRAND - look for the website URL and company name in the email (footer, header, links).

THEN: Identify FULL-WIDTH HORIZONTAL SECTIONS only.

Remember:
- RED (image) = photos, graphics, text-over-images
- BLUE (code) = solid color backgrounds, simple text/buttons

Return both the detected brand info AND blocks as JSON.`,
              },
              {
                type: 'image_url',
                image_url: { url: imageDataUrl },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'API credits exhausted. Please add credits to continue.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`AI analysis failed: ${response.status}`);
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content;
    
    if (!content) {
      throw new Error('No response from AI');
    }

    console.log('AI response:', content);

    // Parse JSON from response (handle markdown code blocks if present)
    let jsonStr = content.trim();
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    const parsed = JSON.parse(jsonStr);
    
    // Extract detected brand info
    const detectedBrand = parsed.detectedBrand || null;
    if (detectedBrand) {
      console.log(`Detected brand: ${detectedBrand.name} (${detectedBrand.url})`);
    }

    // Validate and normalize blocks
    const blocks = (parsed.blocks || [])
      .map((block: any, index: number) => ({
        id: block.id || `block-${index}`,
        name: block.name || `Block ${index + 1}`,
        type: block.type === 'image' ? 'image' : 'code',
        bounds: {
          x: Math.max(0, Math.round(block.bounds?.x || 0)),
          y: Math.max(0, Math.round(block.bounds?.y || 0)),
          width: Math.min(width, Math.round(block.bounds?.width || width)),
          height: Math.max(20, Math.round(block.bounds?.height || 50)),
        },
        suggestedLink: block.suggestedLink || '',
        altText: block.altText || '',
        isFooter: Boolean(block.isFooter),
      }))
      // Sort by Y position (top to bottom)
      .sort((a: any, b: any) => a.bounds.y - b.bounds.y);

    // Identify footer blocks (all blocks marked as footer, or last few blocks if none marked)
    const footerBlocks = blocks.filter((b: any) => b.isFooter);
    
    const result = {
      blocks,
      originalWidth: width,
      originalHeight: height,
      hasFooter: footerBlocks.length > 0,
      footerStartIndex: footerBlocks.length > 0 
        ? blocks.findIndex((b: any) => b.isFooter) 
        : -1,
      detectedBrand,
    };

    console.log(`Successfully analyzed design: ${blocks.length} blocks found, ${footerBlocks.length} footer blocks`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in analyze-email-design:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
