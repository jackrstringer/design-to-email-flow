// deploy-trigger
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Transform image URL to include resize parameters (supports both CDNs)
function getResizedImageUrl(url: string, maxWidth: number, maxHeight: number): string {
  if (!url) return url;
  
  // Handle ImageKit URLs
  if (url.includes('ik.imagekit.io')) {
    const match = url.match(/(https:\/\/ik\.imagekit\.io\/[^/]+)\/(.+)/);
    if (match) {
      const [, base, path] = match;
      return `${base}/tr:w-${maxWidth},h-${maxHeight},c-at_max/${path}`;
    }
    return url;
  }
  
  // Handle Cloudinary URLs (legacy)
  if (url.includes('cloudinary.com/')) {
    const uploadIndex = url.indexOf('/upload/');
    if (uploadIndex === -1) return url;
    
    const before = url.substring(0, uploadIndex + 8);
    const after = url.substring(uploadIndex + 8);
    
    return `${before}c_limit,w_${maxWidth},h_${maxHeight}/${after}`;
  }
  
  return url;
}

// Legacy alias
function getResizedCloudinaryUrl(url: string, maxWidth: number, maxHeight: number): string {
  return getResizedImageUrl(url, maxWidth, maxHeight);
}

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
    const { sessionKey, imageUrl, imageBase64, mimeType, brandContext, brandId, copyExamples } = await req.json();

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

1. Elevated & clean (polished, minimal, low hype)

2. Warm & conversational (friendly, human)

3. Lightly energetic (some energy, occasional exclamation point allowed)

4. Soft curiosity (invites intrigue without clickbait)

Avoid producing 10 lines that feel like the same voice.

---

## SUBJECT LINE RULES

### 1. Clarity > cleverness  

Reader should immediately understand the intent.

### 2. Specific > vague  

Concrete offers, products, and benefits beat generic phrasing.

### 3. Brevity matters  

Strong subject lines are usually:

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

- Exactly 2–3 subject lines should include a single emoji

- The rest should contain no emojis

- Emojis must feel tasteful and natural, not promotional spam

Allowed emoji types (only when relevant):

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

If not, rewrite internally before outputting.

---

## SPELLING & TYPO QA

While analyzing the email, also scan for any blatant spelling errors, typos, or obvious grammatical mistakes visible in the email content.

Only flag issues that are clearly wrong:
- Misspelled words (e.g., "recieve" instead of "receive")
- Missing or extra letters (e.g., "teh" instead of "the")
- Obvious typos (e.g., "New Yera Sale")
- Broken or incomplete words

Do NOT flag:
- Intentional brand stylizations (e.g., "Ur" for "Your" if clearly intentional)
- Product names or brand names you're unsure about
- Capitalization choices (these are often intentional)
- Minor punctuation preferences

If no spelling errors are found, return an empty array.

---

## OUTPUT FORMAT

Generate 10 subject lines and 10 preview texts.

Respond in JSON:

{
  "subjectLines": ["..."],
  "previewTexts": ["..."],
  "spellingErrors": ["'New Yera' should be 'New Year' (visible in hero section)", "..."]
}`;

    // Build message content with image
    const messageContent: any[] = [
      { type: 'text', text: textPrompt },
    ];

    // OPTIMIZATION: Use passed base64 directly if available, skip redundant Cloudinary download
    let base64Data = imageBase64;
    let contentType = mimeType || 'image/png';
    
    if (base64Data) {
      console.log('[EARLY] Using provided base64, skipping fetch (saves ~22s!)');
    } else if (imageUrl) {
      // Fallback: fetch from URL only if base64 not provided
      console.log('[EARLY] No base64 provided, fetching from URL...');
      let finalImageUrl = imageUrl;
      if (imageUrl.includes('cloudinary.com/') && !imageUrl.includes('/c_limit,')) {
        finalImageUrl = getResizedCloudinaryUrl(imageUrl, 600, 7900);
      }
      console.log('[EARLY] Fetching image as base64:', finalImageUrl.substring(0, 80) + '...');
      
      try {
        const imageResponse = await fetch(finalImageUrl);
        if (!imageResponse.ok) {
          throw new Error(`Failed to fetch image: ${imageResponse.status}`);
        }
        const imageBuffer = await imageResponse.arrayBuffer();
        
        // Use chunked base64 conversion to avoid stack overflow on large images
        const uint8Array = new Uint8Array(imageBuffer);
        const CHUNK_SIZE = 32768; // Process 32KB at a time
        let tempData = '';
        for (let i = 0; i < uint8Array.length; i += CHUNK_SIZE) {
          const chunk = uint8Array.subarray(i, Math.min(i + CHUNK_SIZE, uint8Array.length));
          tempData += String.fromCharCode(...chunk);
        }
        base64Data = btoa(tempData);
        
        contentType = imageResponse.headers.get('content-type') || 'image/png';
        
        console.log('[EARLY] Image fetched successfully, size:', imageBuffer.byteLength, 'bytes');
      } catch (imgErr) {
        console.error('[EARLY] Failed to fetch image, proceeding without it:', imgErr);
        // Continue without image rather than failing entirely
      }
    }
    
    if (base64Data) {
      messageContent.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: contentType,
          data: base64Data
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

    let result = { subjectLines: [] as string[], previewTexts: [] as string[], spellingErrors: [] as string[] };
    
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.pairs) {
          result = {
            subjectLines: parsed.pairs.map((p: any) => p.subjectLine),
            previewTexts: parsed.pairs.map((p: any) => p.previewText),
            spellingErrors: parsed.spellingErrors || [],
          };
        } else {
          result = {
            subjectLines: parsed.subjectLines || [],
            previewTexts: parsed.previewTexts || [],
            spellingErrors: parsed.spellingErrors || [],
          };
        }
      }
    } catch (parseErr) {
      console.error('[EARLY] JSON parse error:', parseErr);
      throw new Error('Failed to parse AI response');
    }

    console.log(`[EARLY] Generated ${result.subjectLines?.length || 0} SLs, ${result.previewTexts?.length || 0} PTs, ${result.spellingErrors?.length || 0} spelling issues`);

    // Store in early_generated_copy table
    const { error: insertError } = await supabase
      .from('early_generated_copy')
      .upsert({
        session_key: sessionKey,
        brand_id: brandId || null,
        image_url: imageUrl,
        subject_lines: result.subjectLines,
        preview_texts: result.previewTexts,
        spelling_errors: result.spellingErrors,
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
