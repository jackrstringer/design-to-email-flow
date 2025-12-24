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

    const prompt = `Analyze this email section/footer design and categorize ALL visual elements.

Your job is to classify elements into THREE categories:

## 1. REQUIRES_UPLOAD (True image assets that MUST be uploaded)
These are actual image files that cannot be recreated with text/CSS:
- Brand logos (wordmarks, icons, mascots)
- Custom illustrations or graphics
- Product photos
- Badges, seals, certifications with complex graphics
- Background images or patterns

For each, provide:
- id: unique snake_case identifier
- description: what it looks like
- location: where in the design (e.g., "bottom left", "center")
- category: "logo" | "decorative" | "background" | "badge"
- crop_hint: bounding box as percentages with ORIGIN AT TOP-LEFT (0,0)
  - x_percent: distance from LEFT edge to LEFT side of asset (0-100)
  - y_percent: distance from TOP edge to TOP side of asset (0-100)  
  - width_percent: width of asset as % of full image width
  - height_percent: height of asset as % of full image height

## 2. TEXT_BASED_ELEMENTS (Achievable with text/CSS - NO upload needed)
These elements can be recreated with Unicode characters or CSS:
- Simple arrows (→ ← ↑ ↓ › ‹ ›› « »)
- Bullets (• ◦ ‣ ○)
- Simple dividers (lines, pipes |)
- Basic shapes achievable with CSS (circles, squares)

For each, provide:
- id: unique snake_case identifier
- description: what it represents
- recommendation: exact Unicode character or CSS approach to use

## 3. SOCIAL ICONS
Standard social media platform icons - we handle these separately.
Just list: platform names detected (instagram, facebook, tiktok, twitter, youtube, linkedin, pinterest, snapchat, threads, etc.)

## 4. STYLES
Extract visual style tokens:
- background_color: hex value
- text_color: primary text hex
- accent_color: highlight/accent hex
- social_icon_color: hex value of social icons

Return ONLY valid JSON:
{
  "requires_upload": [
    {
      "id": "owl_logo",
      "description": "Owl brand mark with spread wings",
      "location": "bottom left corner",
      "category": "logo",
      "crop_hint": { "x_percent": 5, "y_percent": 80, "width_percent": 12, "height_percent": 15 }
    }
  ],
  "text_based_elements": [
    {
      "id": "nav_arrows",
      "description": "Right-pointing arrows after navigation items",
      "recommendation": "Use → character or CSS ::after with border"
    }
  ],
  "social_platforms": ["instagram", "facebook", "tiktok"],
  "social_icon_color": "#ffffff",
  "styles": {
    "background_color": "#0a0a0a",
    "text_color": "#ffffff",
    "accent_color": "#c9a227"
  }
}

IMPORTANT CLASSIFICATION RULES:
- Simple arrows are ALWAYS text_based_elements, not requires_upload
- Only flag as requires_upload if it's a complex graphic that CANNOT be a Unicode character
- Be conservative - when in doubt, it's probably text-based
- crop_hint: x_percent/y_percent = TOP-LEFT corner of the asset bounding box`;

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
      requires_upload: extractedData.requires_upload || [],
      text_based_elements: extractedData.text_based_elements || [],
      social_platforms: extractedData.social_platforms || [],
      social_icon_color: extractedData.social_icon_color || '#ffffff',
      styles: extractedData.styles || {}
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
