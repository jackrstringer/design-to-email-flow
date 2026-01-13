import { useState } from 'react';
import { ChevronDown, Check, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface InlineDropdownSelectorProps {
  selected: string | null;
  options: string[] | null;
  provided?: string | null;
  onSelect: (value: string) => Promise<boolean> | void;
  placeholder?: string;
  maxWidth?: string;
  isProcessing?: boolean;
}

export function InlineDropdownSelector({
  selected,
  options,
  provided,
  onSelect,
  placeholder = 'Select...',
  maxWidth = '250px',
  isProcessing = false,
}: InlineDropdownSelectorProps) {
  const [open, setOpen] = useState(false);
  const [customValue, setCustomValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const allOptions = [
    ...(provided ? [{ value: provided, source: 'provided' as const }] : []),
    ...(options || []).map(o => ({ value: o, source: 'generated' as const })),
  ];

  const handleSelect = async (value: string) => {
    setIsSaving(true);
    try {
      await onSelect(value);
    } finally {
      setIsSaving(false);
      setOpen(false);
    }
  };

  const handleCustomSubmit = async () => {
    if (!customValue.trim()) return;
    await handleSelect(customValue.trim());
    setCustomValue('');
  };

  if (isProcessing) {
    return (
      <span className="text-sm text-muted-foreground animate-pulse">
        Generating...
      </span>
    );
  }

  if (!options?.length && !provided) {
    return (
      <span className="text-sm text-muted-foreground">—</span>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          disabled={isSaving}
          className={cn(
            "flex items-center gap-1 text-sm text-left hover:bg-muted/50 px-1 py-0.5 rounded transition-colors",
            "max-w-[250px] truncate",
            !selected && "text-muted-foreground"
          )}
          style={{ maxWidth }}
        >
          <span className="truncate">
            {selected ? `"${selected}"` : placeholder}
          </span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-80 p-0" 
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="max-h-60 overflow-y-auto p-1">
          {allOptions.map((opt, i) => (
            <button
              key={i}
              onClick={() => handleSelect(opt.value)}
              className={cn(
                "w-full flex items-start gap-2 px-2 py-1.5 text-sm text-left rounded hover:bg-muted transition-colors",
                selected === opt.value && "bg-muted"
              )}
            >
              <Check className={cn(
                "h-4 w-4 mt-0.5 shrink-0",
                selected === opt.value ? "opacity-100" : "opacity-0"
              )} />
              <div className="flex-1 min-w-0">
                <p className="line-clamp-2">{opt.value}</p>
                {opt.source === 'provided' && (
                  <span className="text-xs text-muted-foreground">Provided</span>
                )}
              </div>
            </button>
          ))}
        </div>
        
        <div className="border-t p-2">
          <div className="flex gap-2">
            <Input
              placeholder="Custom value..."
              value={customValue}
              onChange={(e) => setCustomValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCustomSubmit()}
              className="h-8 text-sm"
            />
            <Button 
              size="sm" 
              variant="ghost"
              onClick={handleCustomSubmit}
              disabled={!customValue.trim()}
            >
              <Sparkles className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
