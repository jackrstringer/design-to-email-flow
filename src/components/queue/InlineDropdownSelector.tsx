import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, Loader2 } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
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

  // Build options array with source info
  const allOptions = [
    ...(provided ? [{ value: provided, source: 'provided' as const }] : []),
    ...(options || []).filter(o => o !== provided).map(o => ({ value: o, source: 'generated' as const })),
  ];

  const handleSelect = async (value: string) => {
    // Optimistic update - immediately show the new value
    setEditValue(value);
    setOpen(false);
    setIsEditing(false);
    setIsSaving(true);
    
    try {
      await onSelect(value);
    } finally {
      setIsSaving(false);
    }
  };

  const handleBlur = async () => {
    if (editValue.trim() && editValue !== selected) {
      setIsSaving(true);
      try {
        await onSelect(editValue.trim());
      } finally {
        setIsSaving(false);
      }
    } else {
      setEditValue(selected || '');
    }
    setIsEditing(false);
  };

  const handleKeyDown = async (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (editValue.trim() && editValue !== selected) {
        setIsSaving(true);
        try {
          await onSelect(editValue.trim());
        } finally {
          setIsSaving(false);
        }
      }
      setIsEditing(false);
    } else if (e.key === 'Escape') {
      setEditValue(selected || '');
      setIsEditing(false);
    }
  };

  const handleTextClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isSaving) {
      setIsEditing(true);
      setOpen(false);
    }
  };

  const handleChevronClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isEditing && !isSaving) {
      setOpen(true);
    }
  };

  if (isProcessing) {
    return (
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>Generating...</span>
      </div>
    );
  }

  if (!options?.length && !provided && !selected) {
    return (
      <span className="text-sm text-muted-foreground">—</span>
    );
  }

  const displayValue = editValue || selected || '';

  return (
    <div className="group flex items-center gap-0.5" style={{ maxWidth }}>
      {isEditing ? (
        <input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className={cn(
            "flex-1 min-w-0 bg-transparent border-b border-primary/60 outline-none text-sm py-0.5",
            "focus:border-primary"
          )}
          placeholder={placeholder}
          disabled={isSaving}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span
          onClick={handleTextClick}
          className={cn(
            "text-sm truncate cursor-text rounded px-1 py-0.5 -mx-1 transition-colors flex-1 min-w-0",
            "hover:bg-muted/60",
            !displayValue && "text-muted-foreground italic"
          )}
          title={displayValue || placeholder}
        >
          {displayValue || placeholder}
        </span>
      )}

      {isSaving && (
        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0" />
      )}

      {!isSaving && allOptions.length > 0 && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              onClick={handleChevronClick}
              disabled={isEditing}
              className={cn(
                "p-0.5 rounded transition-all shrink-0",
                "opacity-0 group-hover:opacity-100",
                "hover:bg-muted",
                open && "opacity-100 bg-muted",
                isEditing && "hidden"
              )}
              aria-label="Select from options"
            >
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </PopoverTrigger>
          <PopoverContent 
            className="w-[400px] p-0 z-50" 
            align="start"
            sideOffset={4}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-2 border-b bg-muted/30">
              <p className="text-xs text-muted-foreground">
                {allOptions.length} option{allOptions.length !== 1 ? 's' : ''} available
              </p>
            </div>
            <div className="max-h-72 overflow-y-auto p-1">
              {allOptions.map((opt, i) => {
                const isSelected = displayValue === opt.value;
                return (
                  <button
                    key={i}
                    onClick={() => handleSelect(opt.value)}
                    className={cn(
                      "w-full flex items-start gap-2 px-2 py-2 text-sm text-left rounded transition-colors",
                      "hover:bg-muted",
                      isSelected && "bg-primary/10"
                    )}
                  >
                    <div className="w-4 shrink-0 pt-0.5">
                      {isSelected && <Check className="h-4 w-4 text-primary" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="leading-snug break-words">{opt.value}</p>
                      {opt.source === 'provided' && (
                        <span className="text-xs text-muted-foreground mt-0.5 block">From Figma</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
