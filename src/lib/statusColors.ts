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

/** Overlay styling per detected block type (image slice / coded block / footer). */
export const blockOverlayClasses: Record<BlockKind, BlockOverlayClasses> = {
  image: {
    base: 'bg-red-500/20 border-red-500 hover:bg-red-500/30',
    selected: 'ring-2 ring-offset-2 ring-red-500 border-red-500 bg-red-500/25',
    label: 'bg-red-600',
    swatch: 'bg-red-500',
  },
  code: {
    base: 'bg-blue-500/20 border-blue-500 hover:bg-blue-500/30',
    selected: 'ring-2 ring-offset-2 ring-blue-500 border-blue-500 bg-blue-500/25',
    label: 'bg-blue-600',
    swatch: 'bg-blue-500',
  },
  footer: {
    base: 'bg-purple-500/20 border-purple-500 hover:bg-purple-500/30',
    selected: 'ring-2 ring-offset-2 ring-purple-500 border-purple-500 bg-purple-500/25',
    label: 'bg-purple-600',
    swatch: 'bg-purple-500',
  },
};

/** Quiet success chip (e.g. "N sections detected"). */
export const successChipClasses =
  'bg-green-500/10 text-green-600 dark:text-green-400';

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
