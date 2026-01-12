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
    const body = await req.json();
    const { imageBase64, imageUrl } = body;
    
    if (!imageBase64 && !imageUrl) {
      return new Response(
        JSON.stringify({ error: 'imageBase64 or imageUrl required', hasErrors: false, errors: [] }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let base64Data: string;
    let mediaType = 'image/png';
    
    if (imageBase64) {
      // Strip data URL prefix if present and extract media type
      const dataUrlMatch = imageBase64.match(/^data:(image\/\w+);base64,/);
      if (dataUrlMatch) {
        mediaType = dataUrlMatch[1];
        base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
      } else {
        base64Data = imageBase64;
      }
    } else {
      // Fetch image from URL and convert to base64 (for background tasks)
      console.log('[QA] Fetching image from URL:', imageUrl.substring(0, 80));
      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) {
        throw new Error(`Failed to fetch image: ${imageResponse.status}`);
      }
      
      const contentType = imageResponse.headers.get('content-type') || 'image/png';
      mediaType = contentType.split(';')[0];
      
      const arrayBuffer = await imageResponse.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      
      // Convert to base64 in chunks to avoid stack overflow
      const chunkSize = 32768;
      let binary = '';
      for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, Array.from(chunk));
      }
      base64Data = btoa(binary);
    }

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
                media_type: mediaType,
                data: base64Data
              }
            },
            {
              type: 'text',
              text: `You are a proofreader. Find ALL spelling errors and typos in this email image.

Read EVERY piece of text: headlines, body copy, buttons, fine print, everything.

Flag:
- Misspelled words ("recieve" → "receive")
- Wrong words ("oned" → "one")
- Missing/extra/transposed letters

IGNORE: Brand names, intentional stylization, non-English words.

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
