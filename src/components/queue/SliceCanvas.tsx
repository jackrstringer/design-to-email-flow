import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Link as LinkIcon, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SliceImageDropZone } from './SliceImageDropZone';
import { isRealLink } from '@/lib/links';

export interface CanvasSlice {
  imageUrl?: string;
  altText?: string;
  link?: string | null;
  type?: 'image' | 'html';
  htmlContent?: string;
  column?: number;
  totalColumns?: number;
  rowIndex?: number;
}

interface SliceCanvasProps {
  slices: CanvasSlice[];
  scaledWidth: number;
  displayMode: 'all' | 'links' | 'none';
  brandLinks: string[];
  brandId?: string | null;
  onUpdateSlice: (index: number, updates: Partial<CanvasSlice>) => void;
  onHoverSlice?: (index: number | null) => void;
}

const PILL_H = 24;
const PILL_GAP = 4;
const GUTTER_PAD = 12;

/* Full-length URL, just without protocol/www noise. The gutter has room —
   never collapse the path (Jack needs to read the whole destination). */
export function displayUrl(raw: string): string {
  return raw.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
}

/* Map-label collision pass: keep pills at their anchor when possible,
   push down minimally when neighbors collide. Heights may vary per item
   (URLs wrap to show their full length — Jack's rule: never truncate). */
function resolvePositions(anchors: number[], heights: number | number[], gap: number): number[] {
  const hOf = (i: number) => (Array.isArray(heights) ? heights[i] ?? PILL_H : heights);
  const order = anchors.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);
  const out = new Array(anchors.length).fill(0);
  let cursor = -Infinity;
  for (const { y, i } of order) {
    const h = hOf(i);
    const top = Math.max(y - h / 2, cursor + gap);
    out[i] = top;
    cursor = top + h;
  }
  return out;
}

