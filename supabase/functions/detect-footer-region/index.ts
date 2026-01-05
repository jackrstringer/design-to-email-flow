import "https://deno.land/x/xhr@0.1.0/mod.ts";
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
    const { imageUrl } = await req.json();

    if (!imageUrl) {
      return new Response(
        JSON.stringify({ error: 'Image URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    console.log('Analyzing image for footer region:', imageUrl);

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `You are an email design analyzer. Your task is to identify where the footer section begins in an email design image.

The footer is typically characterized by:
- Social media icons (Facebook, Instagram, Twitter, etc.)
- Unsubscribe links
- Company address or contact info
- Legal disclaimers or privacy policy links
- A visual break or separator from the main content
- Often has a different background color or style

Analyze the image and return ONLY a JSON object with:
{
  "footerStartPercent": <number between 0 and 100>,
  "confidence": <"high" | "medium" | "low">,
  "reason": "<brief explanation>"
}

The footerStartPercent should indicate what percentage from the TOP of the image the footer begins.
For example, if the footer starts 3/4 down the image, return 75.`
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Analyze this email design and identify where the footer section begins. Return the percentage from the top where the footer starts.'
              },
              {
                type: 'image_url',
                image_url: { url: imageUrl }
              }
            ]
          }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    console.log('AI response:', content);

    // Parse the JSON response
    let footerStartPercent = 75; // Default fallback
    let confidence = 'low';
    let reason = 'Using default position';

    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.footerStartPercent && typeof parsed.footerStartPercent === 'number') {
          footerStartPercent = Math.max(20, Math.min(95, parsed.footerStartPercent));
          confidence = parsed.confidence || 'medium';
          reason = parsed.reason || 'AI detected footer boundary';
        }
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
    }

    return new Response(
      JSON.stringify({ 
        footerStartPercent,
        confidence,
        reason
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in detect-footer-region:', errorMessage);
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        footerStartPercent: 75, // Return default on error
        confidence: 'low',
        reason: 'Error occurred, using default'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
