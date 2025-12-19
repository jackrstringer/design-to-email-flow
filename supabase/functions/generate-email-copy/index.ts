import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Retry with exponential backoff for rate limits
async function fetchWithRetry(
  url: string, 
  options: RequestInit, 
  maxRetries = 3
): Promise<Response> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const response = await fetch(url, options);
    
    if (response.status === 429) {
      const retryAfter = response.headers.get('retry-after');
      const waitTime = retryAfter 
        ? parseInt(retryAfter) * 1000 
        : Math.pow(2, attempt + 1) * 1000;
      
      console.log(`Rate limited. Waiting ${waitTime}ms before retry ${attempt + 1}/${maxRetries}`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      continue;
    }
    
    return response;
  }
  
  throw new Error('Rate limit exceeded after retries. Please try again in a moment.');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { slices, brandContext, existingFavorites, pairCount = 10, refinementPrompt } = await req.json();
    
    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    console.log(`Generating ${pairCount} SL/PT for ${brandContext?.name || 'brand'}${refinementPrompt ? ` with: "${refinementPrompt}"` : ''}`);

    const sliceContext = (slices || [])
      .map((s: any, i: number) => `Section ${i + 1}: ${s.altText || 'No description'}${s.link ? ` (links to: ${s.link})` : ''}`)
      .join('\n');

    const favoriteSLs = (existingFavorites?.subjectLines || []).filter((s: string) => s).map((s: string) => `- "${s}"`);
    const favoritePTs = (existingFavorites?.previewTexts || []).filter((p: string) => p).map((p: string) => `- "${p}"`);

    let favoriteContext = '';
    if (favoriteSLs.length > 0) favoriteContext += `\n\nFavorited subject lines (match this style):\n${favoriteSLs.join('\n')}`;
    if (favoritePTs.length > 0) favoriteContext += `\n\nFavorited preview texts (match this style):\n${favoritePTs.join('\n')}`;

    const userDirection = refinementPrompt 
      ? `\n\nUSER'S REQUEST: "${refinementPrompt}"\nFollow this direction for tone, style, or focus.`
      : '';

    const prompt = `You are a creative email copywriter. Generate diverse, engaging subject lines and preview texts.

BRAND: ${brandContext?.name || 'Unknown'}${brandContext?.domain ? ` (${brandContext.domain})` : ''}

EMAIL CONTENT:
${sliceContext || 'No specific content'}
${favoriteContext}${userDirection}

GUIDELINES (flexible):
- Subject lines: 3-10 words typically
- Preview texts: Complement the subject, add intrigue
- VARIETY IS KEY: Mix tones (playful, urgent, curious, direct, mysterious)
- Mix structures (questions, statements, commands, teasers)
- Some with emojis, some without
- Each should feel distinctly different

Generate ${pairCount} unique subject lines and ${pairCount} unique preview texts.

Respond in JSON:
{
  "subjectLines": ["subject 1", "subject 2", ...],
  "previewTexts": ["preview 1", "preview 2", ...]
}`;

    const response = await fetchWithRetry('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Anthropic API error:', errorText);
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.content?.[0]?.text || '';
    
    console.log('Raw response:', content.substring(0, 500));

    let result = { subjectLines: [] as string[], previewTexts: [] as string[] };
    
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.pairs) {
          result = {
            subjectLines: parsed.pairs.map((p: any) => p.subjectLine),
            previewTexts: parsed.pairs.map((p: any) => p.previewText),
          };
        } else {
          result = parsed;
        }
      }
    } catch (parseErr) {
      console.error('JSON parse error:', parseErr);
      result = {
        subjectLines: Array(pairCount).fill(0).map((_, i) => `Email Subject ${i + 1}`),
        previewTexts: Array(pairCount).fill(0).map((_, i) => `Preview text ${i + 1}`),
      };
    }

    console.log(`Generated ${result.subjectLines?.length || 0} SLs, ${result.previewTexts?.length || 0} PTs`);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error in generate-email-copy:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message.includes('Rate limit') ? 429 : 500;
    
    return new Response(
      JSON.stringify({ error: message }),
      { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
