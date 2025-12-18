import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SliceInput {
  dataUrl: string;
  index: number;
}

interface SliceAnalysis {
  index: number;
  altText: string;
  suggestedLink: string | null;
  isClickable: boolean;
  linkVerified: boolean;
  linkWarning?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { slices, brandUrl, brandDomain } = await req.json() as { 
      slices: SliceInput[]; 
      brandUrl?: string;
      brandDomain?: string;
    };

    if (!slices || !Array.isArray(slices) || slices.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid slices array' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract domain from brandUrl if not provided
    const domain = brandDomain || (brandUrl ? new URL(brandUrl).hostname.replace('www.', '') : null);

    console.log(`Analyzing ${slices.length} slices for brand: ${brandUrl || 'unknown'}, domain: ${domain}`);

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const sliceDescriptions = slices.map((s, i) => `Slice ${i + 1}`).join(', ');
    
    const prompt = `You are analyzing sliced sections of an email marketing campaign image. There are ${slices.length} slices: ${sliceDescriptions}.

IMPORTANT: You have access to Google Search. USE IT to find REAL pages on the brand's website.

BRAND WEBSITE: ${brandUrl || 'Unknown'}
BRAND DOMAIN: ${domain || 'Unknown'}

FOR EACH CLICKABLE SLICE:
1. Look at the visual content (CTA buttons, product images, headlines, promotional text)
2. Use Google Search to find the actual page on ${domain} that matches what you see
3. Search queries like: "site:${domain} [product name]" or "site:${domain} [CTA action]"
4. ONLY suggest links you've verified exist via search
5. If you can't find a matching page via search, you may suggest a logical path but mark linkVerified: false

ALT TEXT RULES:
- Write the actual campaign copy/text visible in the slice, condensed and spoken as if to someone who cannot see it
- For CTAs/buttons: Add "Click to" prefix (e.g., "Click to Schedule Consultation")
- For hero text: Include the headline copy (e.g., "It's time to get Enhanced")
- For logos: ONLY the brand name - never say "logo"
- Max 100 chars

LINK RULES:
- Use FULL URLs (e.g., "https://${domain}/schedule" not "/schedule")
- If you found the link via Google Search, set linkVerified: true
- If you couldn't verify but are suggesting a logical path, set linkVerified: false and add linkWarning
- If a link points outside ${domain}, set linkVerified: false and add linkWarning: "External link - verify this is correct"

Respond in JSON format:
{
  "slices": [
    {
      "index": 0,
      "altText": "alt text here",
      "isClickable": true/false,
      "suggestedLink": "https://full-url-here" or null,
      "linkVerified": true/false,
      "linkWarning": "Optional warning if unverified or external"
    }
  ]
}`;

    // Build content array with text and all images
    const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
      { type: 'text', text: prompt }
    ];

    // Add each slice image
    for (const slice of slices) {
      content.push({
        type: 'image_url',
        image_url: { url: slice.dataUrl }
      });
    }

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'user', content }
        ],
        tools: [{ google_search: {} }], // Enable web search grounding
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', response.status, errorText);
      
      // Return default analysis if AI fails
      const defaultAnalysis: SliceAnalysis[] = slices.map((_, i) => ({
        index: i,
        altText: `Email section ${i + 1}`,
        suggestedLink: null,
        isClickable: false,
        linkVerified: false
      }));
      
      return new Response(
        JSON.stringify({ analyses: defaultAnalysis, warning: 'AI analysis unavailable, using defaults' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiResponse = await response.json();
    const aiContent = aiResponse.choices?.[0]?.message?.content || '';
    
    console.log('AI response received');

    // Parse JSON from AI response
    let analyses: SliceAnalysis[] = [];
    try {
      // Extract JSON from response (might be wrapped in markdown)
      const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        analyses = parsed.slices || [];
        
        // Ensure indices are correct and validate links
        analyses = analyses.map((a: SliceAnalysis, i: number) => {
          let link = a.suggestedLink;
          let linkVerified = a.linkVerified ?? false;
          let linkWarning = a.linkWarning;
          
          if (a.isClickable && link) {
            // Check if it's a full URL or just a path
            if (!link.startsWith('http://') && !link.startsWith('https://')) {
              // Convert path to full URL
              const cleanBrandUrl = brandUrl?.replace(/\/$/, '') || `https://${domain}`;
              const cleanPath = link.startsWith('/') ? link : `/${link}`;
              link = `${cleanBrandUrl}${cleanPath}`;
              linkVerified = false;
              linkWarning = linkWarning || 'Path suggested without verification';
            }
            
            // Check if link is external
            if (domain && link) {
              try {
                const linkDomain = new URL(link).hostname.replace('www.', '');
                if (linkDomain !== domain) {
                  linkWarning = 'External link - verify this is correct';
                  linkVerified = false;
                }
              } catch {
                // Invalid URL
                linkWarning = 'Invalid URL format';
                linkVerified = false;
              }
            }
          }
          
          return { 
            ...a, 
            index: i, 
            suggestedLink: link,
            linkVerified,
            linkWarning
          };
        });
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
    }

    // Fill in any missing slices with defaults
    while (analyses.length < slices.length) {
      analyses.push({
        index: analyses.length,
        altText: `Email section ${analyses.length + 1}`,
        suggestedLink: null,
        isClickable: false,
        linkVerified: false
      });
    }

    return new Response(
      JSON.stringify({ analyses }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error in analyze-slices:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
