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
            "flex items-center gap-1 pr-1 whitespace-nowrap",
            segment.missing
              ? "bg-destructive/10 text-destructive border-destructive/30 hover:bg-destructive/15"
              : "bg-primary/10 text-primary border-primary/20 hover:bg-primary/15"
          )}
          title={
            segment.missing
              ? `This segment no longer exists in Klaviyo (ID: ${segment.id}). Remove it or pick a replacement — campaigns using this segment set will fail to send.`
              : undefined
          }
        >
          {segment.missing && <AlertTriangle className="h-3 w-3" />}
          <span>{segment.name}</span>
          <button
            onClick={() => handleRemove(segment.id)}
            className={cn(
              "ml-0.5 rounded-full p-0.5",
              segment.missing ? "hover:bg-destructive/20" : "hover:bg-primary/20"
            )}
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
