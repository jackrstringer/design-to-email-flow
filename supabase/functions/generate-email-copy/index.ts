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
    const { slices, brandContext, existingFavorites, subjectCount = 10, previewCount = 10 } = await req.json();
    
    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    console.log(`Generating ${subjectCount} subject lines and ${previewCount} preview texts for ${brandContext?.name || 'brand'}`);

    // Build context from slices
    const sliceContext = (slices || [])
      .map((s: any, i: number) => `Section ${i + 1}: ${s.altText || 'No description'}${s.link ? ` (links to: ${s.link})` : ''}`)
      .join('\n');

    // Build favorites context
    const favoriteSubjects = (existingFavorites || [])
      .filter((f: any) => f.type === 'subject')
      .map((f: any) => f.text);
    const favoritePreviews = (existingFavorites || [])
      .filter((f: any) => f.type === 'preview')
      .map((f: any) => f.text);

    const favoriteContext = favoriteSubjects.length > 0 || favoritePreviews.length > 0
      ? `\n\nThe user has favorited these options - generate NEW variations that match their style and tone:
${favoriteSubjects.length > 0 ? `Favorite subject lines:\n${favoriteSubjects.map((s: string) => `- "${s}"`).join('\n')}` : ''}
${favoritePreviews.length > 0 ? `Favorite preview texts:\n${favoritePreviews.map((s: string) => `- "${s}"`).join('\n')}` : ''}`
      : '';

    const prompt = `You are an expert email copywriter. Generate engaging email subject lines and preview texts for this email campaign.

BRAND: ${brandContext?.name || 'Unknown brand'}${brandContext?.domain ? ` (${brandContext.domain})` : ''}

EMAIL CONTENT SECTIONS:
${sliceContext || 'No specific content provided'}
${favoriteContext}

REQUIREMENTS:
- Subject lines should be 4-8 words, attention-grabbing, create curiosity or urgency
- Preview texts should be 8-15 words, complement the subject line, provide additional context
- Mix styles: some with emojis (1-2 max), some without
- Vary the tone: some playful, some direct, some curious
- Be brand-appropriate
- DO NOT use generic phrases like "Don't miss out" or "Limited time"

Generate EXACTLY ${subjectCount} subject lines and ${previewCount} preview texts.

Respond in this exact JSON format:
{
  "subjectLines": ["subject 1", "subject 2", ...],
  "previewTexts": ["preview 1", "preview 2", ...]
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
    let result = { subjectLines: [] as string[], previewTexts: [] as string[] };
    
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
        subjectLines: Array(subjectCount).fill(0).map((_, i) => `Email Campaign Subject ${i + 1}`),
        previewTexts: Array(previewCount).fill(0).map((_, i) => `Preview text for your email campaign ${i + 1}`),
      };
    }

    console.log(`Generated ${result.subjectLines?.length || 0} subjects and ${result.previewTexts?.length || 0} previews`);

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
