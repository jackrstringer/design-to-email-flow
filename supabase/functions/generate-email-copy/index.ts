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
    const { slices, brandContext, existingFavorites, pairCount = 10 } = await req.json();
    
    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    console.log(`Generating ${pairCount} SL/PT pairs for ${brandContext?.name || 'brand'}`);

    // Build context from slices
    const sliceContext = (slices || [])
      .map((s: any, i: number) => `Section ${i + 1}: ${s.altText || 'No description'}${s.link ? ` (links to: ${s.link})` : ''}`)
      .join('\n');

    // Build favorites context - now expecting pairs
    const favoritePairs = (existingFavorites || [])
      .filter((f: any) => f.subjectLine && f.previewText)
      .map((f: any) => `- Subject: "${f.subjectLine}" | Preview: "${f.previewText}"`);

    const favoriteContext = favoritePairs.length > 0
      ? `\n\nThe user has favorited these SL/PT pairs - generate NEW pairs that match their style and tone:
${favoritePairs.join('\n')}`
      : '';

    const prompt = `You are an expert email copywriter. Generate engaging email subject line and preview text PAIRS for this email campaign. Each pair should work together harmoniously.

BRAND: ${brandContext?.name || 'Unknown brand'}${brandContext?.domain ? ` (${brandContext.domain})` : ''}

EMAIL CONTENT SECTIONS:
${sliceContext || 'No specific content provided'}
${favoriteContext}

REQUIREMENTS:
- Subject lines should be 4-8 words, attention-grabbing, create curiosity or urgency
- Preview texts should be 8-15 words, COMPLEMENT the subject line, provide additional context
- Each pair should feel like they belong together - the preview text should extend or tease what the subject line promises
- Mix styles: some with emojis (1-2 max), some without
- Vary the tone: some playful, some direct, some curious
- Be brand-appropriate
- DO NOT use generic phrases like "Don't miss out" or "Limited time"

Generate EXACTLY ${pairCount} subject line + preview text pairs.

Respond in this exact JSON format:
{
  "pairs": [
    { "subjectLine": "subject 1", "previewText": "preview text that complements subject 1" },
    { "subjectLine": "subject 2", "previewText": "preview text that complements subject 2" }
  ]
}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
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
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.content?.[0]?.text || '';
    
    console.log('Raw response:', content.substring(0, 500));

    // Parse JSON from response
    let result = { pairs: [] as Array<{ subjectLine: string; previewText: string }> };
    
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      }
    } catch (parseErr) {
      console.error('JSON parse error:', parseErr);
      // Fallback: generate simple defaults
      result = {
        pairs: Array(pairCount).fill(0).map((_, i) => ({
          subjectLine: `Email Campaign Subject ${i + 1}`,
          previewText: `Preview text for your email campaign ${i + 1}`,
        })),
      };
    }

    console.log(`Generated ${result.pairs?.length || 0} pairs`);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error in generate-email-copy:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
