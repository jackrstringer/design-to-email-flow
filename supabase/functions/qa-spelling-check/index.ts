import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageBase64 } = await req.json();
    
    if (!imageBase64) {
      return new Response(
        JSON.stringify({ error: 'imageBase64 required', hasErrors: false, errors: [] }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Strip data URL prefix if present
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');

    console.log('[QA] Starting spelling check, base64 length:', base64Data.length);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY') || '',
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
                media_type: 'image/png',
                data: base64Data
              }
            },
            {
              type: 'text',
              text: `You are a proofreader. Find ONLY clear spelling errors and typos in this email image.

Read ALL text: headlines, body copy, buttons, fine print.

FLAG these (actual typos):
- Misspelled words ("recieve" → "receive", "teh" → "the")
- Wrong letters or transposed letters ("hte" → "the")
- Missing letters that create nonsense words
- Gibberish or nonsensical words

DO NOT FLAG (acceptable variations):
- Brand names or intentional stylization
- Hyphenation preferences ("kickstart" vs "kick-start", "ecommerce" vs "e-commerce")
- Compound word variations ("email" vs "e-mail")
- Minor grammar style choices
- Non-English words or creative spelling
- Numbers or abbreviations

Only report CLEAR ERRORS that would look unprofessional.

Return ONLY this JSON format, nothing else:

{"hasErrors": true, "errors": [{"text": "misspelled word", "correction": "correct spelling", "location": "where in email"}]}

Or if no errors:

{"hasErrors": false, "errors": []}`
            }
          ]
        }]
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.error('[QA] Anthropic API error:', data);
      return new Response(
        JSON.stringify({ error: 'API error', hasErrors: false, errors: [] }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const text = data.content?.[0]?.text || '';
    console.log('[QA] Raw response:', text);
    
    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      console.log('[QA] Found', result.errors?.length || 0, 'spelling errors');
      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ hasErrors: false, errors: [] }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[QA] Error:', message);
    return new Response(
      JSON.stringify({ error: message, hasErrors: false, errors: [] }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
