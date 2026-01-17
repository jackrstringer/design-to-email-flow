import { useState } from 'react';
import { X, Plus, Loader2, Check } from 'lucide-react';
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
    <div className="flex flex-wrap items-center gap-1">
      {selectedSegments.map((segment) => (
        <Badge
          key={segment.id}
          variant="secondary"
          className="text-xs gap-1 pr-1"
        >
          <span className="truncate max-w-[120px]">{segment.name}</span>
          <button
            onClick={() => handleRemove(segment.id)}
            className="ml-0.5 hover:bg-muted rounded-full p-0.5"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs text-muted-foreground"
          >
            <Plus className="h-3 w-3 mr-1" />
            {selectedSegments.length === 0 ? placeholder : 'Add'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="start">
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
