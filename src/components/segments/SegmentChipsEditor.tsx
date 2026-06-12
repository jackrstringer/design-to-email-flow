import { useState } from 'react';
import { X, Plus, Loader2, AlertTriangle } from 'lucide-react';
import { KlaviyoSegment } from '@/hooks/useSegmentPresets';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';

interface SegmentChipsEditorProps {
  selectedSegments: KlaviyoSegment[];
  availableSegments: KlaviyoSegment[];
  loading: boolean;
  onChange: (segments: KlaviyoSegment[]) => void;
  placeholder?: string;
}

export function SegmentChipsEditor({
  selectedSegments,
  availableSegments,
  loading,
  onChange,
  placeholder = 'Add segment...',
}: SegmentChipsEditorProps) {
  const [open, setOpen] = useState(false);

  const selectedIds = new Set(selectedSegments.map((s) => s.id));
  const unselectedSegments = availableSegments.filter((s) => !selectedIds.has(s.id));

  const handleRemove = (segmentId: string) => {
    onChange(selectedSegments.filter((s) => s.id !== segmentId));
  };

  const handleAdd = (segment: KlaviyoSegment) => {
    onChange([...selectedSegments, segment]);
    setOpen(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {selectedSegments.map((segment) => (
        <Badge
          key={segment.id}
          variant="secondary"
          className={cn(
            "flex h-[22px] max-w-[200px] items-center gap-1 rounded-full border pl-2.5 pr-1 text-[11px] font-medium leading-none transition-colors duration-150",
            segment.missing
              ? "border-destructive/30 bg-destructive/[0.07] text-destructive hover:bg-destructive/10"
              : "border-border bg-card text-foreground/80 hover:border-foreground/25 hover:text-foreground"
          )}
          title={
            segment.missing
              ? `This segment no longer exists in Klaviyo (ID: ${segment.id}). Remove it or pick a replacement — campaigns using this segment set will fail to send.`
              : undefined
          }
        >
          {segment.missing && <AlertTriangle className="h-3 w-3 shrink-0" />}
          <span className="truncate">{segment.name}</span>
          <button
            onClick={() => handleRemove(segment.id)}
            className={cn(
              "ml-0.5 shrink-0 rounded-full p-0.5 text-muted-foreground/60 transition-colors duration-150 hover:text-foreground",
              segment.missing ? "hover:bg-destructive/15" : "hover:bg-accent"
            )}
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button className="inline-flex h-[22px] items-center gap-1 rounded-full border border-dashed border-input pl-2 pr-2.5 text-[11px] leading-none text-muted-foreground transition-colors duration-150 hover:border-foreground/30 hover:text-foreground">
            <Plus className="h-3 w-3" />
            {selectedSegments.length === 0 ? placeholder : 'Add'}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start">
          <Command>
            <CommandInput placeholder="Search segments..." />
            <CommandList>
              {loading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              ) : (
                <>
                  <CommandEmpty>No segments found.</CommandEmpty>
                  <CommandGroup>
                    {unselectedSegments.map((segment) => (
                      <CommandItem
                        key={segment.id}
                        onSelect={() => handleAdd(segment)}
                        className="cursor-pointer"
                      >
                        <span className="truncate">{segment.name}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
