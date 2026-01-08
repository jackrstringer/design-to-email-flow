import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SliceResult {
  id: string;
  yStartPercent: number;
  yEndPercent: number;
  type: string;
  label: string;
  clickable: boolean;
}

// ============================================================================
// ASK CLAUDE TO READ THE RULER
// ============================================================================

async function askClaudeForSlicePositions(
  imageBase64: string,
  mimeType: string
): Promise<{ cuts: number[]; sections: { type: string; label: string }[] }> {
  
  const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  const prompt = `You are analyzing an email marketing image that has a vertical ruler (0-200) on the left side. Each mark represents 0.5% of the image height.

Your task: Look at where the major section boundaries are in the email, and tell me what number on the ruler aligns with each boundary.

## What counts as a section boundary:
- Between header/logo and hero content
- Between hero and product areas
- Between text blocks and CTA buttons  
- Between different content sections
- Between main content and footer

## What is NOT a boundary:
- Between paragraphs in the same text block
- Between a headline and its subheadline
- Small gaps within a cohesive section

## Instructions:
1. Look at the email content (to the right of the ruler)
2. Identify where distinct sections begin and end
3. For each boundary, read the number on the ruler at that vertical position
4. Return those numbers (between 0 and 200)

Most emails have 3-10 major sections, so return 2-9 cut points.

Respond with JSON only:

{
  "cuts": [30, 76, 104, 142, 178],
  "sections": [
    { "type": "header", "label": "Logo and top banner" },
    { "type": "hero", "label": "Main headline and offer" },
    { "type": "cta_button", "label": "Primary call-to-action" },
    { "type": "content", "label": "Product details" },
    { "type": "social", "label": "Social proof section" },
    { "type": "footer", "label": "Footer links and unsubscribe" }
  ]
}

The "sections" array describes each section from top to bottom (one more entry than "cuts").
The "cuts" array contains the ruler numbers (0-200) where you'd slice the email.`;

  console.log("Calling Claude API...");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": anthropicApiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mimeType,
              data: imageBase64
            }
          },
          {
            type: "text",
            text: prompt
          }
        ]
      }]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Claude API error:", errorText);
    throw new Error(`Claude API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.content[0].text;
  console.log("Claude response:", content);
  
  // Parse JSON from response (handle markdown code blocks)
  let jsonStr = content;
  if (content.includes("```json")) {
    jsonStr = content.split("```json")[1].split("```")[0];
  } else if (content.includes("```")) {
    jsonStr = content.split("```")[1].split("```")[0];
  }
  
  return JSON.parse(jsonStr.trim());
}

// ============================================================================
// CONVERT CLAUDE'S RESPONSE TO SLICES
// ============================================================================

function convertToSlices(
  cuts: number[],
  sections: { type: string; label: string }[]
): SliceResult[] {
  
  const sortedCuts = [...cuts].sort((a, b) => a - b);
  const boundaries = [0, ...sortedCuts, 200];
  
  const slices: SliceResult[] = [];
  
  for (let i = 0; i < boundaries.length - 1; i++) {
    const sectionInfo = sections[i] || { type: 'content', label: `Section ${i + 1}` };
    
    slices.push({
      id: `slice_${i + 1}`,
      yStartPercent: boundaries[i] / 2,  // 0-200 → 0-100%
      yEndPercent: boundaries[i + 1] / 2,
      type: sectionInfo.type,
      label: sectionInfo.label,
      clickable: !['divider', 'spacer'].includes(sectionInfo.type)
    });
  }
  
  return slices;
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const { imageDataUrl } = await req.json();
    
    if (!imageDataUrl) {
      throw new Error("imageDataUrl is required");
    }

    // Parse the data URL to get base64 and mime type
    const match = imageDataUrl.match(/^data:(image\/[a-z]+);base64,(.+)$/i);
    if (!match) {
      throw new Error("Invalid image data URL format");
    }
    
    const mimeType = match[1];
    const imageBase64 = match[2];
    
    console.log(`Received image: ${mimeType}, base64 length: ${imageBase64.length}`);

    // Just call Claude - no image manipulation needed!
    // The frontend has already added the ruler to the image
    console.log("Asking Claude to identify slice positions...");
    const claudeResponse = await askClaudeForSlicePositions(imageBase64, mimeType);
    console.log(`Claude returned cuts: [${claudeResponse.cuts.join(', ')}]`);

    // Convert to slices
    const slices = convertToSlices(claudeResponse.cuts, claudeResponse.sections);
    console.log(`Generated ${slices.length} slices`);

    const processingTimeMs = Date.now() - startTime;

    return new Response(
      JSON.stringify({
        success: true,
        slices,
        metadata: {
          processingTimeMs
        },
        debug: {
          cuts: claudeResponse.cuts,
          sections: claudeResponse.sections
        }
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error: unknown) {
    console.error("Auto-slice error:", error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        slices: [],
        metadata: {
          processingTimeMs: Date.now() - startTime
        }
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
