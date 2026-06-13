// Optional accent color for a segment set. Rendered ONLY as a small dot —
// the pill/row chrome always stays neutral. Palette is deliberately muted
// (desaturated, mid-lightness) so dots read as quiet markers, not alerts.

import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export const SEGMENT_COLORS: Array<{ name: string; value: string }> = [
  { name: 'Slate',      value: '#7C8794' },
  { name: 'Sage',       value: '#8AA188' },
  { name: 'Moss',       value: '#9AA37C' },
  { name: 'Amber',      value: '#C2A36B' },
  { name: 'Terracotta', value: '#C08D6E' },
  { name: 'Rose',       value: '#C58E9B' },
  { name: 'Mauve',      value: '#A78EA9' },
  { name: 'Indigo',     value: '#8B93C0' },
  { name: 'Teal',       value: '#7FA6A3' },
  { name: 'Stone',      value: '#A09A90' },
  { name: 'Dusk',       value: '#9396AA' },
  { name: 'Clay',       value: '#B89B87' },
  { name: 'Olive',      value: '#8E9A6E' },
  { name: 'Blush',      value: '#C2939B' },
  { name: 'Steel',      value: '#829BB0' },
];

interface SegmentColorPickerProps {
  color: string | null;
  onChange: (color: string | null) => void;
}

export function SegmentColorPicker({ color, onChange }: SegmentColorPickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Set color"
          className="group/dot flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full transition-transform duration-150 hover:scale-110 active:scale-95"
          onClick={(e) => e.stopPropagation()}
        >
          <span
            className={cn(
              'h-2 w-2 rounded-full ring-1 ring-black/10 transition-opacity',
              !color && 'bg-muted-foreground/30 group-hover/dot:bg-muted-foreground/50',
            )}
            style={color ? { backgroundColor: color } : undefined}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-2 bg-card shadow-floating"
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
          {/* "No color" clear swatch — always first */}
          <button
            type="button"
            title="No color"
            aria-label="Remove color"
            className={cn(
              'relative flex h-[22px] w-[22px] items-center justify-center rounded-full',
              'border border-border bg-muted transition-transform duration-100',
              'hover:scale-110 active:scale-95',
              !color && 'ring-2 ring-offset-1 ring-foreground/40',
            )}
            onClick={() => { onChange(null); setOpen(false); }}
          >
            <X className="h-3 w-3 text-muted-foreground" strokeWidth={2.5} />
          </button>

          {SEGMENT_COLORS.map((c) => {
            const selected = color === c.value;
            return (
              <button
                key={c.value}
                type="button"
                title={c.name}
                aria-label={c.name}
                className={cn(
                  'relative flex h-[22px] w-[22px] items-center justify-center rounded-full',
                  'transition-transform duration-100 hover:scale-110 active:scale-95',
                  selected && 'ring-2 ring-offset-1 ring-foreground/40',
                )}
                style={{ backgroundColor: c.value }}
                onClick={() => { onChange(c.value); setOpen(false); }}
              >
                {selected && (
                  <Check
                    className="h-3 w-3 text-white drop-shadow-sm"
                    strokeWidth={3}
                  />
                )}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
