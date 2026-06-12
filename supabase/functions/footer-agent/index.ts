// footer-agent — the conversational editor behind the Footer Studio flyout.
//
// Input:  { brandId, instruction, footer } where footer is the studio's
//         FooterDoc — either the structured image-footer shape that already
//         lives in brand_footers.image_slices ({ kind:'image', slices,
//         legalSection }) or a raw HTML footer ({ kind:'html', html }).
// Output: { footer, summary } — the MODIFIED representation in the SAME shape,
//         strictly validated server-side (no invented image URLs, unsubscribe
//         compliance preserved, y-coordinates restacked), plus a one-line
//         summary of what changed.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { requireAuth, requireBrandAccess, serviceClient, AuthError } from "../_shared/auth.ts";
import { newTrace, logEvent, sanitizeError } from "../_shared/log.ts";
import { enforceRateLimit, RateLimitError } from "../_shared/ratelimit.ts";
import { callClaude, parseModelJson, AGENT_MODEL } from "../_shared/anthropic.ts";

interface ImageSlice {
  yTop: number;
  yBottom: number;
  imageUrl: string | null;
  width?: number;
  height?: number;
  altText?: string;
  link?: string | null;
  isClickable?: boolean;
  rowIndex?: number;
  column?: number;
  totalColumns?: number;
  [key: string]: unknown;
}

interface LegalSection {
  yStart: number;
  yEnd?: number;
  backgroundColor: string;
  textColor: string;
  content?: string;
  fontSize?: number;
  lineHeight?: number;
  textAlign?: 'left' | 'center' | 'right';
  paddingTop?: number;
  paddingBottom?: number;
  paddingHorizontal?: number;
  detectedElements?: unknown[];
  [key: string]: unknown;
}

type FooterDoc =
  | { kind: 'image'; slices: ImageSlice[]; legalSection: LegalSection | null }
  | { kind: 'html'; html: string };

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const UNSUB_TAG = '{% unsubscribe_link %}';

function isImageDoc(v: unknown): v is Extract<FooterDoc, { kind: 'image' }> {
  return !!v && typeof v === 'object' && (v as Record<string, unknown>).kind === 'image'
    && Array.isArray((v as Record<string, unknown>).slices);
}
function isHtmlDoc(v: unknown): v is Extract<FooterDoc, { kind: 'html' }> {
  return !!v && typeof v === 'object' && (v as Record<string, unknown>).kind === 'html'
    && typeof (v as Record<string, unknown>).html === 'string';
}

/** Restack rows top-to-bottom so y-coordinates and rowIndex stay consistent
 * with the array/row order the model returned. Mirrors the frontend logic. */
function restackImageDoc(doc: Extract<FooterDoc, { kind: 'image' }>): Extract<FooterDoc, { kind: 'image' }> {
  const groups = new Map<number, number[]>();
  doc.slices.forEach((s, i) => {
    const key = typeof s.rowIndex === 'number' ? s.rowIndex : i;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(i);
  });
  const slots: { type: 'row' | 'legal'; key?: number; y: number }[] = Array.from(groups.entries()).map(
    ([key, members]) => ({ type: 'row' as const, key, y: Math.min(...members.map((i) => doc.slices[i].yTop ?? 0)) }),
  );
  if (doc.legalSection) slots.push({ type: 'legal', y: doc.legalSection.yStart ?? Infinity });
  slots.sort((a, b) => a.y - b.y);

  const next = doc.slices.map((s) => ({ ...s }));
  let legal = doc.legalSection ? { ...doc.legalSection } : null;
  let cursor = 0;
  let rowCounter = 0;
  for (const slot of slots) {
    if (slot.type === 'legal') {
      if (legal) {
        const h = legal.yEnd != null && legal.yEnd > legal.yStart ? legal.yEnd - legal.yStart : 120;
        legal = { ...legal, yStart: cursor, yEnd: cursor + h };
        cursor += h;
      }
      continue;
    }
    const members = groups.get(slot.key!)!;
    const tops = members.map((i) => next[i].yTop ?? 0);
    const bottoms = members.map((i) => next[i].yBottom ?? 0);
    const height = Math.max(1, Math.max(...bottoms) - Math.min(...tops));
    for (const i of members) {
      next[i] = { ...next[i], yTop: cursor, yBottom: cursor + height, rowIndex: rowCounter };
    }
    cursor += height;
    rowCounter += 1;
  }
  return { kind: 'image', slices: next, legalSection: legal };
}

