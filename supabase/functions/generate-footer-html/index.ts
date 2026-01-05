import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EMAIL_FOOTER_RULES = `
You are an expert email HTML developer that converts footer designs into pixel-perfect HTML code for email templates.

## STRICT HTML EMAIL RULES - NEVER VIOLATE

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

### BACKGROUND COLOR PLACEMENT (CRITICAL)
- Background color MUST be on the INNER 600px table, NOT the outer wrapper
- Outer 100% width table: background-color: #ffffff
- Inner 600px table: background-color: {ACTUAL_FOOTER_COLOR}

### BASE TEMPLATE STRUCTURE
\`\`\`html
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff;">
  <tr>
    <td align="center">
      <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td><![endif]-->
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; background-color: {BG_COLOR};">
        {LOGO_ROW}
        {NAV_ROWS}
        {SOCIAL_ROW}
        {LEGAL_ROW}
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td>
  </tr>
</table>
\`\`\`

Return ONLY the HTML code, no explanation or markdown formatting.
`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      referenceImageUrl, 
      logoUrl, 
      lightLogoUrl,
      darkLogoUrl,
      socialIcons, 
      brandName, 
      brandColors,
      websiteUrl,
      allLinks
    } = await req.json();

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    // Set up SSE streaming
    const encoder = new TextEncoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();

    const sendEvent = async (data: object) => {
      await writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
    };

    // Start processing in background
    (async () => {
      try {
        // Build brand website URL
        const brandWebsiteUrl = websiteUrl || `https://${brandName?.toLowerCase().replace(/\s+/g, '')}.com`;
        
        // Build color palette description
        const colorPalette = brandColors 
          ? `- Primary: ${brandColors.primary || '#ffffff'}
- Secondary: ${brandColors.secondary || '#888888'}
- Background: ${brandColors.background || '#111111'}
- Text: ${brandColors.textPrimary || '#ffffff'}`
          : 'Use dark background (#111111) with white text (#ffffff)';

        // Build social icons section
        const socialIconsSection = socialIcons?.length 
          ? `## SOCIAL ICONS - USE EXACT URLs PROVIDED
${socialIcons.map((s: any) => `- ${s.platform}: Link to ${s.url}, Icon: ${s.iconUrl}
  HTML: <td style="padding: 0 8px;"><a href="${s.url}" target="_blank"><img src="${s.iconUrl}" alt="${s.platform}" width="32" height="32" style="display: block; border: 0;"></a></td>`).join('\n')}`
          : 'No social icons provided.';

        // Build logo section
        const hasAnyLogo = logoUrl || lightLogoUrl || darkLogoUrl;
        const logoSection = hasAnyLogo ? `## LOGO ASSETS (MUST USE AS <img> TAG)
${lightLogoUrl ? `- Light/White logo (for dark backgrounds): ${lightLogoUrl}` : ''}
${darkLogoUrl ? `- Dark/Black logo (for light backgrounds): ${darkLogoUrl}` : ''}
${logoUrl && !lightLogoUrl && !darkLogoUrl ? `- Logo: ${logoUrl}` : ''}

Logo MUST be an <img> tag. NEVER render brand name as text.
Select logo based on background luminance (dark bg = light logo, light bg = dark logo).` 
          : 'No logo provided.';

        // Navigation links
        const navSection = allLinks?.length
          ? `## NAVIGATION LINKS
${allLinks.slice(0, 10).map((link: string) => `- ${link}`).join('\n')}`
          : '';

        // Build initial user prompt
        const initialPrompt = `Create an email footer for "${brandName || 'Brand'}" with these specifications:

${logoSection}

${socialIconsSection}

${navSection}

## COLORS
${colorPalette}

## REQUIREMENTS
- Total width: 600px
- Table-based layout only
- All styles inline
- Logo links to: ${brandWebsiteUrl}
- All social icons clickable with real URLs

${referenceImageUrl ? `## REFERENCE IMAGE PROVIDED
Match the reference design pixel-perfectly:
- Exact background color
- Exact spacing/padding
- Exact typography
- Social icon size and spacing
BUT: Always use provided logo URL as <img>, not text.` : `## NO REFERENCE
Create a professional dark footer with centered layout.`}`;

        // Build initial message content with images
        const initialContent: any[] = [];
        
        // Show logo images first
        if (lightLogoUrl || darkLogoUrl) {
          initialContent.push({ type: 'text', text: '## LOGO IMAGES (use as <img> tags)\n' });
          if (lightLogoUrl) {
            initialContent.push({ type: 'image', source: { type: 'url', url: lightLogoUrl } });
            initialContent.push({ type: 'text', text: `↑ Light logo: ${lightLogoUrl}` });
          }
          if (darkLogoUrl) {
            initialContent.push({ type: 'image', source: { type: 'url', url: darkLogoUrl } });
            initialContent.push({ type: 'text', text: `↑ Dark logo: ${darkLogoUrl}` });
          }
        }
        
        // Add reference image
        if (referenceImageUrl) {
          initialContent.push({ type: 'image', source: { type: 'url', url: referenceImageUrl } });
          initialContent.push({ type: 'text', text: '↑ Reference design to match' });
        }
        
        initialContent.push({ type: 'text', text: initialPrompt });

        // Initialize conversation history - this will be built up and returned
        const conversationHistory: any[] = [];
        
        console.log('Starting footer generation for:', brandName, {
          hasReference: !!referenceImageUrl,
          hasLightLogo: !!lightLogoUrl,
          hasDarkLogo: !!darkLogoUrl,
          socialIconsCount: socialIcons?.length || 0
        });

        await sendEvent({ status: 'generating', message: 'Generating footer...' });

        // PHASE 1: Initial Generation
        conversationHistory.push({ role: 'user', content: initialContent });
        
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-opus-4-1-20250805',
            max_tokens: 16000,
            thinking: {
              type: 'enabled',
              budget_tokens: 10000,
            },
            system: EMAIL_FOOTER_RULES,
            messages: conversationHistory,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Anthropic API error:', response.status, errorText);
          throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        // Extended thinking returns multiple content blocks - find the text one
        let html = '';
        for (const block of data.content || []) {
          if (block.type === 'text') {
            html = block.text;
            break;
          }
        }
        html = html.replace(/```html\n?/g, '').replace(/```\n?/g, '').trim();

        // Add assistant response to conversation
        conversationHistory.push({ role: 'assistant', content: html });

        console.log('Initial footer generated, length:', html.length);
        await sendEvent({ status: 'generated', message: 'Initial footer generated' });

        // PHASE 2: Auto-refinement loop (only if reference image provided)
        if (referenceImageUrl) {
          const MAX_REFINEMENTS = 2;
          let lastValidationIssue = '';
          
          for (let i = 0; i < MAX_REFINEMENTS; i++) {
            const iteration = i + 1;
            console.log(`Auto-refinement iteration ${iteration}/${MAX_REFINEMENTS}`);
            await sendEvent({ 
              status: 'validating', 
              iteration, 
              maxIterations: MAX_REFINEMENTS,
              message: `Validating (${iteration}/${MAX_REFINEMENTS})...` 
            });
            
            // Continue conversation with validation request
            const validationRequest = `Now validate the footer you just generated against the reference image.

Compare pixel-by-pixel:
1. Background color - exact hex match?
2. Spacing/padding - exact pixels?
3. Typography - font sizes, colors?
4. Social icons - size, spacing?
5. Is logo an <img> tag? (this is correct)

If >98% match, respond with just "MATCH_GOOD".
Otherwise list ALL discrepancies with specific fixes needed.`;

            conversationHistory.push({ role: 'user', content: validationRequest });

            const validateResponse = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01',
              },
              body: JSON.stringify({
                model: 'claude-opus-4-1-20250805',
                max_tokens: 8000,
                thinking: {
                  type: 'enabled',
                  budget_tokens: 6000,
                },
                system: EMAIL_FOOTER_RULES,
                messages: conversationHistory,
              }),
            });

            if (!validateResponse.ok) {
              console.error('Validation API error, skipping refinement');
              break;
            }

            const validateData = await validateResponse.json();
            // Extended thinking returns multiple content blocks - find the text one
            let validationResult = '';
            for (const block of validateData.content || []) {
              if (block.type === 'text') {
                validationResult = block.text;
                break;
              }
            }
            
            conversationHistory.push({ role: 'assistant', content: validationResult });

            if (validationResult.includes('MATCH_GOOD')) {
              console.log('Validation passed - footer matches reference');
              await sendEvent({ status: 'matched', message: 'Pixel-perfect match achieved!' });
              break;
            }

            // Early exit if same issue found twice
            const issueHash = validationResult.substring(0, 200);
            if (issueHash === lastValidationIssue) {
              console.log('Same issues found twice, stopping refinement');
              await sendEvent({ status: 'stopped', message: 'Refinement complete' });
              break;
            }
            lastValidationIssue = issueHash;

            console.log('Discrepancies found, refining...');
            await sendEvent({ 
              status: 'refining', 
              iteration, 
              maxIterations: MAX_REFINEMENTS,
              message: `Refining (${iteration}/${MAX_REFINEMENTS})...` 
            });
            
            // Continue conversation with refinement request
            const refineRequest = `Fix ALL the issues you just identified. Generate the corrected HTML.

Remember:
- Logo MUST be an <img> tag with the URL provided earlier
- Background color on inner 600px table, not outer wrapper
- All styles inline
- Tables only, no div/margin/flex

Return only the corrected HTML.`;

            conversationHistory.push({ role: 'user', content: refineRequest });

            const refineResponse = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01',
              },
              body: JSON.stringify({
                model: 'claude-opus-4-1-20250805',
                max_tokens: 16000,
                thinking: {
                  type: 'enabled',
                  budget_tokens: 10000,
                },
                system: EMAIL_FOOTER_RULES,
                messages: conversationHistory,
              }),
            });

            if (!refineResponse.ok) {
              console.error('Refinement API error, using current HTML');
              break;
            }

            const refineData = await refineResponse.json();
            // Extended thinking returns multiple content blocks - find the text one
            let refinedHtml = '';
            for (const block of refineData.content || []) {
              if (block.type === 'text') {
                refinedHtml = block.text;
                break;
              }
            }
            
            if (refinedHtml) {
              html = refinedHtml.replace(/```html\n?/g, '').replace(/```\n?/g, '').trim();
              conversationHistory.push({ role: 'assistant', content: html });
              console.log(`Refinement ${iteration} complete`);
            }
          }
        }

        console.log('Footer generation complete, conversation turns:', conversationHistory.length);
        
        // Return just the HTML - refinements will reconstruct context inline
        await sendEvent({ 
          status: 'complete', 
          html,
          message: 'Footer generated. You can refine via chat.'
        });
        
      } catch (error) {
        console.error('Error in stream:', error);
        await sendEvent({ 
          status: 'error', 
          error: error instanceof Error ? error.message : 'Failed to generate footer' 
        });
      } finally {
        await writer.close();
      }
    })();

    return new Response(stream.readable, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Error generating footer:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Failed to generate footer' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
