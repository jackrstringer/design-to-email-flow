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
        model: 'claude-haiku-4-5-20251001',
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
              text: `You are a proofreader. Find ONLY obvious spelling errors and typos in this email image.

Read ALL text: headlines, body copy, buttons, fine print.

FLAG ONLY these (actual typos that would embarrass the sender):
- Clearly misspelled common words ("recieve" → "receive", "teh" → "the", "definately" → "definitely")
- Wrong letters or transposed letters that create nonsense ("hte" → "the")
- Missing letters that create obvious nonsense words
- Gibberish or completely nonsensical words that are clearly mistakes

DO NOT FLAG any of these (they are acceptable):
- Brand names, product names, or company names (even if they look unusual)
- Special characters in names (ü, ö, é, ñ, ß, ä, etc.) - these are INTENTIONAL
- Hyphenation preferences ("kickstart" vs "kick-start", "ecommerce" vs "e-commerce")
- Compound word variations ("email" vs "e-mail", "website" vs "web site")
- British vs American spelling ("colour" vs "color", "realise" vs "realize")
- Minor grammar or style choices
- Non-English words or intentional creative/stylized spelling
- Numbers, abbreviations, or acronyms
- Words with accented characters (café, résumé, naïve, etc.)
- Trademarked or stylized product names
- ALL-CAPS words or intentional stylization

IMPORTANT: Do NOT flag words containing special characters (ü, ö, é, ñ, ß, ä, î, ô, etc.) as errors. These are almost always intentional brand names, product names, or non-English words.

Be VERY conservative. Only flag errors you are 100% certain are actual mistakes. When in doubt, do NOT flag it.

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
