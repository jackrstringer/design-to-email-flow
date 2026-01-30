import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { sessionKey, imageUrl } = await req.json();
    
    if (!sessionKey || !imageUrl) {
      return new Response(
        JSON.stringify({ error: 'sessionKey and imageUrl required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[QA-Early] Starting async spelling check, session:', sessionKey);

    // Initialize Supabase client for storing results
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch image and convert to base64
    console.log('[QA-Early] Fetching image:', imageUrl.substring(0, 80) + '...');
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error('Failed to fetch image');
    }
    
    const imageBuffer = await imageResponse.arrayBuffer();
    const uint8Array = new Uint8Array(imageBuffer);
    
    // Convert to base64 in chunks to avoid stack overflow on large images
    const chunkSize = 32768;
    let base64Data = '';
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.slice(i, i + chunkSize);
      base64Data += String.fromCharCode(...chunk);
    }
    base64Data = btoa(base64Data);

    console.log('[QA-Early] Image fetched, base64 length:', base64Data.length);

    // Call Claude Haiku for fast spelling check
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY') || '',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022', // Haiku for speed
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
      console.error('[QA-Early] Anthropic API error:', data);
      // Store empty result on error so pipeline doesn't hang
      await supabase
        .from('early_spelling_check')
        .upsert({
          session_key: sessionKey,
          image_url: imageUrl,
          spelling_errors: [],
          has_errors: false
        }, { onConflict: 'session_key' });
      
      return new Response(
        JSON.stringify({ success: true, sessionKey, error: 'API error' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const text = data.content?.[0]?.text || '';
    console.log('[QA-Early] Raw response:', text.substring(0, 200));
    
    // Extract JSON from response
    let result = { hasErrors: false, errors: [] as any[] };
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        result = JSON.parse(jsonMatch[0]);
      } catch (e) {
        console.error('[QA-Early] Failed to parse JSON:', e);
      }
    }

    console.log('[QA-Early] Found', result.errors?.length || 0, 'spelling errors');

    // Store results in early_spelling_check table
    const { error: upsertError } = await supabase
      .from('early_spelling_check')
      .upsert({
        session_key: sessionKey,
        image_url: imageUrl,
        spelling_errors: result.errors || [],
        has_errors: result.hasErrors || false
      }, { onConflict: 'session_key' });

    if (upsertError) {
      console.error('[QA-Early] Failed to store results:', upsertError);
    } else {
      console.log('[QA-Early] Results stored for session:', sessionKey);
    }

    return new Response(
      JSON.stringify({ success: true, sessionKey }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[QA-Early] Error:', message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
