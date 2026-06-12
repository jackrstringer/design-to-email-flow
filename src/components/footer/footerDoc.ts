// FooterDoc — the single editable representation used by the Footer Studio
// flyout. It does NOT invent a new footer system: it wraps the two shapes that
// already live in brand_footers —
//   - footer_type 'image': image_slices (StoredImageFooterData: slices + legalSection)
//   - footer_type 'html':  the raw html column
// and compiles back to email HTML with the existing generateImageFooterHtml.

import {
  generateImageFooterHtml,
  type ImageFooterSlice,
  type LegalSectionData,
  type StoredImageFooterData,
} from '@/types/footer';

export type FooterDoc =
  | { kind: 'image'; slices: ImageFooterSlice[]; legalSection: LegalSectionData | null }
  | { kind: 'html'; html: string };

export interface FooterTheme {
  background: string;
  text: string;
  accent: string;
}

/** Compile a FooterDoc to the email HTML that push-to-klaviyo consumes. */
export function footerDocToHtml(doc: FooterDoc, width = 600): string {
  if (doc.kind === 'html') return doc.html;
  return generateImageFooterHtml(doc.slices, doc.legalSection, width);
}

/** Build a FooterDoc from a brand_footers row (or the campaign override state). */
export function footerDocFromRow(row: {
  footer_type?: string | null;
  html: string;
  image_slices?: unknown;
}): FooterDoc {
  const stored = row.image_slices as StoredImageFooterData | null | undefined;
  if (row.footer_type === 'image' && stored && Array.isArray(stored.slices) && stored.slices.length > 0) {
    return { kind: 'image', slices: stored.slices, legalSection: stored.legalSection ?? null };
  }
  return { kind: 'html', html: row.html };
}

export function isFooterDoc(value: unknown): value is FooterDoc {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (v.kind === 'html') return typeof v.html === 'string' && v.html.length > 0;
  if (v.kind === 'image') return Array.isArray(v.slices) && (v.slices as unknown[]).length > 0;
  return false;
}

// ---------------------------------------------------------------------------
// Row model for drag-and-drop. An image footer is a stack of visual rows
// (grouped by rowIndex, exactly how generateImageFooterHtml groups them) plus
// the legal section, which occupies a slot in the vertical order via yStart.
// ---------------------------------------------------------------------------

export type FooterRowItem =
  | { id: string; type: 'slices'; rowKey: number; slices: { slice: ImageFooterSlice; originalIndex: number }[] }
  | { id: string; type: 'legal' };

/** Group an image footer into ordered draggable rows (slices rows + legal). */
export function buildFooterRows(
  slices: ImageFooterSlice[],
  legalSection: LegalSectionData | null,
): FooterRowItem[] {
  const groups = new Map<number, { slice: ImageFooterSlice; originalIndex: number }[]>();
  slices.forEach((slice, index) => {
    const rowKey = slice.rowIndex ?? index;
    if (!groups.has(rowKey)) groups.set(rowKey, []);
    groups.get(rowKey)!.push({ slice, originalIndex: index });
  });

  const rows: { item: FooterRowItem; y: number }[] = Array.from(groups.entries()).map(
    ([rowKey, group]) => ({
      item: {
        id: `row-${rowKey}`,
        type: 'slices' as const,
        rowKey,
        slices: group.sort((a, b) => (a.slice.column ?? 0) - (b.slice.column ?? 0)),
      },
      y: Math.min(...group.map((g) => g.slice.yTop)),
    }),
  );

  if (legalSection) {
    rows.push({ item: { id: 'legal', type: 'legal' }, y: legalSection.yStart ?? Infinity });
  }

  return rows.sort((a, b) => a.y - b.y).map((r) => r.item);
}

/**
 * Apply a new vertical row order to an image footer by restacking yTop/yBottom
 * cumulatively (each row keeps its own pixel height) and renumbering rowIndex.
 * This keeps generateImageFooterHtml's y-based ordering and the legal-section
 * insertion point consistent with what the user sees.
 */
export function reorderImageFooter(
  slices: ImageFooterSlice[],
  legalSection: LegalSectionData | null,
  orderedRows: FooterRowItem[],
): { slices: ImageFooterSlice[]; legalSection: LegalSectionData | null } {
  const next = slices.map((s) => ({ ...s }));
  let nextLegal = legalSection ? { ...legalSection } : null;
  let cursorY = 0;
  let rowIndexCounter = 0;

  for (const row of orderedRows) {
    if (row.type === 'legal') {
      if (nextLegal) {
        const legalHeight =
          nextLegal.yEnd != null && nextLegal.yStart != null && nextLegal.yEnd > nextLegal.yStart
            ? nextLegal.yEnd - nextLegal.yStart
            : 120; // sensible default block height when unknown
        nextLegal = { ...nextLegal, yStart: cursorY, yEnd: cursorY + legalHeight };
        cursorY += legalHeight;
      }
      continue;
    }
    const members = row.slices.map((m) => m.originalIndex);
    const yTops = members.map((i) => next[i].yTop);
    const yBottoms = members.map((i) => next[i].yBottom);
    const rowHeight = Math.max(...yBottoms) - Math.min(...yTops) || 1;
    for (const i of members) {
      next[i] = { ...next[i], yTop: cursorY, yBottom: cursorY + rowHeight, rowIndex: rowIndexCounter };
    }
    cursorY += rowHeight;
    rowIndexCounter += 1;
  }

  return { slices: next, legalSection: nextLegal };
}

