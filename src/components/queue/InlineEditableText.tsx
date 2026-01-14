import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface InlineEditableTextProps {
  value: string;
  onSave: (value: string) => Promise<boolean> | void;
  className?: string;
  placeholder?: string;
}

export function InlineEditableText({ 
  value, 
  onSave, 
  className,
  placeholder = 'Click to edit...'
}: InlineEditableTextProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    setEditValue(value);
  }, [value]);

  const handleSave = async () => {
    if (editValue.trim() === value) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    try {
      await onSave(editValue.trim());
    } finally {
      setIsSaving(false);
      setIsEditing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setEditValue(value);
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        disabled={isSaving}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "w-full bg-white text-[13px] text-gray-900 outline-none px-1 py-0.5",
          "ring-2 ring-blue-500 ring-inset rounded-sm",
          className
        )}
      />
    );
  }

  return (
    <span
      onClick={(e) => {
        e.stopPropagation();
        setIsEditing(true);
      }}
      className={cn(
        "cursor-text px-1 py-0.5 rounded-sm truncate block text-[13px] text-gray-900",
        "hover:ring-1 hover:ring-gray-300 hover:ring-inset transition-shadow",
        !value && "text-gray-400 italic",
        className
      )}
    >
      {value || placeholder}
    </span>
  );
}
