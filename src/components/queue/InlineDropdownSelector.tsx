import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
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
  maxWidth = '300px',
  isProcessing = false,
}: InlineDropdownSelectorProps) {
  const [open, setOpen] = useState(false);
  const [editValue, setEditValue] = useState(selected || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync edit value with selected prop
  useEffect(() => {
    if (!isEditing) {
      setEditValue(selected || '');
    }
  }, [selected, isEditing]);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const allOptions = [
    ...(provided ? [{ value: provided, source: 'provided' as const }] : []),
    ...(options || []).map(o => ({ value: o, source: 'generated' as const })),
  ];

  const handleSelect = async (value: string) => {
    setIsSaving(true);
    try {
      await onSelect(value);
      setEditValue(value);
      setIsEditing(false);
    } finally {
      setIsSaving(false);
      setOpen(false);
    }
  };

  const handleBlur = async () => {
    if (editValue.trim() && editValue !== selected) {
      await handleSelect(editValue.trim());
    } else {
      setEditValue(selected || '');
    }
    setIsEditing(false);
  };

  const handleKeyDown = async (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (editValue.trim() && editValue !== selected) {
        await handleSelect(editValue.trim());
      } else {
        setIsEditing(false);
      }
    } else if (e.key === 'Escape') {
      setEditValue(selected || '');
      setIsEditing(false);
    }
  };

  const handleTextClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
  };

  const handleChevronClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isEditing) {
      setOpen(true);
    }
  };

  if (isProcessing) {
    return (
      <span className="text-sm text-muted-foreground animate-pulse">
        Generating...
      </span>
    );
  }

  if (!options?.length && !provided && !selected) {
    return (
      <span className="text-sm text-muted-foreground">—</span>
    );
  }

  return (
    <div className="flex items-center gap-1" style={{ maxWidth }}>
      {isEditing ? (
        <Input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="h-7 text-sm px-2 py-1 flex-1"
          placeholder={placeholder}
          disabled={isSaving}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span
          onClick={handleTextClick}
          className={cn(
            "text-sm truncate cursor-text hover:bg-muted/50 rounded px-1 py-0.5 transition-colors flex-1",
            !selected && "text-muted-foreground italic"
          )}
          title={selected || placeholder}
        >
          {selected || placeholder}
        </span>
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            onClick={handleChevronClick}
            disabled={isSaving || allOptions.length === 0}
            className={cn(
              "p-1 hover:bg-muted rounded transition-colors shrink-0",
              allOptions.length === 0 && "opacity-0 pointer-events-none"
            )}
            aria-label="Select from options"
          >
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent 
          className="w-96 p-0" 
          align="start"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-2 border-b">
            <p className="text-xs text-muted-foreground">
              {allOptions.length} option{allOptions.length !== 1 ? 's' : ''} available
            </p>
          </div>
          <div className="max-h-72 overflow-y-auto p-1">
            {allOptions.map((opt, i) => (
              <button
                key={i}
                onClick={() => handleSelect(opt.value)}
                className={cn(
                  "w-full flex items-start gap-2 px-2 py-2 text-sm text-left rounded hover:bg-muted transition-colors",
                  selected === opt.value && "bg-muted"
                )}
              >
                <Check className={cn(
                  "h-4 w-4 mt-0.5 shrink-0",
                  selected === opt.value ? "opacity-100 text-primary" : "opacity-0"
                )} />
                <div className="flex-1 min-w-0">
                  <p className="leading-snug">{opt.value}</p>
                  {opt.source === 'provided' && (
                    <span className="text-xs text-muted-foreground mt-0.5 block">From Figma</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
