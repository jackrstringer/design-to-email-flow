// Optional accent color for a segment set. Rendered ONLY as a small dot —
// the pill/row chrome always stays neutral. Palette is deliberately muted
// (desaturated, mid-lightness) so dots read as quiet markers, not alerts.

import { useState } from 'react';
import { Check } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export const SEGMENT_COLORS: Array<{ name: string; value: string }> = [
  { name: 'Slate', value: '#7C8794' },
  { name: 'Sage', value: '#8AA188' },
  { name: 'Moss', value: '#9AA37C' },
  { name: 'Amber', value: '#C2A36B' },
  { name: 'Terracotta', value: '#C08D6E' },
  { name: 'Rose', value: '#C58E9B' },
  { name: 'Mauve', value: '#A78EA9' },
  { name: 'Indigo', value: '#8B93C0' },
  { name: 'Teal', value: '#7FA6A3' },
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
        className="w-44 p-1 bg-card"
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="px-2 pb-1 pt-1.5 text-[11px] font-medium text-muted-foreground">
          Color
        </p>
        <div className="max-h-[240px]">
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] transition-colors hover:bg-accent"
            onClick={() => { onChange(null); setOpen(false); }}
          >
            <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/25 ring-1 ring-black/10" />
            <span className="flex-1 text-muted-foreground">None</span>
            {!color && <Check className="h-3 w-3 text-muted-foreground" />}
          </button>
          {SEGMENT_COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] transition-colors hover:bg-accent"
              onClick={() => { onChange(c.value); setOpen(false); }}
            >
              <span
                className="h-2.5 w-2.5 rounded-full ring-1 ring-black/10"
                style={{ backgroundColor: c.value }}
              />
              <span className="flex-1">{c.name}</span>
              {color === c.value && <Check className="h-3 w-3 text-muted-foreground" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