export function SliceCanvas({
  slices,
  scaledWidth,
  displayMode,
  brandLinks,
  brandId,
  onUpdateSlice,
  onHoverSlice,
}: SliceCanvasProps) {
  const [editingLinkIndex, setEditingLinkIndex] = useState<number | null>(null);
  const [editingAltIndex, setEditingAltIndex] = useState<number | null>(null);
  const [linkSearchValue, setLinkSearchValue] = useState('');
  const [hovered, setHovered] = useState<number | null>(null);

  // Measured geometry: per-slice center Y relative to the canvas.
  const canvasRef = useRef<HTMLDivElement>(null);
  const sliceRefs = useRef<(HTMLDivElement | null)[]>([]);
  const pillRefs = useRef<(HTMLElement | null)[]>([]);
  const [anchors, setAnchors] = useState<number[]>([]);
  const [pillHeights, setPillHeights] = useState<number[]>([]);

  const measure = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const canvasTop = canvas.getBoundingClientRect().top;
    const next = slices.map((_, i) => {
      const el = sliceRefs.current[i];
      if (!el) return 0;
      const r = el.getBoundingClientRect();
      return r.top - canvasTop + r.height / 2;
    });
    setAnchors((prev) =>
      prev.length === next.length && prev.every((v, i) => Math.abs(v - next[i]) < 0.5) ? prev : next,
    );
    const nextH = slices.map((_, i) => pillRefs.current[i]?.offsetHeight || PILL_H);
    setPillHeights((prev) =>
      prev.length === nextH.length && prev.every((v, i) => Math.abs(v - nextH[i]) < 0.5) ? prev : nextH,
    );
  }, [slices]);

  useLayoutEffect(() => {
    measure();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(measure);
    ro.observe(canvas);
    sliceRefs.current.forEach((el) => el && ro.observe(el));
    pillRefs.current.forEach((el) => el && ro.observe(el));
    return () => ro.disconnect();
  }, [measure, scaledWidth, displayMode]);

  const pillTops = useMemo(
    () => resolvePositions(anchors, pillHeights, PILL_GAP),
    [anchors, pillHeights],
  );
  // Alt blocks run ~2 lines (~38px) — collision-resolve with their real height
  // so neighboring alt texts never overlap or squash each other.
  const ALT_H = 38;
  const altTops = useMemo(() => resolvePositions(anchors, ALT_H, 6), [anchors]);

  const setHover = (i: number | null) => {
    setHovered(i);
    onHoverSlice?.(i);
  };

  const filteredLinks = brandLinks.filter((l) =>
    l.toLowerCase().includes(linkSearchValue.toLowerCase()),
  );

  const linkEditor = (index: number, current: string | null | undefined) => (
    <PopoverContent className="w-96 p-0" align="end" side="left">
      <Command>
        <CommandInput
          placeholder="Search or paste a URL…"
          value={linkSearchValue}
          onValueChange={setLinkSearchValue}
        />
        <CommandList>
          <CommandEmpty>
            {linkSearchValue && (
              <button
                className="w-full px-3 py-2 text-left text-xs hover:bg-accent"
                onClick={() => {
                  onUpdateSlice(index, { link: linkSearchValue });
                  setEditingLinkIndex(null);
                  setLinkSearchValue('');
                }}
              >
                Use "{linkSearchValue}"
              </button>
            )}
          </CommandEmpty>
          {filteredLinks.length > 0 && (
            <CommandGroup heading="Brand links">
              {filteredLinks.slice(0, 10).map((link) => (
                <CommandItem
                  key={link}
                  value={link}
                  onSelect={() => {
                    onUpdateSlice(index, { link });
                    setEditingLinkIndex(null);
                    setLinkSearchValue('');
                  }}
                  className="text-xs"
                >
                  <span className="break-all">{link}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {current && (
            <CommandGroup>
              <CommandItem
                onSelect={() => {
                  onUpdateSlice(index, { link: null });
                  setEditingLinkIndex(null);
                }}
                className="text-xs text-destructive"
              >
                <X className="mr-2 h-3 w-3" />
                Remove link
              </CommandItem>
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </PopoverContent>
  );

  // Group slices into rows for multi-column support.
  const rows = useMemo(() => {
    const grouped = slices.reduce((acc, slice, index) => {
      const rowIndex = slice.rowIndex ?? index;
      (acc[rowIndex] ||= []).push({ slice, originalIndex: index });
      return acc;
    }, {} as Record<number, Array<{ slice: CanvasSlice; originalIndex: number }>>);
    return Object.entries(grouped)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([, group]) => group.sort((a, b) => (a.slice.column ?? 0) - (b.slice.column ?? 0)));
  }, [slices]);

  const showLinks = displayMode !== 'none';
  const showAlt = displayMode === 'all';

  return (
    <div className="relative flex justify-center">
      {/* LEFT GUTTER — link pills, absolutely positioned, collision-resolved.
          They live OUTSIDE the email's layout and can never reflow it. */}
      {showLinks && (
        <div
          className="pointer-events-none absolute inset-y-0 left-0 z-10"
          style={{ width: `calc(50% - ${scaledWidth / 2 + GUTTER_PAD}px)` }}
        >
          {slices.map((slice, i) => {
            if (anchors.length !== slices.length) return null;
            const multi = (slice.totalColumns ?? 1) > 1;
            return (
              <div
                key={i}
                ref={(el) => (pillRefs.current[i] = el)}
                className="absolute right-0 flex w-full justify-end"
                style={{ top: pillTops[i], minHeight: PILL_H }}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              >
                <Popover
                  open={editingLinkIndex === i}
                  onOpenChange={(open) => {
                    setEditingLinkIndex(open ? i : null);
                    if (open) setLinkSearchValue('');
                  }}
                >
                  <PopoverTrigger asChild>
                    {isRealLink(slice.link) ? (
                      <button
                        className={cn(
                          'pointer-events-auto inline-flex min-h-6 max-w-full items-center gap-1.5 rounded-xl border bg-card py-1 pl-2 pr-2.5 text-[11px] leading-[1.25] text-foreground/80 transition-[border-color,background-color,color] duration-150',
                          hovered === i
                            ? 'border-foreground/25 bg-accent text-foreground'
                            : 'border-border',
                        )}
                        title={slice.link!}
                      >
                        {multi && (
                          <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-foreground/10 text-[9px] font-medium">
                            {(slice.column ?? 0) + 1}
                          </span>
                        )}
                        <LinkIcon className="h-3 w-3 shrink-0 text-muted-foreground/70" />
                        <span className="break-all text-left">{displayUrl(slice.link!)}</span>
                      </button>
                    ) : (
                      <button
                        className={cn(
                          'pointer-events-auto inline-flex h-6 items-center gap-1 rounded-full border border-dashed pl-2 pr-2.5 text-[11px] leading-none transition-[border-color,color,opacity] duration-150',
                          'border-warning/50 text-warning hover:border-warning hover:text-warning',
                        )}
                      >
                        <Plus className="h-3 w-3" />
                        <span>Link</span>
                      </button>
                    )}
                  </PopoverTrigger>
                  {linkEditor(i, isRealLink(slice.link) ? slice.link : null)}
                </Popover>
              </div>
            );
          })}
        </div>
      )}

      {/* RIGHT GUTTER — alt text, same overlay technique. */}
      {showAlt && (
        <div
          className="pointer-events-none absolute inset-y-0 right-0 z-10"
          style={{ width: `calc(50% - ${scaledWidth / 2 + GUTTER_PAD}px)` }}
        >
          {slices.map((slice, i) => {
            if (anchors.length !== slices.length) return null;
            return (
              <div
                key={i}
                className="absolute left-0 w-full max-w-[220px]"
                style={{ top: altTops[i], minHeight: PILL_H }}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              >
                {editingAltIndex === i ? (
                  <textarea
                    value={slice.altText || ''}
                    onChange={(e) => onUpdateSlice(i, { altText: e.target.value })}
                    onBlur={() => setEditingAltIndex(null)}
                    autoFocus
                    rows={2}
                    className="pointer-events-auto w-full resize-none rounded-md border border-input bg-card px-2 py-1 text-[11px] leading-snug text-foreground outline-none focus:border-foreground/30"
                  />
                ) : (
                  <p
                    onClick={() => setEditingAltIndex(i)}
                    className={cn(
                      'pointer-events-auto line-clamp-2 cursor-text rounded-md px-1.5 py-1 text-[11px] leading-snug transition-colors duration-150',
                      hovered === i ? 'bg-accent text-foreground' : 'text-muted-foreground/80',
                    )}
                  >
                    {slice.altText || <span className="italic opacity-50">Add alt text</span>}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* THE EMAIL — a single flush canvas. Nothing may push it apart. */}
      <div
        ref={canvasRef}
        className="relative shrink-0 overflow-hidden rounded-lg border bg-card"
        style={{ width: scaledWidth }}
      >
        {rows.map((group, rowIdx) => (
          <div key={rowIdx} className="relative flex">
            {group.map(({ slice, originalIndex }) => {
              const colWidth = slice.totalColumns
                ? scaledWidth / slice.totalColumns
                : scaledWidth / group.length;
              return (
                <div
                  key={originalIndex}
                  ref={(el) => (sliceRefs.current[originalIndex] = el)}
                  className="relative"
                  style={{ width: colWidth }}
                  onMouseEnter={() => setHover(originalIndex)}
                  onMouseLeave={() => setHover(null)}
                >
                  {slice.type === 'html' && slice.htmlContent ? (
                    <div
                      className="bg-card"
                      dangerouslySetInnerHTML={{ __html: slice.htmlContent }}
                      style={{ width: '100%' }}
                    />
                  ) : (
                    <SliceImageDropZone
                      imageUrl={slice.imageUrl}
                      altText={slice.altText}
                      type={slice.type}
                      htmlContent={slice.htmlContent}
                      brandId={brandId ?? undefined}
                      onUploaded={(newUrl) => onUpdateSlice(originalIndex, { imageUrl: newUrl })}
                    />
                  )}
                  {/* Hover highlight — pure overlay, no layout impact. */}
                  <div
                    className={cn(
                      'pointer-events-none absolute inset-0 transition-opacity duration-150',
                      hovered === originalIndex
                        ? 'opacity-100 ring-1 ring-inset ring-foreground/30'
                        : 'opacity-0',
                    )}
                  />
                  {/* Missing-link wash — quiet amber tint so gaps are scannable. */}
                  {showLinks && !isRealLink(slice.link) && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="pointer-events-none absolute inset-0 bg-warning/[0.06]" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">No link assigned</TooltipContent>
                    </Tooltip>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
