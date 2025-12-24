import "https://deno.land/x/xhr@0.1.0/mod.ts";
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
    const { referenceImageUrl } = await req.json();

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    if (!referenceImageUrl) {
      throw new Error('Reference image URL is required');
    }

    console.log('Extracting assets from reference image:', referenceImageUrl);

    const prompt = `Analyze this email section/footer design and catalog EVERY image-based element.

IGNORE standard social media icons (Instagram, Facebook, TikTok, Twitter/X, YouTube, Pinterest, LinkedIn, Snapchat, etc.) - those are handled separately by our system.

Identify ALL of the following:

1. LOGOS / BRAND MARKS
   - Primary logo (text wordmark, icon, or combined)
   - Secondary brand marks (mascots, secondary icons, alternate logos)
   - For each: describe what it looks like and where it appears

2. CUSTOM/DECORATIVE ICONS (NOT social media)
   - Navigation arrows or chevrons
   - Decorative elements (dividers, flourishes)
   - UI elements (bullets, custom shapes)
   - Any icon that is NOT a standard social platform icon
   
3. OTHER GRAPHICS
   - Background images or patterns
   - Badges, seals, certifications
   - Product images
   - Any other image-based element

4. SOCIAL PLATFORMS DETECTED
   - Just list which platforms have icons visible (instagram, facebook, tiktok, etc.)
   - Note if they appear custom-styled vs standard flat monochrome icons
   - What color are the social icons? (extract hex if possible)

5. STYLES
   - Background color(s) - extract hex values
   - Primary text color - extract hex
   - Accent/highlight color - extract hex  
   - Any special effects (gradients, glows, shadows)
   - Typography observations (uppercase text, letter-spacing, etc.)

Return ONLY valid JSON in this exact format:
{
  "non_social_assets": [
    {
      "id": "unique_snake_case_id",
      "description": "Clear description of what this asset is",
      "location": "Where in the design (e.g., 'bottom left', 'center of header')",
      "category": "logo" | "decorative" | "background" | "other",
      "is_standard_character": false
    }
  ],
  "social_platforms_detected": ["instagram", "facebook", "tiktok"],
  "social_icons_are_custom": true,
  "social_icon_color": "#ffffff",
  "styles": {
    "background_color": "#0a0a0a",
    "text_color": "#ffffff",
    "accent_color": "#c9a227",
    "special_effects": ["description of any gradients, glows, etc."]
  }
}

If an element is a standard text character (like → or •), set is_standard_character to true.
If no non-social assets are found, return an empty array for non_social_assets.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'url', url: referenceImageUrl }
            },
            {
              type: 'text',
              text: prompt
            }
          ]
        }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Claude API error:', response.status, errorText);
      throw new Error(`Claude API error: ${response.status}`);
    }

    const data = await response.json();
    let responseText = data.content?.[0]?.text || '';
    
    // Extract JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('No JSON found in response:', responseText);
      throw new Error('Failed to extract JSON from AI response');
    }

    const extractedData = JSON.parse(jsonMatch[0]);
    
    console.log('Extracted assets:', JSON.stringify(extractedData, null, 2));

    return new Response(JSON.stringify({ 
      success: true,
      ...extractedData
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Extract section assets error:', error);
    return new Response(JSON.stringify({ 
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
