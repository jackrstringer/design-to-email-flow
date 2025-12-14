import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageDataUrl, width, height, isFirstCampaign } = await req.json();
    
    if (!imageDataUrl) {
      throw new Error('No image data provided');
    }

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is not configured');
    }

    console.log(`Analyzing image: ${width}×${height}, isFirstCampaign: ${isFirstCampaign}`);

    // Extract base64 and media type from data URL
    const dataUrlMatch = imageDataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!dataUrlMatch) {
      throw new Error('Invalid image data URL format');
    }
    const mediaType = dataUrlMatch[1];
    const base64Data = dataUrlMatch[2];

    const systemPrompt = `You are an expert email template analyst with PRECISE pixel-level accuracy.

## IMAGE DIMENSIONS
The image is EXACTLY ${width} pixels wide and ${height} pixels tall.
Coordinate system: (0,0) is TOP-LEFT. X increases RIGHT. Y increases DOWN.

## YOUR TASK
Identify all distinct HORIZONTAL FULL-WIDTH SECTIONS from TOP to BOTTOM.

## CRITICAL REQUIREMENTS - READ CAREFULLY
1. FIRST block MUST start at y=0
2. LAST block MUST end at y=${height}
3. Blocks must NOT overlap and must be CONTIGUOUS (no gaps)
4. Each block spans full width: x=0, width=${width}
5. Measure PRECISELY where visual content changes - look at actual pixel boundaries

## BLOCK TYPE RULES
- "image": Photos, graphics, text overlaid on images, logos, icons, complex visual elements, gradients
- "code": ONLY plain solid color backgrounds with simple text/buttons that can be recreated in HTML

BE CONSERVATIVE: When in doubt, use "image". It's safer for email rendering.

## BRAND DETECTION
Look for brand's website URL and company name (usually in header or footer).

## FOOTER DETECTION
${isFirstCampaign ? `Mark footer sections with "isFooter": true. Footer typically includes logo, nav links, social icons, legal text.` : 'Footer detection not needed.'}

## OUTPUT FORMAT
Return ONLY valid JSON (no markdown, no explanation):
{
  "detectedBrand": { "url": "example.com", "name": "Example Company" },
  "blocks": [
    {
      "id": "unique_id",
      "name": "Descriptive Name",
      "type": "image",
      "bounds": { "x": 0, "y": 0, "width": ${width}, "height": 100 },
      "suggestedLink": "",
      "altText": "",
      "isFooter": false
    }
  ]
}

VALIDATION: Sum of all block heights MUST equal ${height}. Count pixels carefully.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType,
                  data: base64Data,
                },
              },
              {
                type: 'text',
                text: `Analyze this ${width}×${height} pixel email design. Identify ALL sections from y=0 to y=${height}. Be PRECISE with pixel measurements. Return JSON only.`,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Claude API error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 401) {
        return new Response(
          JSON.stringify({ error: 'Invalid API key.' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`Claude API failed: ${response.status} - ${errorText}`);
    }

    const aiResponse = await response.json();
    const content = aiResponse.content?.[0]?.text;
    
    if (!content) {
      throw new Error('No response from Claude');
    }

    console.log('Claude raw response:', content);

    // Parse JSON
    let jsonStr = content.trim();
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    const parsed = JSON.parse(jsonStr);
    const detectedBrand = parsed.detectedBrand || null;
    
    if (detectedBrand) {
      console.log(`Detected brand: ${detectedBrand.name} (${detectedBrand.url})`);
    }

    // Validate and normalize blocks
    const rawBlocks = parsed.blocks || [];

    const blocks = rawBlocks
      .map((block: any, index: number) => {
        const rawX = typeof block.bounds?.x === 'number' ? block.bounds.x : 0;
        const rawY = typeof block.bounds?.y === 'number' ? block.bounds.y : 0;
        const rawWidth = typeof block.bounds?.width === 'number' ? block.bounds.width : width;
        const rawHeight = typeof block.bounds?.height === 'number' ? block.bounds.height : 50;

        // Clamp into image space
        const x = Math.max(0, Math.min(rawX, width));
        const y = Math.max(0, Math.min(rawY, height));
        const w = Math.max(1, Math.min(rawWidth, width - x));
        const h = Math.max(10, Math.min(rawHeight, height - y));

        return {
          id: block.id || `block-${index}`,
          name: block.name || `Block ${index + 1}`,
          type: block.type === 'image' ? 'image' : 'code',
          bounds: { x, y, width: w, height: h },
          suggestedLink: block.suggestedLink || '',
          altText: block.altText || '',
          isFooter: Boolean(block.isFooter),
        };
      })
      .sort((a: any, b: any) => a.bounds.y - b.bounds.y);

    // Log final blocks
    console.log('Final blocks:');
    blocks.forEach((b: any) => {
      console.log(`  ${b.name}: y=${b.bounds.y}, h=${b.bounds.height}, bottom=${b.bounds.y + b.bounds.height}`);
    });

    const finalMaxBottom = Math.max(...blocks.map((b: any) => b.bounds.y + b.bounds.height));
    console.log(`Final coverage: ${((finalMaxBottom / height) * 100).toFixed(1)}%`);

    const footerBlocks = blocks.filter((b: any) => b.isFooter);

    return new Response(JSON.stringify({
      blocks,
      analyzedWidth: width,
      analyzedHeight: height,
      hasFooter: footerBlocks.length > 0,
      footerStartIndex: footerBlocks.length > 0 ? blocks.findIndex((b: any) => b.isFooter) : -1,
      detectedBrand,
    }), {
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