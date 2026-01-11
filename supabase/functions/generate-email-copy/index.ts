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

    const textPrompt = `You are a senior retention copywriter writing subject lines and preview text for high-performing DTC brands.

Your job is not just to be correct, but to be sharp, tasteful, on-brand, and inbox-competitive.

You must write SL/PT pairs that:

- Feel human-written (never robotic or templated)

- Are concise and punchy

- Reflect real editorial judgment about what matters most in the email

- Would realistically get approved by a strong creative director

${brandVoiceSection}

## EMAIL CONTENT BEING SENT:

${sliceContext || 'No specific content provided'}

${linkContext ? `Links in email: ${linkContext}` : ''}

${sliceImages.length > 0 ? 'Analyze the email images to understand the offer, products, and message.' : ''}

${favoriteContext}${userDirection}

---

## CORE STRATEGY (follow strictly)

Before writing anything, infer:

- What is the PRIMARY hook of this email? (sale, free gift, new product, deadline, education, etc.)

- What is SECONDARY supporting value?

- What deserves the most emphasis to earn the open?

Your subject lines should reflect this hierarchy naturally.  

Do NOT list everything. Prioritize what actually matters.

---

## TONE RANGE REQUIREMENT

Do NOT generate all lines in the same voice.

You must intentionally vary tone across the set while staying on-brand.

Distribute subject lines across these tone bands:

1. Elevated & clean  

   - Polished, minimal, premium  

   - Low hype, high trust  

   - Example: "This one's on us"

2. Warm & conversational  

   - Friendly, human, natural  

   - Feels like a person, not a brand  

   - Example: "We added something extra for you"

3. Lightly energetic  

   - Uses energy sparingly (may include occasional exclamation points)  

   - Still tasteful, not loud  

   - Example: "Two free gifts, your pick!"

4. Soft curiosity  

   - Invites intrigue without clickbait  

   - Still clear and honest  

   - Example: "Which one are you grabbing?"

Avoid producing ${pairCount} lines that feel like the same voice.

---

## SUBJECT LINE RULES

### 1. Clarity > cleverness

Reader should understand the intent immediately.

### 2. Specific > vague

Concrete offers, products, or benefits beat generic phrasing.

### 3. Brevity matters

Most strong subject lines are:

- 4–9 words

- Rarely longer than 12 words

If it feels long, rewrite shorter.

### 4. Avoid robotic or corporate phrasing

Avoid phrases like:

- "With any purchase"

- "Includes complimentary"

- "Marked down"

- "Your order qualifies"

- "Choose from the following"

- "All products are"

Prefer natural, conversational phrasing.

### 5. Real urgency only

Never fabricate deadlines or pressure.

### 6. Avoid template repetition

Do NOT produce multiple lines that are just minor rewrites of the same structure.

Bad pattern:

- "Free gifts with any tonic"

- "Free gifts with every tonic"

- "Free gifts with your tonic"

Each line should feel meaningfully different in structure, rhythm, or framing.

### 7. Controlled energy (exclamation points)

Exclamation points are allowed, but must be used sparingly and intentionally.

Good:

- "Two free gifts, your pick!"

- "This one's on us!"

Bad:

- Overuse across many lines

- Multiple exclamation points

- Hype phrasing ("Huge!", "Insane!", "Don't miss out!")

Only some lines in the set should include an exclamation point.

---

## EMOJI USAGE (controlled)

You must include a small number of emoji options per set.

Requirements:

- 2–3 subject lines should include a single emoji

- The rest should contain no emojis

- Emojis must feel tasteful and natural, not promotional spam

Allowed emoji types (when relevant):

- 🎁 gift

- ✨ subtle highlight

- 💤 sleep

- 🧠 focus

- 🌿 calm / wellness

- ☀️ reset / morning / energy

Avoid:

- Multiple emojis in one line

- 🚨🔥💥😱 hype emojis

- Juvenile or off-brand emoji use

Emoji lines must still meet all quality standards.

---

## PREVIEW TEXT RULES

Preview text must:

- Add NEW information (never restate the subject line)

- Feel like a natural continuation of thought

- Be concise and inbox-appropriate

- Sound like a human, not a product page

Bad:

- "All tonics are discounted during the New Year sale"

- "Includes complimentary shaker bottle and breathwork subscription"

Better:

- "Shaker and 3 months of breathwork included"

- "We'll add the gifts automatically at checkout"

Avoid long, descriptive, website-style copy.

---

## QUALITY BAR

Each SL/PT pair must pass all of these tests:

- Would this stand out in a crowded inbox?

- Does this sound like a real brand, not generic ecommerce?

- Does this feel human and intentional?

- Would a senior marketer approve this without edits?

- Does this avoid sounding like a template?

If not, rewrite.

---

## OUTPUT FORMAT

Generate ${pairCount} subject lines and ${pairCount} preview texts.

Respond in JSON:

{
  "subjectLines": ["..."],
  "previewTexts": ["..."]
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
