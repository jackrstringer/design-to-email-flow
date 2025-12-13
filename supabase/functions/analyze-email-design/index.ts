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
    const { imageDataUrl, width, height } = await req.json();
    
    if (!imageDataUrl) {
      throw new Error('No image data provided');
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    console.log(`Analyzing image: ${width}x${height}`);

    const systemPrompt = `You are an expert email designer and HTML developer. Analyze the uploaded email design image and identify distinct sections/blocks.

For each block, determine:
1. Block name (e.g., "Header", "Hero Banner", "Product Grid", "CTA Button", "Footer", "Social Links", "Text Section")
2. Block type: "code" for sections that can be coded (text, buttons, simple layouts) or "image" for complex graphics/photos that should be image slices
3. Approximate bounding box coordinates as percentages of the image dimensions
4. Suggested link destination based on content context
5. Alt text description

Return a JSON object with this exact structure:
{
  "blocks": [
    {
      "id": "unique-id",
      "name": "Block Name",
      "type": "code" | "image",
      "bounds": {
        "x": 0,
        "y": 0,
        "width": 100,
        "height": 20
      },
      "suggestedLink": "https://example.com",
      "altText": "Description of the section"
    }
  ]
}

IMPORTANT:
- Bounds are in PIXEL coordinates based on the actual image dimensions
- x, y is the top-left corner of the block
- Identify logical email sections from top to bottom
- Common sections: header/logo, hero/banner, product cards, text blocks, CTA buttons, footer, social links
- Headers with logos are typically "image" type
- Text-heavy sections are "code" type
- Product images are "image" type
- Simple buttons can be "code" type
- Return valid JSON only, no markdown or explanations`;

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
                text: `Analyze this email design image (${width}x${height} pixels) and identify all distinct sections/blocks. Return the JSON structure with block coordinates in pixels.`,
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

    // Parse JSON from response (handle markdown code blocks)
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    const parsed = JSON.parse(jsonStr);
    
    // Ensure blocks have proper structure
    const blocks = parsed.blocks.map((block: any, index: number) => ({
      id: block.id || `block-${index}`,
      name: block.name || `Block ${index + 1}`,
      type: block.type === 'image' ? 'image' : 'code',
      bounds: {
        x: Math.max(0, block.bounds?.x || 0),
        y: Math.max(0, block.bounds?.y || 0),
        width: Math.min(width, block.bounds?.width || 100),
        height: Math.min(height, block.bounds?.height || 50),
      },
      suggestedLink: block.suggestedLink || '',
      altText: block.altText || '',
    }));

    const result = {
      blocks,
      originalWidth: width,
      originalHeight: height,
    };

    console.log(`Successfully analyzed design: ${blocks.length} blocks found`);

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
