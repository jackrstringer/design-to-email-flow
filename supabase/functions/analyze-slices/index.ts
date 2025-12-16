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
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { slices, brandUrl } = await req.json() as { slices: SliceInput[]; brandUrl?: string };

    if (!slices || !Array.isArray(slices) || slices.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid slices array' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Analyzing ${slices.length} slices for brand: ${brandUrl || 'unknown'}`);

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // Analyze all slices in one API call for efficiency
    const sliceDescriptions = slices.map((s, i) => `Slice ${i + 1}`).join(', ');
    
    const prompt = `You are analyzing sliced sections of an email marketing campaign image. There are ${slices.length} slices: ${sliceDescriptions}.

IMPORTANT CONTEXT: Look at ALL slices together to understand the campaign's overall goal and main CTA.

For each slice, provide:
1. ALT TEXT: Write the actual campaign copy/text visible in the slice, condensed and spoken as if to someone who cannot see it. 
   - For CTAs/buttons: Add "Click to" prefix (e.g., "Click to Schedule Consultation" not just "Schedule Consultation")
   - For hero text: Include the headline copy (e.g., "It's time to get Enhanced")
   - For logos: Just the brand name (e.g., "Enhanced")
   - Max 100 chars

2. IS CLICKABLE: true if the slice contains a CTA button, product image, or clickable banner

3. LINK STRATEGY (IMPORTANT):
   - If the campaign has a clear single goal/CTA, ALL clickable slices should link to that CTA destination
   - Hero images and product images should link to the main campaign goal, not generic pages
   - Only use homepage ("/") if the campaign is very general/brand-focused
   - Only use "/products" or "/collections" if multiple products are showcased without a specific CTA
   - Return just the path (e.g., "/schedule-consultation"), NOT the full URL

${brandUrl ? `The brand website is: ${brandUrl}` : 'No brand URL provided.'}

Respond in JSON format:
{
  "slices": [
    {
      "index": 0,
      "altText": "alt text here",
      "isClickable": true/false,
      "suggestedLink": "/path" or null
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
        isClickable: false
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
        
        // Ensure indices are correct and build full URLs
        analyses = analyses.map((a: SliceAnalysis, i: number) => {
          let link = null;
          if (a.isClickable && a.suggestedLink && brandUrl) {
            // Check if AI returned a full URL (shouldn't, but handle it)
            if (a.suggestedLink.startsWith('http://') || a.suggestedLink.startsWith('https://')) {
              link = a.suggestedLink;
            } else {
              // Build full URL from path
              const cleanBrandUrl = brandUrl.replace(/\/$/, '');
              const cleanPath = a.suggestedLink.startsWith('/') ? a.suggestedLink : `/${a.suggestedLink}`;
              link = `${cleanBrandUrl}${cleanPath}`;
            }
          }
          return { ...a, index: i, suggestedLink: link };
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
        isClickable: false
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
