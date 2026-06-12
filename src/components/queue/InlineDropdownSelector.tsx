import { useState, useRef, useEffect } from 'react';
import { Pencil, ChevronDown, Check, Loader2, Bot } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

// ClickUp brand icon as inline SVG
const ClickUpIcon = ({ className }: { className?: string }) => (
  <svg 
    viewBox="0 0 24 24" 
    className={className}
    fill="none"
  >
    <path 
      d="M3.5 18.5L6.5 15.5C8.5 18 10.5 19 12 19C13.5 19 15.5 18 17.5 15.5L20.5 18.5C17.5 22 14.5 23.5 12 23.5C9.5 23.5 6.5 22 3.5 18.5Z" 
      fill="#7B68EE"
    />
    <path 
      d="M12 4L4 12L7 15L12 10L17 15L20 12L12 4Z" 
      fill="#49CCF9"
    />
  </svg>
);

interface InlineDropdownSelectorProps {
  selected: string | null;
  /** extra classes for the display/input text (e.g. dense muted row styling) */
  textClassName?: string;
  options: string[] | null;
  provided?: string | null;
  onSelect: (value: string) => Promise<boolean> | void;
  placeholder?: string;
  isProcessing?: boolean;
  processingStep?: string | null;
  isAiGenerated?: boolean;
  isClickUpSource?: boolean;
}

export function InlineDropdownSelector({
  selected,
  options,
  provided,
  onSelect,
  placeholder = 'Select...',
  isProcessing = false,
  processingStep = null,
  isAiGenerated = false,
  isClickUpSource = false,
  textClassName,
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
    if (!isSaving && !isEditing) {
      setIsEditing(true);
      setOpen(false);
    }
  };

  const handleChevronClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isSaving && allOptions.length > 0) {
      setIsEditing(false);
      setOpen((o) => !o);
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isSaving) {
      setIsEditing(true);
      setOpen(false);
    }
  };

  // Only show "Generating..." during actual copy generation, not during Klaviyo build
  const isGeneratingCopy = isProcessing && processingStep !== 'Building in Klaviyo';

  if (isGeneratingCopy) {
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
            isEditing && "ring-1 ring-foreground/30 ring-inset bg-card",
            open && "ring-1 ring-foreground/30 ring-inset bg-card"
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
                "flex-1 min-w-0 bg-transparent outline-none text-[13px] text-foreground px-1 py-0.5",
                textClassName
              )}
              placeholder={placeholder}
              disabled={isSaving}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span
              className={cn(
                "text-[13px] truncate px-1 py-0.5 flex-1 min-w-0 text-foreground flex items-center gap-1",
                textClassName,
                !displayValue && "text-muted-foreground/60 italic"
              )}
              title={displayValue || placeholder}
            >
              <span className="truncate">{displayValue || placeholder}</span>
              {isClickUpSource && displayValue && (
                <Tooltip delayDuration={100}>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-center">
                      <ClickUpIcon className="h-3.5 w-3.5 shrink-0 relative top-[-0.5px]" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    Retrieved from ClickUp Task
                  </TooltipContent>
                </Tooltip>
              )}
              {isAiGenerated && displayValue && !isClickUpSource && (
                <Tooltip delayDuration={100}>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-center">
                      <Bot className="h-3 w-3 text-muted-foreground/70 shrink-0" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    AI generated
                  </TooltipContent>
                </Tooltip>
              )}
            </span>
          )}

          {isSaving && (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground/70 shrink-0" />
          )}

          {!isSaving && !isEditing && allOptions.length > 0 && (
            <button
              type="button"
              onClick={handleChevronClick}
              className="shrink-0 rounded p-0.5 text-muted-foreground/70 opacity-0 transition-opacity hover:bg-secondary hover:text-foreground group-hover:opacity-100"
              aria-label="Show suggestions"
            >
              <ChevronDown className={cn("h-3.5 w-3.5", open && "rotate-180 transition-transform")} />
            </button>
          )}
        </div>
      </PopoverTrigger>
      {allOptions.length > 0 && (
        <PopoverContent 
          className="p-0 z-50 bg-card shadow-floating border-0 rounded-2xl overflow-hidden"
          align="start"
          side="bottom"
          sideOffset={2}
          style={{ width: '320px' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-2 border-b bg-secondary/50">
            <p className="text-[11px] text-muted-foreground font-medium">
              {allOptions.length} suggestion{allOptions.length !== 1 ? 's' : ''} — or write your own
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
                    "w-full flex items-start gap-2 px-2 py-2 text-[13px] text-left rounded transition-colors text-foreground",
                    "hover:bg-secondary",
                    isSelected && "bg-muted"
                  )}
                >
                  <div className="w-4 shrink-0 pt-0.5">
                    {isSelected && <Check className="h-4 w-4 text-foreground" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="leading-snug break-words">{opt.value}</p>
                    {opt.source === 'provided' && (
                      <span className="text-[11px] text-muted-foreground mt-0.5 block">From Figma</span>
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
              className="w-full flex items-center gap-2 px-2 py-2 text-[13px] text-left rounded transition-colors text-foreground hover:bg-muted border-t mt-1 pt-2 font-medium"
            >
              <div className="w-4 shrink-0 flex justify-center"><Pencil className="h-3.5 w-3.5" /></div>
              <span>Write your own…</span>
            </button>
          </div>
        </PopoverContent>
      )}
    </Popover>
  );
}
