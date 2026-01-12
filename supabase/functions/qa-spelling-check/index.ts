import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SPELLING_QA_PROMPT = `You are a proofreader. Your ONLY job is to find spelling errors and typos in this email campaign image.

## INSTRUCTIONS

1. Read EVERY piece of text visible in the image:
   - Headlines and hero text
   - Subheadlines  
   - Body paragraphs
   - Button text (CTAs)
   - Captions
   - Fine print / disclaimers
   - Navigation links
   - Footer text

2. For each piece of text, check for:
   - Misspelled words ("recieve" → "receive")
   - Wrong words ("oned" → "one", "teh" → "the")
   - Missing letters ("bcause" → "because")
   - Extra letters ("theirr" → "their")
   - Transposed letters ("freind" → "friend")
   - Wrong homophones in obvious cases ("your" vs "you're" when clearly wrong)

3. IGNORE:
   - Brand names (may be intentionally stylized)
   - ALL CAPS stylization
   - Intentional abbreviations
   - Minor punctuation preferences
   - Non-English words that appear intentional

## OUTPUT FORMAT

Return ONLY valid JSON, no other text:

{
  "hasErrors": true,
  "errors": [
    {
      "text": "the exact misspelled word or phrase",
      "correction": "the correct spelling",
      "location": "where in the email (e.g., 'headline', 'CTA button', 'body paragraph')"
    }
  ]
}

If no errors found:
{
  "hasErrors": false,
  "errors": []
}

## IMPORTANT

- Be thorough. Read every word.
- Only flag CLEAR errors, not style choices.
- If unsure, don't flag it.
- Return valid JSON only.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageUrl } = await req.json();
    
    if (!imageUrl) {
      throw new Error('imageUrl is required');
    }

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    console.log('[QA] Starting spelling check for image:', imageUrl.substring(0, 80) + '...');

    // Fetch image and convert to base64 for reliable processing
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch image: ${imageResponse.status}`);
    }
    
    const imageBuffer = await imageResponse.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(imageBuffer)));
    const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
    
    console.log('[QA] Image converted to base64, size:', base64.length, 'media_type:', contentType);

    // Call Anthropic with IMAGE FIRST, then prompt
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: contentType,
                data: base64
              }
            },
            {
              type: 'text',
              text: SPELLING_QA_PROMPT
            }
          ]
        }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[QA] Anthropic API error:', errorText);
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.content?.[0]?.text || '';
    
    console.log('[QA] Raw response:', content);

    // Parse JSON from response
    let result = { hasErrors: false, errors: [] as Array<{ text: string; correction: string; location: string }> };
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        result = JSON.parse(jsonMatch[0]);
      } catch (e) {
        console.error('[QA] JSON parse error:', e);
      }
    }

    console.log('[QA] Found', result.errors?.length || 0, 'spelling errors');

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[QA] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message, hasErrors: false, errors: [] }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
