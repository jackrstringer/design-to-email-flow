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
  isProcessing?: boolean;
}

export function InlineDropdownSelector({
  selected,
  options,
  provided,
  onSelect,
  placeholder = 'Select...',
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

  // Single click opens dropdown, double-click enters edit mode
  const handleCellClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isSaving && allOptions.length > 0 && !isEditing) {
      setOpen(true);
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isSaving) {
      setIsEditing(true);
      setOpen(false);
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
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div 
          className={cn(
            "group flex items-center gap-0.5 rounded-sm transition-shadow cursor-pointer w-full",
            isEditing && "ring-2 ring-blue-500 ring-inset",
            open && "ring-2 ring-blue-500 ring-inset"
          )}
          onClick={handleCellClick}
          onDoubleClick={handleDoubleClick}
        >
          {isEditing ? (
            <input
              ref={inputRef}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              className={cn(
                "flex-1 min-w-0 bg-white outline-none text-[13px] text-gray-900 px-1 py-0.5"
              )}
              placeholder={placeholder}
              disabled={isSaving}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span
              className={cn(
                "text-[13px] truncate px-1 py-0.5 flex-1 min-w-0 text-gray-900",
                !displayValue && "text-gray-400 italic"
              )}
              title={displayValue || placeholder}
            >
              {displayValue || placeholder}
            </span>
          )}

          {isSaving && (
            <Loader2 className="h-3 w-3 animate-spin text-gray-400 shrink-0" />
          )}

          {!isSaving && !isEditing && allOptions.length > 0 && (
            <ChevronDown className={cn(
              "h-3.5 w-3.5 text-gray-400 shrink-0 transition-opacity",
              "opacity-0 group-hover:opacity-100",
              open && "opacity-100"
            )} />
          )}
        </div>
      </PopoverTrigger>
      {allOptions.length > 0 && (
        <PopoverContent 
          className="p-0 z-50 bg-white shadow-lg border"
          align="start"
          side="bottom"
          sideOffset={2}
          style={{ width: '320px' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-2 border-b bg-gray-50">
            <p className="text-[11px] text-gray-500 font-medium">
              {allOptions.length} AI-generated option{allOptions.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="p-1">
            {allOptions.map((opt, i) => {
              const isSelected = displayValue === opt.value;
              return (
                <button
                  key={i}
                  onClick={() => handleSelect(opt.value)}
                  className={cn(
                    "w-full flex items-start gap-2 px-2 py-2 text-[13px] text-left rounded transition-colors text-gray-900",
                    "hover:bg-gray-100",
                    isSelected && "bg-blue-50"
                  )}
                >
                  <div className="w-4 shrink-0 pt-0.5">
                    {isSelected && <Check className="h-4 w-4 text-blue-600" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="leading-snug break-words">{opt.value}</p>
                    {opt.source === 'provided' && (
                      <span className="text-[11px] text-gray-500 mt-0.5 block">From Figma</span>
                    )}
                  </div>
                </button>
              );
            })}
            {/* Edit custom option */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                setIsEditing(true);
              }}
              className="w-full flex items-center gap-2 px-2 py-2 text-[13px] text-left rounded transition-colors text-gray-500 hover:bg-gray-100 border-t mt-1 pt-2"
            >
              <div className="w-4 shrink-0" />
              <span className="italic">Edit custom...</span>
            </button>
          </div>
        </PopoverContent>
      )}
    </Popover>
  );
}