// ---------------------------------------------------------------------------
// Color theming
// ---------------------------------------------------------------------------

const HEX_RE = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g;

function normalizeHex(hex: string): string {
  const h = hex.toLowerCase();
  if (h.length === 4) return `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}`;
  return h;
}

/** Most frequent hex used as a background-color / as a text color in raw HTML. */
export function detectHtmlColors(html: string): { background: string | null; text: string | null } {
  const count = (re: RegExp) => {
    const tally = new Map<string, number>();
    for (const m of html.matchAll(re)) {
      const hex = normalizeHex(m[1]);
      tally.set(hex, (tally.get(hex) ?? 0) + 1);
    }
    let best: string | null = null;
    let bestN = 0;
    for (const [hex, n] of tally) if (n > bestN) { best = hex; bestN = n; }
    return best;
  };
  return {
    background: count(/background(?:-color)?\s*:\s*(#[0-9a-fA-F]{3,6})/g),
    text: count(/[^-]color\s*:\s*(#[0-9a-fA-F]{3,6})/g),
  };
}

/**
 * Apply a theme to a FooterDoc.
 * - image footers: recolor the legal section (the only non-image surface).
 * - html footers: remap the dominant background hex → theme.background, the
 *   dominant text hex → theme.text, and anchor colors → accent.
 */
export function applyThemeToDoc(doc: FooterDoc, theme: FooterTheme): FooterDoc {
  if (doc.kind === 'image') {
    if (!doc.legalSection) return doc;
    return {
      ...doc,
      legalSection: {
        ...doc.legalSection,
        backgroundColor: theme.background,
        textColor: theme.text,
      },
    };
  }

  let html = doc.html;
  const { background, text } = detectHtmlColors(html);
  if (background) {
    html = html.replace(
      new RegExp(`(background(?:-color)?\\s*:\\s*)(${escapeRe(background)}|${escapeRe(shortHex(background))})`, 'gi'),
      `$1${theme.background}`,
    );
  }
  if (text) {
    html = html.replace(
      new RegExp(`((?:^|[^-])color\\s*:\\s*)(${escapeRe(text)}|${escapeRe(shortHex(text))})`, 'gi'),
      `$1${theme.text}`,
    );
  }
  // Anchor accent: recolor inline color declarations inside <a … style="…">.
  html = html.replace(/(<a\b[^>]*style\s*=\s*")([^"]*)(")/gi, (_m, pre: string, style: string, post: string) => {
    const restyled = style.replace(/(^|;)(\s*color\s*:\s*)[^;"]+/gi, `$1$2${theme.accent}`);
    return pre + restyled + post;
  });
  return { kind: 'html', html };
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** #aabbcc -> #abc when collapsible, else the input (for matching both forms). */
function shortHex(hex: string): string {
  const h = normalizeHex(hex);
  if (h[1] === h[2] && h[3] === h[4] && h[5] === h[6]) return `#${h[1]}${h[3]}${h[5]}`;
  return h;
}

/** Curated theme presets derived from brand colors (preview content only). */
export function buildThemePresets(brand?: {
  primary_color?: string | null;
  secondary_color?: string | null;
  background_color?: string | null;
  text_primary_color?: string | null;
} | null): { name: string; theme: FooterTheme }[] {
  const primary = brand?.primary_color || '#1a1a1a';
  const presets: { name: string; theme: FooterTheme }[] = [
    { name: 'Light', theme: { background: '#ffffff', text: '#1a1a1a', accent: primary } },
    { name: 'Dark', theme: { background: '#111111', text: '#f5f5f5', accent: '#f5f5f5' } },
    { name: 'Brand', theme: { background: brand?.background_color || primary, text: brand?.text_primary_color || '#ffffff', accent: brand?.secondary_color || '#ffffff' } },
    { name: 'Soft', theme: { background: '#f6f4f0', text: '#3d3a35', accent: primary } },
  ];
  // De-dupe presets that collapse to the same colors.
  const seen = new Set<string>();
  return presets.filter((p) => {
    const key = `${p.theme.background}|${p.theme.text}|${p.theme.accent}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
