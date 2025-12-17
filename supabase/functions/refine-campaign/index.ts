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

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const FOOTER_HTML_RULES = `
## STRICT HTML EMAIL RULES FOR FOOTERS

### FORBIDDEN (will break email rendering)
- NEVER use <div> elements - ALWAYS use <table> and <td>
- NEVER use CSS margin - Use padding on <td> or spacer rows
- NEVER use float or display: flex/grid - Use align attribute and nested tables
- NEVER omit width/height on images

### REQUIRED (for email compatibility)
- ALWAYS use <table role="presentation"> for layout
- ALWAYS set cellpadding="0" cellspacing="0" border="0" on tables
- ALWAYS inline all styles
- ALWAYS include width and height attributes on <img> tags
- ALWAYS add style="display: block; border: 0;" to images
- ALWAYS use 600px total width

### LOGO HANDLING
- If logoUrl is provided, logo MUST be an <img> tag
- NEVER render brand name as text when logo URL exists
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
      mode,
      isFooterMode,
      lightLogoUrl,
      darkLogoUrl
    } = await req.json();

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      console.error('ANTHROPIC_API_KEY not configured');
      return new Response(JSON.stringify({ 
        error: 'ANTHROPIC_API_KEY is not configured',
        message: 'API key missing - please configure ANTHROPIC_API_KEY',
        updatedSlices: []
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Validate the image URL is a real URL, not a data URL
    const isValidImageUrl = originalCampaignImageUrl && 
      originalCampaignImageUrl.startsWith('http') && 
      !originalCampaignImageUrl.startsWith('data:');

    // Determine effective logo URL for footers
    const effectiveLogoUrl = lightLogoUrl || darkLogoUrl;

    console.log('Refine campaign request:', { 
      sliceCount: allSlices?.length, 
      mode,
      isFooterMode,
      hasFooter: !!footerHtml,
      footerHtmlLength: footerHtml?.length,
      hasHistory: conversationHistory?.length > 0,
      userRequest: userRequest?.substring(0, 100),
      originalImageUrl: originalCampaignImageUrl?.substring(0, 80),
      isValidImageUrl,
      hasLogoUrl: !!effectiveLogoUrl
    });

    // Build context about the campaign
    const htmlSlices = (allSlices as SliceData[])?.filter(s => s.type === 'html') || [];
    const imageSlices = (allSlices as SliceData[])?.filter(s => s.type === 'image') || [];

    // Build system prompt with full campaign context
    const brandName = brandContext?.name || '';
    const brandDomain = brandContext?.domain || '';
    const brandWebsiteUrl = brandContext?.websiteUrl || '';

    const brandColors = brandContext?.colors || {};
    const paletteLines = [
      brandColors.primary ? `- Primary (brand blue): ${brandColors.primary}` : null,
      brandColors.secondary ? `- Secondary: ${brandColors.secondary}` : null,
      brandColors.accent ? `- Accent: ${brandColors.accent}` : null,
      brandColors.background ? `- Background: ${brandColors.background}` : null,
      brandColors.textPrimary ? `- Text primary: ${brandColors.textPrimary}` : null,
      brandColors.link ? `- Link: ${brandColors.link}` : null,
    ].filter(Boolean).join('\n');

    // Build different system prompts based on mode
    let systemPrompt: string;
    
    if (isFooterMode) {
      // Footer-only mode - focus entirely on footer HTML with strict email rules
      systemPrompt = `You are an expert email HTML developer helping refine footer templates.

${FOOTER_HTML_RULES}

## BRAND STYLE GUIDE
${brandName || brandDomain || brandWebsiteUrl ? `- Name: ${brandName || 'Not specified'}\n- Domain: ${brandDomain || 'Not specified'}\n- Website: ${brandWebsiteUrl || 'Not specified'}` : '- Not provided'}

## COLOR PALETTE (use EXACT hex values)
${paletteLines || '- Not provided'}

${effectiveLogoUrl ? `## LOGO URL (MUST USE AS <img> TAG)
Logo URL: ${effectiveLogoUrl}
CRITICAL: Always use this URL in an <img> tag. NEVER render brand name as text.
Example: <img src="${effectiveLogoUrl}" alt="${brandName || 'Logo'}" width="180" height="40" style="display: block; border: 0;">
` : ''}

