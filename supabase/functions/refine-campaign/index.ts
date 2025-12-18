import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SliceData {
  type: 'image' | 'html';
  imageUrl: string;
  htmlContent?: string;
  altText?: string;
  link?: string | null;
}

const EMAIL_HTML_RULES = `
You are an expert email HTML developer helping refine email templates.

## STRICT HTML EMAIL RULES - NEVER VIOLATE

### FORBIDDEN
- NEVER use <div> - ALWAYS use <table> and <td>
- NEVER use CSS margin - Use padding on <td> or spacer rows
- NEVER use float or display: flex/grid
- NEVER omit width/height on images

### REQUIRED
- ALWAYS use <table role="presentation"> for layout
- ALWAYS set cellpadding="0" cellspacing="0" border="0" on tables
- ALWAYS inline all styles
- ALWAYS include width and height on <img> tags
- ALWAYS add style="display: block; border: 0;" to images
- ALWAYS use 600px total width

### LOGO/SOCIAL ICONS
- Logos MUST be <img> tags with provided URLs, NEVER text
- Social icons MUST use the exact iconUrl provided (white icons from CDN)
`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      allSlices, 
      footerHtml,
      originalCampaignImageUrl, 
      conversationHistory,
      userRequest, 
      brandUrl,
      brandContext,
      isFooterMode,
      lightLogoUrl,
      darkLogoUrl,
      socialIcons
    } = await req.json();

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      console.error('ANTHROPIC_API_KEY not configured');
      return new Response(JSON.stringify({ 
        error: 'ANTHROPIC_API_KEY is not configured',
        updatedSlices: []
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const isValidImageUrl = originalCampaignImageUrl && 
      originalCampaignImageUrl.startsWith('http') && 
      !originalCampaignImageUrl.startsWith('data:');

    const hasAnyLogo = lightLogoUrl || darkLogoUrl;

    console.log('Refine campaign request:', { 
      sliceCount: allSlices?.length, 
      isFooterMode,
      hasFooter: !!footerHtml,
      hasConversationHistory: conversationHistory?.length > 0,
      conversationTurns: conversationHistory?.length || 0,
      userRequest: userRequest?.substring(0, 100),
      hasValidImage: isValidImageUrl,
      hasLogo: hasAnyLogo
    });

    // Build brand context
    const brandName = brandContext?.name || '';
    const brandWebsiteUrl = brandContext?.websiteUrl || '';
    const brandColors = brandContext?.colors || {};
    
    const colorPalette = [
      brandColors.primary ? `- Primary: ${brandColors.primary}` : null,
      brandColors.secondary ? `- Secondary: ${brandColors.secondary}` : null,
      brandColors.background ? `- Background: ${brandColors.background}` : null,
      brandColors.textPrimary ? `- Text: ${brandColors.textPrimary}` : null,
    ].filter(Boolean).join('\n');

    // Build system prompt (lean - just rules)
    const systemPrompt = `${EMAIL_HTML_RULES}

## BRAND COLORS (use EXACT values)
${colorPalette || 'Not provided'}

## RESPONSE FORMAT
Return JSON:
{
  "message": "Brief description of changes",
  "updatedSlices": [{ "index": 0, "htmlContent": "..." }],
  "updatedFooterHtml": "..." // only if footer was modified
}

Return FULL updated HTML for any modified sections.`;

    // Build messages array - CONTINUE existing conversation if provided
    const messages: any[] = [];
    
    // Check if we have existing conversation history to continue
    const existingHistory = Array.isArray(conversationHistory) ? conversationHistory : [];
    const hasExistingConversation = existingHistory.length > 0 && 
      existingHistory.some((msg: any) => msg.role && msg.content);
    
    if (hasExistingConversation) {
      // Filter to only include valid conversation messages (not the current request)
      // Skip any messages that look like our enriched context messages
      for (const msg of existingHistory) {
        if (msg.role === 'user' || msg.role === 'assistant') {
          // Skip if this is the current request (will be added below with context)
          if (msg.content === userRequest) continue;
          messages.push({ role: msg.role, content: msg.content });
        }
      }
      console.log(`Continuing conversation with ${messages.length} existing turns`);
    } else {
      // No existing conversation - add reference image as first message
      if (isValidImageUrl) {
        messages.push({
          role: 'user',
          content: [
            { type: 'image', source: { type: 'url', url: originalCampaignImageUrl } },
            { type: 'text', text: 'This is the original design to match.' }
          ]
        });
        messages.push({
          role: 'assistant',
          content: 'I can see the original design. I\'ll match this when making changes.'
        });
      }
    }

    // Build enriched user request with current context
    let enrichedRequest = `## USER REQUEST
${userRequest}

## CURRENT HTML TO MODIFY
`;

    if (isFooterMode) {
      enrichedRequest += `\`\`\`html
${footerHtml || 'No footer HTML provided'}
\`\`\``;
    } else {
      // Include all HTML slices
      const htmlSlices = (allSlices as SliceData[])?.filter(s => s.type === 'html') || [];
      if (htmlSlices.length > 0) {
        enrichedRequest += (allSlices as SliceData[])?.map((s, i) => {
          if (s.type === 'html') {
            return `### Slice ${i} (HTML)
\`\`\`html
${s.htmlContent}
\`\`\``;
          }
          return `### Slice ${i} (Image): ${s.imageUrl}`;
        }).join('\n\n');
      }
      
      if (footerHtml) {
        enrichedRequest += `

### Footer HTML
\`\`\`html
${footerHtml}
\`\`\``;
      }
    }

    // Add available assets
    if (hasAnyLogo) {
      enrichedRequest += `

## AVAILABLE LOGOS (use as <img> tags, NEVER text)
${lightLogoUrl ? `- Light logo (for dark bg): ${lightLogoUrl}` : ''}
${darkLogoUrl ? `- Dark logo (for light bg): ${darkLogoUrl}` : ''}`;
    }

    if (socialIcons?.length > 0) {
      enrichedRequest += `

## SOCIAL ICONS (use EXACT URLs)
${socialIcons.map((s: any) => `- ${s.platform}: ${s.iconUrl}`).join('\n')}`;
    }

    // Add the enriched user request
    messages.push({ role: 'user', content: enrichedRequest });

    console.log('Sending to Claude:', {
      totalMessages: messages.length,
      isFooterMode,
      hasExistingConversation
    });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8000,
        system: systemPrompt,
        messages
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Claude API error:', response.status, errorText);
      throw new Error(`Claude API error: ${response.status}`);
    }

    const data = await response.json();
    const responseText = data.content?.[0]?.text || '';
    console.log('Claude response length:', responseText.length);

    // Parse JSON response
    let result = { message: responseText, updatedSlices: [], updatedFooterHtml: null as string | null };
    
    const jsonMatch = responseText.match(/\{[\s\S]*"message"[\s\S]*\}/);
    if (jsonMatch) {
      try {
        result = JSON.parse(jsonMatch[0]);
        console.log('Parsed result:', { 
          message: result.message?.substring(0, 100),
          updatedSlicesCount: result.updatedSlices?.length,
          hasFooterUpdate: !!result.updatedFooterHtml
        });
      } catch (parseErr) {
        console.warn('Failed to parse JSON, using raw text');
      }
    }

    // Build updated conversation history to return
    const updatedConversationHistory = [
      ...messages,
      { role: 'assistant', content: responseText }
    ];

    return new Response(JSON.stringify({
      ...result,
      conversationHistory: updatedConversationHistory
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Refine campaign error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'Failed to process refinement request',
      updatedSlices: []
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
