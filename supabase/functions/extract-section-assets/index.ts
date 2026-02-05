// deploy-trigger
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
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

Your job is to classify elements into SIX categories:

## 1. LOGO_ANALYSIS (Critical - analyze the footer's logo requirements)
Examine the footer background color and any visible logo:
- Is there a logo visible in the footer? (true/false)
- What is the footer's background luminance? (dark/light)
  - Dark backgrounds: black, very dark gray, navy, deep colors
  - Light backgrounds: white, cream, light gray, pastel colors
- What logo variant is needed for this background?
  - Dark backgrounds need LIGHT/WHITE logos
  - Light backgrounds need DARK/BLACK logos
- Where is the logo positioned? (center, left, right, bottom-center, etc.)
- Estimate the logo's relative size

Return as:
{
  "logo_visible": true,
  "background_is_dark": true,
  "needed_variant": "light",
  "logo_position": "center",
  "estimated_size": { "width_percent": 15, "height_percent": 8 }
}

## 2. REQUIRES_UPLOAD (True image assets that MUST be uploaded)
These are actual image files that cannot be recreated with text/CSS:
- Brand logos (wordmarks, icons, mascots) - **ALWAYS include if visible**
- Custom illustrations or graphics
- Product photos
- Badges, seals, certifications with complex graphics
- Background images or patterns

IMPORTANT: If a logo is visible, ALWAYS include it in requires_upload with:
- id: "brand_logo" (use this exact id for main logo)
- category: "logo"

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

## 3. TEXT_BASED_ELEMENTS (Achievable with text/CSS - NO upload needed)
These elements can be recreated with Unicode characters or CSS:
- Simple arrows (→ ← ↑ ↓ › ‹ ›› « »)
- Bullets (• ◦ ‣ ○)
- Simple dividers (lines, pipes |)
- Basic shapes achievable with CSS (circles, squares)

For each, provide:
- id: unique snake_case identifier
- description: what it represents
- recommendation: exact Unicode character or CSS approach to use

## 4. SOCIAL ICONS
Standard social media platform icons - we handle these separately.
Just list: platform names detected (instagram, facebook, tiktok, twitter, youtube, linkedin, pinterest, snapchat, threads, etc.)

## 5. CLICKABLE_ELEMENTS (All text links and buttons that need URLs)
Identify ALL clickable text elements in the footer:
- Navigation links (shop categories, pages)
- CTA buttons (e.g., "JOIN THE FACEBOOK GROUP")
- Email action links (Unsubscribe, Manage Preferences, View in Browser)
- Contact links

For each, provide:
- id: unique snake_case identifier
- text: exact text shown (e.g., "THE WALLETS", "Unsubscribe")
- category: "navigation" | "button" | "social" | "email_action"
- likely_destination: description of where this likely links to

## 6. STYLES
Extract visual style tokens:
- background_color: hex value
- text_color: primary text hex
- accent_color: highlight/accent hex
- social_icon_color: hex value of social icons

Return ONLY valid JSON:
{
  "logo_analysis": {
    "logo_visible": true,
    "background_is_dark": true,
    "needed_variant": "light",
    "logo_position": "center",
    "estimated_size": { "width_percent": 15, "height_percent": 8 }
  },
  "requires_upload": [
    {
      "id": "brand_logo",
      "description": "Brand wordmark/logo in white",
      "location": "center, above social icons",
      "category": "logo",
      "crop_hint": { "x_percent": 35, "y_percent": 10, "width_percent": 30, "height_percent": 12 }
    }
  ],
  "text_based_elements": [
    {
      "id": "nav_arrows",
      "description": "Right-pointing arrows after navigation items",
      "recommendation": "Use → character or CSS ::after with border"
    }
  ],
  "clickable_elements": [
    {
      "id": "nav_wallets",
      "text": "THE WALLETS",
      "category": "navigation",
      "likely_destination": "shop wallets collection page"
    },
    {
      "id": "cta_facebook",
      "text": "JOIN THE FACEBOOK GROUP",
      "category": "button",
      "likely_destination": "Facebook group page"
    },
    {
      "id": "unsubscribe_link",
      "text": "Unsubscribe",
      "category": "email_action",
      "likely_destination": "email unsubscribe action"
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
- ALWAYS analyze and return logo_analysis - this is critical for proper logo handling
- If a logo is visible, ALWAYS include it in requires_upload with id "brand_logo"
- Only flag as requires_upload if it's a complex graphic that CANNOT be a Unicode character
- Be conservative - when in doubt, it's probably text-based
- crop_hint: x_percent/y_percent = TOP-LEFT corner of the asset bounding box
- Identify ALL clickable text - navigation, buttons, email actions, etc.`;

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
      logo_analysis: extractedData.logo_analysis || null,
      requires_upload: extractedData.requires_upload || [],
      text_based_elements: extractedData.text_based_elements || [],
      clickable_elements: extractedData.clickable_elements || [],
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
