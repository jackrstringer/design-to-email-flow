/**
 * Semantic color class groups for slice/block overlays and status indicators.
 *
 * Defined once here so overlays, editors, and previews stay visually in sync.
 * Keep these as Tailwind class strings (not hex values) so dark mode and
 * theme tokens keep working.
 */

export type BlockKind = 'image' | 'code' | 'footer';

interface BlockOverlayClasses {
  /** Default overlay fill + border + hover */
  base: string;
  /** Additional classes when the block is selected */
  selected: string;
  /** Solid background for the block's name label */
  label: string;
  /** Small legend swatch color */
  swatch: string;
}

/**
 * Overlay styling per detected block type. Monochrome by design: kinds are
 * differentiated by line STYLE (solid / dashed / dotted), drafting-table
 * style, never by hue.
 */
export const blockOverlayClasses: Record<BlockKind, BlockOverlayClasses> = {
  image: {
    base: 'bg-foreground/10 border-foreground border-solid hover:bg-foreground/15',
    selected: 'ring-2 ring-offset-2 ring-foreground border-foreground bg-foreground/15',
    label: 'bg-foreground',
    swatch: 'bg-foreground',
  },
  code: {
    base: 'bg-foreground/5 border-foreground border-dashed hover:bg-foreground/10',
    selected: 'ring-2 ring-offset-2 ring-foreground border-foreground border-dashed bg-foreground/10',
    label: 'bg-foreground/80',
    swatch: 'bg-foreground/60',
  },
  footer: {
    base: 'bg-foreground/5 border-foreground/60 border-dotted hover:bg-foreground/10',
    selected: 'ring-2 ring-offset-2 ring-foreground border-foreground border-dotted bg-foreground/10',
    label: 'bg-foreground/60',
    swatch: 'bg-foreground/30',
  },
};

/** Quiet confirmation chip (e.g. "N sections detected") — ink, not green. */
export const successChipClasses = 'bg-secondary text-foreground';

/** Primary-accent action button (replaces hardcoded bg-orange-500 buttons). */
export const primaryActionClasses =
  'bg-primary hover:bg-primary/90 text-primary-foreground';

/** Footer cutoff drag handle + exclusion zone (uses the brand primary token). */
export const cutoffClasses = {
  lineActive: 'border-primary',
  lineInactive: 'border-primary/50',
  handleActive: 'bg-primary text-primary-foreground shadow-lg',
  handleInactive: 'bg-primary/80 text-primary-foreground/90 group-hover:bg-primary',
  zone: 'bg-primary/20',
  zoneStripes:
    'bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,hsl(var(--primary)/0.08)_10px,hsl(var(--primary)/0.08)_20px)]',
  zoneLabel: 'text-primary bg-background/90 border border-primary/30',
  grabZone: 'bg-primary/30 group-hover:bg-primary/50',
};
