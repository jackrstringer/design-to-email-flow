import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

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
    const { slices, brandContext, existingFavorites, pairCount = 10, refinementPrompt, copyExamples } = await req.json();
    
    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    const hasCopyExamples = copyExamples?.subjectLines?.length > 0 || copyExamples?.previewTexts?.length > 0;
    console.log(`Generating ${pairCount} SL/PT for ${brandContext?.name || 'brand'} (${brandContext?.domain || 'no domain'})${hasCopyExamples ? ` with ${copyExamples.subjectLines?.length || 0} SL examples` : ''}${refinementPrompt ? ` | direction: "${refinementPrompt}"` : ''}`);

    // Check if alt texts are generic (fallback values from failed analysis)
    const hasGenericAltTexts = (slices || []).every((s: any) => 
      !s.altText || s.altText.match(/^Email section \d+$/) || s.altText === 'No description'
    );

    // Build slice context - if alt texts are generic but we have image URLs, note that
    let sliceContext = '';
    const sliceImages: Array<{ type: string; source: { type: string; media_type: string; url: string } }> = [];

    if (hasGenericAltTexts && slices?.length > 0) {
      console.log('Alt texts are generic, will use vision to analyze images');
      // Collect image URLs for vision analysis (limit to first 3 to avoid token limits)
      for (let i = 0; i < Math.min(slices.length, 3); i++) {
        const slice = slices[i];
        if (slice.imageUrl) {
          sliceImages.push({
            type: 'image',
            source: {
              type: 'url',
              media_type: 'image/png',
              url: slice.imageUrl
            }
          });
        }
      }
      sliceContext = 'See the email section images below for content context.';
    } else {
      sliceContext = (slices || [])
        .map((s: any, i: number) => `Section ${i + 1}: ${s.altText || 'No description'}${s.link ? ` (links to: ${s.link})` : ''}`)
        .join('\n');
    }

    // Extract link context even if alt texts are generic
    const linkContext = (slices || [])
      .filter((s: any) => s.link)
      .map((s: any) => s.link)
      .join(', ');

    const favoriteSLs = (existingFavorites?.subjectLines || []).filter((s: string) => s).map((s: string) => `- "${s}"`);
    const favoritePTs = (existingFavorites?.previewTexts || []).filter((p: string) => p).map((p: string) => `- "${p}"`);

    let favoriteContext = '';
    if (favoriteSLs.length > 0) favoriteContext += `\n\nFavorited subject lines (match this style):\n${favoriteSLs.join('\n')}`;
    if (favoritePTs.length > 0) favoriteContext += `\n\nFavorited preview texts (match this style):\n${favoritePTs.join('\n')}`;

    const userDirection = refinementPrompt 
      ? `\n\nUSER'S REQUEST: "${refinementPrompt}"\nFollow this direction for tone, style, or focus.`
      : '';

    // Build brand voice examples section ONLY if we have real examples
    let brandVoiceSection = '';
    const hasSLExamples = copyExamples?.subjectLines?.length > 0;
    const hasPTExamples = copyExamples?.previewTexts?.length > 0;
    
    if (hasSLExamples || hasPTExamples) {
      brandVoiceSection = `
## BRAND VOICE EXAMPLES - MATCH THIS EXACT STYLE:
${hasSLExamples ? `
Past subject lines from this brand:
${copyExamples.subjectLines.slice(0, 20).map((s: string) => `- "${s}"`).join('\n')}` : ''}
${hasPTExamples ? `

Past preview texts from this brand:
${copyExamples.previewTexts.slice(0, 20).map((p: string) => `- "${p}"`).join('\n')}` : ''}
`;
    }
    // If no examples exist, brandVoiceSection stays empty and won't be included in prompt

    const textPrompt = `You are an expert email copywriter for ${brandContext?.name || 'a brand'}. Generate subject lines and preview texts that drive opens without sacrificing trust, clarity, or brand integrity.

${brandVoiceSection}

## EMAIL CONTENT BEING SENT:
${sliceContext || 'No specific content provided'}
${linkContext ? `Links in email: ${linkContext}` : ''}
${sliceImages.length > 0 ? 'Analyze the email section images provided to understand the products, offers, or message being sent.' : ''}
${favoriteContext}${userDirection}

## SUBJECT LINE PRINCIPLES (follow these strictly):

### 1. CLARITY BEATS CLEVERNESS
- Reader should understand the general intent from subject line alone
- If it could apply to any brand or any email, it's weak
- GOOD: "Your order is on the way", "Last day for free express shipping", "Meet the new Denner 2.0"
- BAD: "You won't believe this...", "This changed everything", "We need to talk"

### 2. SPECIFICITY WINS
- Specific always beats vague
- STRONGER: "Free express shipping ends tonight", "Why filtered water matters for hair health"
- WEAKER: "Last chance", "You need to see this", "Big news"

### 3. URGENCY MUST BE REAL
- Only use urgency if it's defensible (sale ending, limited inventory, shipping cutoff)
- Never fake urgency - it destroys trust
- REAL: "Sale ending", "Pre-orders close tonight"
- FAKE: "Ending soon" when it runs all week

### 4. MATCH INTENT TO CONTENT
- Promotional email → clearly communicate offer or urgency
- Product launch → name the product or indicate newness
- Educational → signal learning, insight, value
- Brand storytelling → reflect narrative, not urgency bait

### 5. SUBJECT LINE FORMATS TO USE:
- Communicate a real incentive (offer, value, access)
- Signal relevance (for you, for your problem)
- Create honest curiosity (without manipulation)
- Reinforce brand positioning

## PREVIEW TEXT PRINCIPLES:

### Preview text MUST:
- Add NEW information (never repeat the subject line)
- Strengthen the value proposition
- Clarify what the email is about
- Support the click decision

### STRONG PAIRINGS:
- SL: "Up to 25% off ends tonight" → PT: "Free express shipping included"
- SL: "New: The Denner 2.0" → PT: "Refined design, improved structure"

### WEAK PAIRINGS TO AVOID:
- SL: "Don't miss this" → PT: "Something exciting is inside"
- Repeating the subject line
- Generic: "Open for surprise", "You won't want to miss this"

## QUALITY CHECKLIST (each line must pass ALL):
✓ Is this clear?
✓ Is this accurate to the email content?
✓ Does this feel like the brand?
✓ Is there real value communicated?
✓ Would a subscriber trust this?

## MISTAKES TO AVOID:
- Mystery hooks ("Wait until you see this")
- Overusing emojis without purpose
- ALL CAPS without reason
- Clickbait framing
- Generic copy that could be from any brand
- Promising things the email doesn't deliver

Generate ${pairCount} unique subject lines and ${pairCount} unique preview texts.

Respond in JSON:
{
  "subjectLines": ["subject 1", "subject 2", ...],
  "previewTexts": ["preview 1", "preview 2", ...]
}`;

    // Build message content - text first, then images if available
    const messageContent: any[] = [{ type: 'text', text: textPrompt }];
    if (sliceImages.length > 0) {
      messageContent.push(...sliceImages);
    }

    console.log(`Sending request with ${sliceImages.length} images for vision analysis`);

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
        messages: [{ role: 'user', content: messageContent }]
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
