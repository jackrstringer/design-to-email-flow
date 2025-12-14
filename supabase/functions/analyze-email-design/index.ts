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

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    console.log(`Analyzing image: ${width}×${height}, isFirstCampaign: ${isFirstCampaign}`);

    // ============================================
    // SIMPLE, EXPLICIT PROMPT
    // Tell the AI exactly what coordinate space to use
    // ============================================
    const systemPrompt = `You are an expert email template analyst.

## IMAGE DIMENSIONS
The image you are analyzing is EXACTLY ${width} pixels wide and ${height} pixels tall.
The coordinate system starts at (0,0) in the TOP-LEFT corner.
X increases going RIGHT. Y increases going DOWN.

## YOUR TASK
Identify all distinct HORIZONTAL FULL-WIDTH SECTIONS in this email from TOP to BOTTOM.

## CRITICAL REQUIREMENTS
1. The FIRST block MUST start at y=0 (the very top)
2. The LAST block MUST end at y=${height} (the very bottom)
3. Blocks must NOT overlap
4. Blocks must be CONTIGUOUS (no gaps between them)
5. Each block spans the full width: x=0, width=${width}

## BLOCK TYPE RULES
- "image": Photos, graphics, text overlaid on images, logos, icons, complex visual elements
- "code": Plain solid color backgrounds with simple text/buttons that can be recreated in HTML

When in doubt, use "image" - it's safer for email rendering.

## BRAND DETECTION
Look for the brand's website URL and company name (usually in header or footer).

## FOOTER DETECTION
${isFirstCampaign ? `Mark footer sections with "isFooter": true. The footer typically starts after main content and includes logo, nav links, social icons, and legal text.` : 'Footer detection not needed.'}

## OUTPUT FORMAT
Return ONLY valid JSON:
{
  "detectedBrand": { "url": "example.com", "name": "Example Company" },
  "blocks": [
    {
      "id": "header",
      "name": "Header Logo",
      "type": "image",
      "bounds": { "x": 0, "y": 0, "width": ${width}, "height": 100 },
      "suggestedLink": "",
      "altText": "",
      "isFooter": false
    }
  ]
}

VALIDATION CHECK: Add up all block heights. The total MUST equal ${height}.
If your blocks only cover 70% of the image, you are MISSING sections. Try again.`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Analyze this ${width}×${height} pixel email design. Identify ALL sections from y=0 to y=${height}. Return JSON with blocks.`,
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
          JSON.stringify({ error: 'Rate limit exceeded. Please try again.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'API credits exhausted.' }),
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

    console.log('AI raw response:', content);

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

    // ============================================
    // VALIDATE AND NORMALIZE BLOCKS (SIMPLE VERSION)
    // - Trust AI coordinates as-is
    // - Only clamp to image bounds
    // - Do NOT rescale or force coverage/contiguity
    // ============================================
    const rawBlocks = parsed.blocks || [];

    const blocks = rawBlocks
      .map((block: any, index: number) => {
        const rawX = typeof block.bounds?.x === 'number' ? block.bounds.x : 0;
        const rawY = typeof block.bounds?.y === 'number' ? block.bounds.y : 0;
        const rawWidth = typeof block.bounds?.width === 'number' ? block.bounds.width : width;
        const rawHeight = typeof block.bounds?.height === 'number' ? block.bounds.height : 50;

        // Clamp into image space without changing relative geometry
        const x = Math.max(0, Math.min(rawX, width));
        const y = Math.max(0, Math.min(rawY, height));
        const w = Math.max(1, Math.min(rawWidth, width - x));
        const h = Math.max(10, Math.min(rawHeight, height - y));

        return {
          id: block.id || `block-${index}`,
          name: block.name || `Block ${index + 1}`,
          type: block.type === 'image' ? 'image' : 'code',
          bounds: {
            x,
            y,
            width: w,
            height: h,
          },
          suggestedLink: block.suggestedLink || '',
          altText: block.altText || '',
          isFooter: Boolean(block.isFooter),
        };
      })
      .sort((a: any, b: any) => a.bounds.y - b.bounds.y);

    // Log final blocks for debugging
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