/** Validates the model's output against the input doc. Throws on violation. */
function validateOutput(input: FooterDoc, output: unknown): FooterDoc {
  if (input.kind === 'image') {
    if (!isImageDoc(output)) throw new Error('Agent returned the wrong footer shape');
    if (output.slices.length === 0) throw new Error('Agent removed every footer row');
    const allowedUrls = new Set(
      input.slices.flatMap((s) => [s.imageUrl, ...(Array.isArray(s.columnImageUrls) ? s.columnImageUrls as string[] : [])]).filter(Boolean),
    );
    for (const s of output.slices) {
      if (typeof s.yTop !== 'number' || typeof s.yBottom !== 'number') throw new Error('Invalid slice coordinates');
      if (s.imageUrl != null && (typeof s.imageUrl !== 'string' || !allowedUrls.has(s.imageUrl))) {
        throw new Error('Agent invented an image URL');
      }
      if (s.link != null && typeof s.link !== 'string') throw new Error('Invalid slice link');
      if (s.altText != null && typeof s.altText !== 'string') throw new Error('Invalid alt text');
    }
    const legal = output.legalSection;
    if (legal != null) {
      if (typeof legal !== 'object') throw new Error('Invalid legal section');
      if (legal.backgroundColor && !HEX_RE.test(legal.backgroundColor)) throw new Error('Invalid legal background color');
      if (legal.textColor && !HEX_RE.test(legal.textColor)) throw new Error('Invalid legal text color');
      if (legal.content != null && typeof legal.content !== 'string') throw new Error('Invalid legal content');
      // Compliance: never let the agent drop the unsubscribe merge tag.
      // (Absent content falls back to the default template, which includes it.)
      const inputHadUnsub = !input.legalSection || input.legalSection.content == null
        || input.legalSection.content.includes(UNSUB_TAG);
      if (inputHadUnsub && typeof legal.content === 'string' && !legal.content.includes(UNSUB_TAG)) {
        throw new Error('Agent removed the unsubscribe link — change rejected');
      }
    } else if (input.legalSection) {
      throw new Error('Agent removed the legal section — change rejected');
    }
    return restackImageDoc(output);
  }

  // html kind
  if (!isHtmlDoc(output)) throw new Error('Agent returned the wrong footer shape');
  let html = output.html.trim();
  if (!html) throw new Error('Agent returned an empty footer');
  if (html.length > 200_000) throw new Error('Agent output too large');
  html = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  if (/unsubscribe/i.test(input.html) && !/unsubscribe/i.test(html)) {
    throw new Error('Agent removed the unsubscribe link — change rejected');
  }
  return { kind: 'html', html };
}

serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  const ctx = newTrace('footer-agent', req);

  try {
    const auth = await requireAuth(req);
    const { brandId, instruction, footer } = await req.json();
    if (!brandId || typeof instruction !== 'string' || !instruction.trim()) {
      return jsonResponse(req, { error: 'brandId and instruction are required' }, 400);
    }
    if (!isImageDoc(footer) && !isHtmlDoc(footer)) {
      return jsonResponse(req, { error: 'footer must be a valid footer representation' }, 400);
    }

    const supabase = serviceClient();
    const brand = await requireBrandAccess(
      supabase, brandId, auth,
      'id, user_id, name, domain, primary_color, secondary_color',
    );

    await enforceRateLimit(supabase, brandId, 'footer-agent', 20, 60);

    const inputDoc = footer as FooterDoc;

    const system = `You are the footer editing agent for the email brand "${brand.name}" (${brand.domain}). Brand primary color: ${brand.primary_color ?? 'unknown'}, secondary: ${brand.secondary_color ?? 'unknown'}.
You receive the footer's current representation and one instruction. Apply ONLY what is asked — no unrequested changes.

Representation rules:
- kind "image": the footer is a vertical stack of image rows plus one legal section. You may: edit altText, link, isClickable; reorder rows by changing rowIndex (and keep each row's slices sharing the same rowIndex); edit the legal section's content (HTML string with Klaviyo merge tags), backgroundColor/textColor (6-digit hex), fontSize, lineHeight, textAlign, padding*. You may move the legal section in the vertical order by changing its yStart relative to slice yTop values. You must NEVER invent, change, or remove imageUrl values, and never delete the legal section.
- kind "html": raw email-safe HTML (table-based, inline styles only). Edit text, colors, links, ordering of <tr> blocks as asked. Never remove unsubscribe/preferences links or {{ organization.* }} merge tags. No <script>, no external CSS.

Klaviyo merge tags that must be preserved where present: {{ organization.name }}, {{ organization.address }}, {% unsubscribe_link %}, {% manage_preferences_link %}.

Return ONLY strict JSON, no prose:
{"footer": <the FULL modified representation, same "kind" and same shape as the input>, "summary": "<one short line describing what you changed>"}`;

    const userMessage = `Current footer representation:
${JSON.stringify(inputDoc)}

Instruction: ${instruction.trim()}`;

    const responseText = await callClaude({
      model: AGENT_MODEL,
      system,
      messages: [{ role: 'user', content: userMessage }],
      maxTokens: 16000,
      temperature: 0,
    });

    const parsed = parseModelJson<{ footer: unknown; summary?: string }>(responseText);
    const validated = validateOutput(inputDoc, parsed.footer);
    const summary = typeof parsed.summary === 'string' && parsed.summary.trim()
      ? parsed.summary.trim().slice(0, 200)
      : 'Footer updated';

    logEvent(ctx, 'info', 'footer_agent_complete', {
      brandId,
      kind: inputDoc.kind,
      instructionLength: instruction.length,
    });

    return jsonResponse(req, { success: true, footer: validated, summary });
  } catch (error: unknown) {
    if (error instanceof AuthError) return jsonResponse(req, { error: error.message }, error.status);
    if (error instanceof RateLimitError) return jsonResponse(req, { error: error.message }, 429);
    return jsonResponse(req, { error: sanitizeError(ctx, error) }, 500);
  }
});