## CURRENT FOOTER HTML
\`\`\`html
${footerHtml || 'No footer HTML provided'}
\`\`\`

## YOUR TASK
Refine the footer to match the reference image. Compare the current footer HTML to the reference and:
1. Match exact background colors (sample hex from reference)
2. Match exact spacing/padding (measure pixels)
3. Match typography (font sizes, weights, colors)
4. Match social icon size and spacing
5. Ensure logo is <img> tag (not text)

Maintain email-safe HTML: tables only, inline CSS, no flex/grid/div.

## RESPONSE FORMAT
{
  "message": "Brief description of changes made",
  "updatedSlices": [],
  "updatedFooterHtml": "...the complete updated footer HTML..."
}

CRITICAL: Always return the FULL updated footer HTML in updatedFooterHtml, not just changed parts.`;
    } else {
      // Campaign mode - original system prompt
      systemPrompt = `You are an expert email HTML developer helping refine campaign templates.

CAMPAIGN CONTEXT:
- Brand URL: ${brandUrl || 'Not specified'}
- Total slices: ${allSlices?.length || 0}
- HTML slices: ${htmlSlices.length}
- Image slices: ${imageSlices.length}
- Has footer: ${footerHtml ? 'Yes' : 'No'}

BRAND STYLE GUIDE (AUTHORITATIVE):
${brandName || brandDomain || brandWebsiteUrl ? `- Name: ${brandName || 'Not specified'}\n- Domain: ${brandDomain || 'Not specified'}\n- Website: ${brandWebsiteUrl || 'Not specified'}` : '- Not provided'}

COLOR PALETTE (use EXACT values; do NOT invent new shades):
${paletteLines || '- Not provided'}

COLOR RULES:
- If the user asks to "match the brand blue", "same blue", or "match the CTA blue", you MUST use the Primary color exactly (if provided).
- If Primary is not provided, keep the existing blue already present in the HTML you are editing; do not guess.

CURRENT SLICES:
${(allSlices as SliceData[])?.map((s, i) => `
Slice ${i + 1} (${s.type}):
- Image URL: ${s.imageUrl}
${s.type === 'html' ? `- HTML Content:\n\`\`\`html\n${s.htmlContent}\n\`\`\`` : `- Alt text: ${s.altText || 'Not set'}`}
${s.link ? `- Link: ${s.link}` : ''}
`).join('\n') || 'No slices'}

${footerHtml ? `CURRENT FOOTER HTML:\n\`\`\`html\n${footerHtml}\n\`\`\`\n` : ''}

YOUR TASK:
When the user requests changes to HTML slices OR the footer, provide the updated HTML.
Maintain email-safe HTML: use tables, inline CSS, no flex/grid.
Keep the existing structure and only modify what's requested.

FOOTER MODIFICATION EXAMPLES:
- "change footer background to blue" → Update background-color in footer HTML
- "make footer text larger" → Update font-size in footer styles
- "remove social icons from footer" → Remove the social icons section

RESPONSE FORMAT:
Return your response in this JSON format:
{
  "message": "Brief description of changes made",
  "updatedSlices": [
    { "index": 0, "htmlContent": "..." }
  ],
  "updatedFooterHtml": "..." // Only include if footer was modified
}

Only include slices in updatedSlices that you actually modified.
Only include updatedFooterHtml if you actually modified the footer.
If no changes are needed, return empty arrays/null.`;
    }

    // Build messages array with conversation history
    const messages = [];

    // Add original design image for context (only if it's a valid URL)
    if (isValidImageUrl) {
      console.log('Adding original image to context:', originalCampaignImageUrl);
      messages.push({
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'url',
              url: originalCampaignImageUrl,
            }
          },
          {
            type: 'text',
            text: isFooterMode 
              ? 'This is the reference footer design that the HTML should match pixel-perfectly.'
              : 'This is the original campaign design that the HTML should match.'
          }
        ]
      });
      messages.push({
        role: 'assistant',
        content: isFooterMode
          ? 'I can see the reference footer design. I\'ll analyze the exact colors, spacing, typography, and layout to ensure the HTML matches pixel-perfectly.'
          : 'I can see the original campaign design. I\'ll use this as reference to ensure the HTML matches the visual styling, colors, spacing, and typography.'
      });
    } else {
      console.warn('No valid image URL provided, skipping image context');
    }

    // Add conversation history (excluding the current request which comes next)
    const historyWithoutLast = (conversationHistory as ChatMessage[])?.slice(0, -1) || [];
    for (const msg of historyWithoutLast) {
      messages.push({
        role: msg.role,
        content: msg.content
      });
    }

    // Add the current request
    messages.push({
      role: 'user',
      content: userRequest
    });

    console.log('Sending to Claude with', messages.length, 'messages, isFooterMode:', isFooterMode);

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

    // Try to parse JSON response
    let result = { message: responseText, updatedSlices: [], updatedFooterHtml: null as string | null };
    
    // Look for JSON in the response
    const jsonMatch = responseText.match(/\{[\s\S]*"message"[\s\S]*\}/);
    if (jsonMatch) {
      try {
        result = JSON.parse(jsonMatch[0]);
        console.log('Parsed JSON result:', { 
          message: result.message?.substring(0, 100),
          updatedSlicesCount: result.updatedSlices?.length,
          hasFooterUpdate: !!result.updatedFooterHtml,
          footerUpdateLength: result.updatedFooterHtml?.length
        });
      } catch (parseErr) {
        console.warn('Failed to parse JSON from response, using raw text');
      }
    }

    return new Response(JSON.stringify(result), {
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
