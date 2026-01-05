import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { currentHtml, userRequest, originalImageUrl, brandUrl } = await req.json();

    if (!currentHtml || !userRequest) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: currentHtml and userRequest' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    console.log('Refining HTML based on user request:', userRequest);

    const systemPrompt = `You are an expert email HTML developer. Your job is to modify email HTML based on user requests.

CRITICAL RULES:
- Only return the modified HTML, nothing else
- Keep all HTML valid for email clients (tables, inline styles only)
- Preserve the overall structure unless explicitly asked to change it
- Use inline CSS only - no external stylesheets
- Keep the HTML email-safe: use tables for layout, web-safe fonts
- Make targeted, precise changes based on the request

STYLE GUIDELINES:
- Font family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif
- Standard body text: 17px, line-height 26px
- CTA buttons: full width, 18px vertical padding, bold text
- Colors should match the existing design unless asked to change`;

    const userPrompt = `Current HTML:
\`\`\`html
${currentHtml}
\`\`\`

User request: "${userRequest}"

${originalImageUrl ? `The original design image is provided for reference. Try to match its styling.` : ''}
${brandUrl ? `Brand URL for context: ${brandUrl}` : ''}

Apply the requested change and return ONLY the updated HTML code. No explanations.`;

    const messages: any[] = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: originalImageUrl
          ? [
              { type: 'text', text: userPrompt },
              { type: 'image_url', image_url: { url: originalImageUrl } },
            ]
          : userPrompt,
      },
    ];

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', response.status, errorText);
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    let htmlContent = data.choices?.[0]?.message?.content || '';

    // Clean up the response - remove markdown code blocks if present
    htmlContent = htmlContent
      .replace(/^```html\n?/i, '')
      .replace(/^```\n?/i, '')
      .replace(/\n?```$/i, '')
      .trim();

    console.log('HTML refined successfully');

    return new Response(
      JSON.stringify({
        htmlContent,
        message: 'Changes applied successfully!',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in refine-slice-html:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to refine HTML';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
