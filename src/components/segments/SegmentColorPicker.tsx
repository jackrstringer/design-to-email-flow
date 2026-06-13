// Accent color for a segment set, rendered as a small dot. Palette is bright
// and saturated (ClickUp-style) so the labels pop and are easy to tell apart.

import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export const SEGMENT_COLORS: Array<{ name: string; value: string }> = [
  { name: 'Red',      value: '#EF4444' },
  { name: 'Orange',   value: '#F97316' },
  { name: 'Amber',    value: '#F59E0B' },
  { name: 'Yellow',   value: '#EAB308' },
  { name: 'Lime',     value: '#84CC16' },
  { name: 'Green',    value: '#22C55E' },
  { name: 'Emerald',  value: '#10B981' },
  { name: 'Teal',     value: '#14B8A6' },
  { name: 'Cyan',     value: '#06B6D4' },
  { name: 'Sky',      value: '#0EA5E9' },
  { name: 'Blue',     value: '#3B82F6' },
  { name: 'Indigo',   value: '#6366F1' },
  { name: 'Violet',   value: '#8B5CF6' },
  { name: 'Purple',   value: '#A855F7' },
  { name: 'Fuchsia',  value: '#D946EF' },
  { name: 'Pink',     value: '#EC4899' },
  { name: 'Rose',     value: '#F43F5E' },
  { name: 'Slate',    value: '#64748B' },
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
