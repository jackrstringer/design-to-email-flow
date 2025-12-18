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
      darkLogoUrl,
      socialIcons
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

    // Check if any logo is available
    const hasAnyLogo = lightLogoUrl || darkLogoUrl;

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
      hasLightLogo: !!lightLogoUrl,
      hasDarkLogo: !!darkLogoUrl
    });

    // Build context about the campaign
    const htmlSlices = (allSlices as SliceData[])?.filter(s => s.type === 'html') || [];
    const imageSlices = (allSlices as SliceData[])?.filter(s => s.type === 'image') || [];
    const htmlSliceIndices = (allSlices as SliceData[])?.map((s, i) => s.type === 'html' ? i : -1).filter(i => i !== -1) || [];

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

${hasAnyLogo ? `## PRE-CONSTRUCTED LOGO IMG TAGS - COPY EXACTLY

**CRITICAL**: You MUST use ONE of these EXACT img tags. Copy-paste it exactly. DO NOT render the brand name as text under ANY circumstances.

${lightLogoUrl ? `### LIGHT/WHITE LOGO (for DARK backgrounds):
\`\`\`html
<a href="${brandWebsiteUrl || '#'}" target="_blank" style="text-decoration: none;">
  <img src="${lightLogoUrl}" alt="${brandName || 'Logo'}" width="180" style="display: block; border: 0; height: auto; max-width: 100%;">
</a>
\`\`\`` : ''}

${darkLogoUrl ? `### DARK/BLACK LOGO (for LIGHT backgrounds):
\`\`\`html
<a href="${brandWebsiteUrl || '#'}" target="_blank" style="text-decoration: none;">
  <img src="${darkLogoUrl}" alt="${brandName || 'Logo'}" width="180" style="display: block; border: 0; height: auto; max-width: 100%;">
</a>
\`\`\`` : ''}

### LOGO RULES (NON-NEGOTIABLE):
1. If footer background is DARK → copy the LIGHT LOGO img tag above EXACTLY
2. If footer background is LIGHT → copy the DARK LOGO img tag above EXACTLY
3. COPY THE IMG TAG EXACTLY - only adjust width if needed (keep height: auto)
4. NEVER TYPE THE BRAND NAME AS TEXT - the logo MUST be an <img> element
5. Even if the reference image shows text, REPLACE IT with the img tag above
6. This is NON-NEGOTIABLE - text logos are FORBIDDEN when img URLs are provided
` : ''}

${(socialIcons && Array.isArray(socialIcons) && socialIcons.length > 0) ? `## PRE-CONSTRUCTED SOCIAL ICON HTML - COPY EXACTLY

**CRITICAL**: Use these EXACT <img> URLs from Simple Icons CDN. Do NOT use any other icon sources or brand colors.

${socialIcons.map((s: any) => `### ${(s.platform || '').toUpperCase()}
Link URL: ${s.url}
EXACT HTML TO USE:
\`\`\`html
<td style="padding: 0 8px;">
  <a href="${s.url}" target="_blank" style="text-decoration: none;">
    <img src="${s.iconUrl}" alt="${s.platform}" width="32" height="32" style="display: block; border: 0;">
  </a>
</td>
\`\`\``).join('\n\n')}

