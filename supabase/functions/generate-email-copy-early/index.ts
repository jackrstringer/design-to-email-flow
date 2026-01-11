import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const { sessionKey, imageUrl, brandContext, brandId, copyExamples } = await req.json();

    if (!sessionKey) {
      throw new Error('sessionKey is required');
    }

    console.log(`[EARLY] Starting immediate SL/PT generation for session: ${sessionKey}`);
    console.log(`[EARLY] Brand: ${brandContext?.name || 'unknown'} (${brandContext?.domain || 'no domain'})`);

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Build brand voice examples section if available
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

    const textPrompt = `You are a senior retention copywriter writing subject lines and preview text for high-performing DTC brands.

Your job is not just to be correct, but to be sharp, tasteful, on-brand, and inbox-competitive.

You must write SL/PT pairs that:
- Feel human-written (never robotic or templated)
- Are concise and punchy (prioritize short over long when possible)
- Reflect real editorial judgment about what matters most in the email
- Would realistically get approved by a strong creative director

${brandVoiceSection}

## EMAIL BEING SENT:
Brand: ${brandContext?.name || 'Unknown brand'}
Domain: ${brandContext?.domain || 'unknown'}

Analyze the email image to understand:
- The primary offer or message
- Products featured
- Any urgency or timing elements
- The overall tone and vibe

---

## CORE STRATEGY (follow strictly)

Before writing anything, you must infer:
- What is the PRIMARY hook of this email? (sale, free gift, new product, deadline, education, etc.)
- What is SECONDARY supporting value?
- What should be emphasized most to earn the open?

Your subject lines should naturally reflect that hierarchy instead of listing everything.

---

## SUBJECT LINE RULES

### 1. Clarity > cleverness
Reader should immediately understand the intent.

### 2. Specific > vague
Concrete offers, products, and benefits beat generic phrases.

### 3. Brevity matters
Strong subject lines are usually:
- 4–9 words
- Rarely longer than 12 words
If it feels long, rewrite shorter.

### 4. Avoid robotic or corporate phrasing
Bad:
- "Includes complimentary wellness tools"
- "With any tonic purchase"
- "Choose from the following options"

Good:
- "2 free gifts with any tonic"
- "All tonics on sale"
- "Which one are you grabbing?"

### 5. Real urgency only
Never fabricate deadlines or pressure.

---

## PREVIEW TEXT RULES

Preview text must:
- Add new information (never restate the subject line)
- Feel like a natural continuation of the thought
- Be shorter than typical body copy
- Sound like something written for an inbox, not a website

Good PT feels conversational, not descriptive.

Bad PT:
- Long informational sentences
- Product catalog descriptions
- Overly formal language

---

## QUALITY BAR

Each SL/PT pair must pass this test:
- Would this stand out in a crowded inbox?
- Does this sound like a strong brand, not generic ecommerce?
- Does this feel human and intentional?
- Would a senior marketer approve this without edits?

If not, rewrite.

---

## OUTPUT FORMAT

Generate 10 subject lines and 10 preview texts.

Respond in JSON:
{
  "subjectLines": ["..."],
  "previewTexts": ["..."]
}`;

    // Build message content with image
    const messageContent: any[] = [
      { type: 'text', text: textPrompt },
    ];

    if (imageUrl) {
      messageContent.push({
        type: 'image',
        source: {
          type: 'url',
          media_type: 'image/png',
          url: imageUrl
        }
      });
    }

    console.log(`[EARLY] Sending request to Anthropic with image: ${imageUrl ? 'yes' : 'no'}`);

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
      console.error('[EARLY] Anthropic API error:', errorText);
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.content?.[0]?.text || '';
    
    console.log('[EARLY] Raw response:', content.substring(0, 300));

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
      console.error('[EARLY] JSON parse error:', parseErr);
      throw new Error('Failed to parse AI response');
    }

    console.log(`[EARLY] Generated ${result.subjectLines?.length || 0} SLs, ${result.previewTexts?.length || 0} PTs`);

    // Store in early_generated_copy table
    const { error: insertError } = await supabase
      .from('early_generated_copy')
      .upsert({
        session_key: sessionKey,
        brand_id: brandId || null,
        image_url: imageUrl,
        subject_lines: result.subjectLines,
        preview_texts: result.previewTexts,
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1 hour
      }, { onConflict: 'session_key' });

    if (insertError) {
      console.error('[EARLY] Failed to store results:', insertError);
      throw new Error('Failed to store generated copy');
    }

    console.log(`[EARLY] Stored results for session: ${sessionKey}`);

    return new Response(
      JSON.stringify({ success: true, sessionKey }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('[EARLY] Error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
