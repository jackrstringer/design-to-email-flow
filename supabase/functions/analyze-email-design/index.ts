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

    const systemPrompt = `You are an expert email template analyst.

## YOUR TASK
Break down this email into horizontal sections/elements from top to bottom.
For each section, identify where it starts and ends as a PERCENTAGE (0-100) of the total height.
0 = very top of the email, 100 = very bottom.

## SECTION TYPES
- "image": Photos, graphics, text overlaid on images, logos, icons, complex visual elements, gradients
- "code": Plain solid color backgrounds with simple text/buttons that can be recreated in HTML

BE CONSERVATIVE: When in doubt, use "image". It's safer for email rendering.

## BRAND DETECTION
Look for the brand's website URL and company name (usually in header or footer).

## FOOTER DETECTION
${isFirstCampaign ? `Mark footer sections with "isFooter": true. Footer typically includes logo, nav links, social icons, legal/disclaimer text.` : 'Footer detection not needed.'}

## OUTPUT FORMAT
Return ONLY valid JSON (no markdown):
{
  "detectedBrand": { "url": "example.com", "name": "Example" },
  "blocks": [
    { "id": "header_logo", "name": "Header Logo", "type": "image", "yStart": 0, "yEnd": 5, "altText": "", "isFooter": false },
    { "id": "headline", "name": "Headline", "type": "image", "yStart": 5, "yEnd": 14, "altText": "", "isFooter": false }
  ]
}

RULES:
- First block must start at yStart: 0
- Last block must end at yEnd: 100
- Blocks must be contiguous (no gaps)
- yStart and yEnd are percentages (0-100)`;

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
                text: `Break down this email into sections. For each section, give yStart and yEnd as percentages (0-100). Return JSON only.`,
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

    // Convert percentage-based blocks to pixel coordinates
    const rawBlocks = parsed.blocks || [];

    const blocks = rawBlocks
      .map((block: any, index: number) => {
        const yStartPct = typeof block.yStart === 'number' ? block.yStart : 0;
        const yEndPct = typeof block.yEnd === 'number' ? block.yEnd : 100;
        
        // Convert percentages to pixels
        const y = Math.round((yStartPct / 100) * height);
        const h = Math.round(((yEndPct - yStartPct) / 100) * height);

        return {
          id: block.id || `block-${index}`,
          name: block.name || `Block ${index + 1}`,
          type: block.type === 'image' ? 'image' : 'code',
          bounds: { 
            x: 0, 
            y: Math.max(0, y), 
            width: width, 
            height: Math.max(10, h) 
          },
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