### SOCIAL ICON RULES (NON-NEGOTIABLE):
1. Use the EXACT iconUrl values above (white icons from cdn.simpleicons.org)
2. Do NOT use brand-colored icons (no orange Instagram, no blue Facebook)
3. All icons MUST be white (#ffffff) to match dark footer backgrounds
4. Copy the HTML structure EXACTLY - only adjust width/height if needed
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

Maintain email-safe HTML: tables only, inline CSS, no flex/grid.

## RESPONSE FORMAT
{
  "message": "Brief description of changes made",
  "updatedSlices": [],
  "updatedFooterHtml": "...the complete updated footer HTML..."
}

CRITICAL: Always return the FULL updated footer HTML in updatedFooterHtml, not just changed parts.`;
    } else {
      // Campaign mode - updated with multi-slice context and style consistency
      
      // Build the campaign structure description
      const structureDescription = (allSlices as SliceData[])?.map((s, i) => {
        const totalSlices = (allSlices as SliceData[]).length;
        const percentPosition = Math.round((i / totalSlices) * 100);
        const percentEnd = Math.round(((i + 1) / totalSlices) * 100);
        return `- Section ${i + 1}: ${s.type.toUpperCase()} (${percentPosition}%-${percentEnd}% of design)`;
      }).join('\n') || 'No slices';
      
      systemPrompt = `You are an expert email HTML developer helping refine campaign templates.

## CAMPAIGN STRUCTURE
This email campaign consists of ${(allSlices as SliceData[])?.length || 0} vertical sections stacked together:
${structureDescription}
${footerHtml ? '- FOOTER: HTML footer at the bottom' : ''}

The sections are stacked VERTICALLY to form the complete email. The original design image shows ALL sections together.

## HTML SLICES IN THIS CAMPAIGN
${htmlSlices.length > 0 ? `There are ${htmlSlices.length} HTML section(s) at position(s): ${htmlSliceIndices.map(i => `Section ${i + 1}`).join(', ')}` : 'No HTML slices'}

## CRITICAL: STYLE CONSISTENCY ACROSS ALL HTML SECTIONS
${htmlSlices.length > 1 ? `
**IMPORTANT**: This campaign has MULTIPLE HTML sections (${htmlSlices.length} total). They MUST be styled consistently:

1. **IDENTICAL TYPOGRAPHY** across all HTML sections:
   - Same font-family (use web-safe stack)
   - Same font-sizes for equivalent elements (body text, headings, etc.)
   - Same line-heights and letter-spacing

2. **IDENTICAL COLOR PALETTE**:
   - Button colors must match exactly between sections
   - Text colors must be consistent
   - Background colors should follow the same scheme

3. **IDENTICAL COMPONENT STYLING**:
   - Buttons must have the same width, padding, border-radius, colors
   - Links styled identically
   - Spacing patterns (padding, gaps) should be consistent

4. **HOLISTIC COMPARISON**:
   - Compare the ENTIRE rendered email (all sections stacked) to the ENTIRE original design
   - Changes to one HTML section may require matching changes to other HTML sections
   - Ensure visual continuity between sections
` : ''}

## BRAND STYLE GUIDE (AUTHORITATIVE)
${brandName || brandDomain || brandWebsiteUrl ? `- Name: ${brandName || 'Not specified'}\n- Domain: ${brandDomain || 'Not specified'}\n- Website: ${brandWebsiteUrl || 'Not specified'}` : '- Not provided'}

## COLOR PALETTE (use EXACT values; do NOT invent new shades)
${paletteLines || '- Not provided'}

COLOR RULES:
- If the user asks to "match the brand blue", "same blue", or "match the CTA blue", you MUST use the Primary color exactly (if provided).
- If Primary is not provided, keep the existing blue already present in the HTML you are editing; do not guess.

## CURRENT SLICES
${(allSlices as SliceData[])?.map((s, i) => `
Slice ${i + 1} (${s.type}):
- Image URL: ${s.imageUrl}
${s.type === 'html' ? `- HTML Content:\n\`\`\`html\n${s.htmlContent}\n\`\`\`` : `- Alt text: ${s.altText || 'Not set'}`}
${s.link ? `- Link: ${s.link}` : ''}
`).join('\n') || 'No slices'}

${footerHtml ? `CURRENT FOOTER HTML:\n\`\`\`html\n${footerHtml}\n\`\`\`\n` : ''}

## YOUR TASK
When the user requests changes to HTML slices OR the footer:
1. Analyze the ENTIRE campaign as a whole (all slices stacked vertically)
2. Compare to the original design image
3. Make changes that maintain style consistency across ALL HTML sections
4. Provide updated HTML for ALL sections that need changes (not just one)

Maintain email-safe HTML: use tables, inline CSS, no flex/grid.

## RESPONSE FORMAT
Return your response in this JSON format:
{
  "message": "Brief description of changes made",
  "updatedSlices": [
    { "index": 0, "htmlContent": "..." },
    { "index": 2, "htmlContent": "..." }
  ],
  "updatedFooterHtml": "...",
  "styleConsistencyNotes": "All sections now use consistent 17px body text, #XXXX buttons..."
}

**IMPORTANT**: Return ALL HTML slices that need updates for consistency, not just the one mentioned.
Only include updatedFooterHtml if you actually modified the footer.
If no changes are needed, return empty arrays/null.`;
    }

    // Build messages array with conversation history
    const messages = [];

    // CRITICAL: First show Claude the actual logo images so it knows what they look like
    if (hasAnyLogo) {
      const logoContent: any[] = [
        { type: 'text', text: '## BRAND LOGO IMAGES\n\nThese are the actual logo images you MUST use (as <img> tags, NOT text):' }
      ];
      
      if (lightLogoUrl) {
        logoContent.push({
          type: 'image',
          source: { type: 'url', url: lightLogoUrl }
        });
        logoContent.push({ type: 'text', text: `↑ LIGHT/WHITE LOGO - URL: ${lightLogoUrl} (use for dark backgrounds)` });
      }
      
      if (darkLogoUrl) {
        logoContent.push({
          type: 'image',
          source: { type: 'url', url: darkLogoUrl }
        });
        logoContent.push({ type: 'text', text: `↑ DARK/BLACK LOGO - URL: ${darkLogoUrl} (use for light backgrounds)` });
      }
      
      messages.push({ role: 'user', content: logoContent });
      messages.push({ 
        role: 'assistant', 
        content: 'I can see the brand logo images. I will COPY the exact <img> tag from the system prompt. I will NEVER render the brand name as text - even if the reference shows text, I will replace it with the img tag.' 
      });
    }

    // Note: Social icons passed as text in system prompt - CDN URLs can't be downloaded by Claude API

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
              ? 'This is the reference footer design. WARNING: If this shows brand name as TEXT (styled typography), you MUST COMPLETELY IGNORE that. Copy the exact <img> tag from the system prompt instead. The brand name must ONLY appear as an <img> element, NEVER as text.'
              : 'This is the original campaign design that the HTML should match.'
          }
        ]
      });
      messages.push({
        role: 'assistant',
        content: isFooterMode
          ? 'I understand. I will COPY the exact <img> tag from the system prompt for the logo. Even though the reference shows text, I will REPLACE it with the img tag. I will match layout, colors, and spacing from the reference but the logo MUST be an <img> element.'
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
