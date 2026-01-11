import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface InboxPreviewProps {
  brandName: string;
  brandLogo?: string;
  subjectLine: string;
  previewText: string;
  onSubjectLineChange: (text: string) => void;
  onPreviewTextChange: (text: string) => void;
}

export function InboxPreview({
  brandName,
  brandLogo,
  subjectLine,
  previewText,
  onSubjectLineChange,
  onPreviewTextChange,
}: InboxPreviewProps) {
  const [isEditingSubject, setIsEditingSubject] = useState(false);
  const [isEditingPreview, setIsEditingPreview] = useState(false);
  const [editedSubject, setEditedSubject] = useState(subjectLine);
  const [editedPreview, setEditedPreview] = useState(previewText);
  
  const subjectInputRef = useRef<HTMLInputElement>(null);
  const previewInputRef = useRef<HTMLInputElement>(null);

  // Sync with parent when values change externally
  useEffect(() => {
    if (!isEditingSubject) setEditedSubject(subjectLine);
  }, [subjectLine, isEditingSubject]);

  useEffect(() => {
    if (!isEditingPreview) setEditedPreview(previewText);
  }, [previewText, isEditingPreview]);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditingSubject) subjectInputRef.current?.focus();
  }, [isEditingSubject]);

  useEffect(() => {
    if (isEditingPreview) previewInputRef.current?.focus();
  }, [isEditingPreview]);

  const handleSubjectBlur = () => {
    setIsEditingSubject(false);
    if (editedSubject !== subjectLine) {
      onSubjectLineChange(editedSubject);
    }
  };

  const handlePreviewBlur = () => {
    setIsEditingPreview(false);
    if (editedPreview !== previewText) {
      onPreviewTextChange(editedPreview);
    }
  };

  const handleSubjectKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubjectBlur();
    } else if (e.key === 'Escape') {
      setEditedSubject(subjectLine);
      setIsEditingSubject(false);
    }
  };

  const handlePreviewKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handlePreviewBlur();
    } else if (e.key === 'Escape') {
      setEditedPreview(previewText);
      setIsEditingPreview(false);
    }
  };

  // Get initials for avatar fallback
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // Get current time in 12-hour format
  const getCurrentTime = () => {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 || 12;
    return `${hour12}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Gmail-style header bar */}
      <div className="bg-muted/40 border border-border/50 rounded-t-lg px-4 py-2 flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded border border-border/50 flex items-center justify-center">
            <div className="w-2.5 h-2.5 border border-muted-foreground/40 rounded-sm" />
          </div>
          <div className="w-5 h-5 flex items-center justify-center">
            <svg className="w-4 h-4 text-muted-foreground/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
            </svg>
          </div>
        </div>
        <span className="text-xs text-muted-foreground">Primary</span>
      </div>

      {/* Email row - the main preview */}
      <div className="bg-background border-x border-b border-border/50 rounded-b-lg p-4 hover:shadow-md transition-shadow">
        <div className="flex items-start gap-3">
          {/* Avatar */}
          <div className="flex-shrink-0">
            {brandLogo ? (
              <img
                src={brandLogo}
                alt={brandName}
                className="w-10 h-10 rounded-full object-cover border border-border/30"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                <span className="text-sm font-semibold text-primary">
                  {getInitials(brandName || 'B')}
                </span>
              </div>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Top row: Brand name + time */}
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-sm text-foreground truncate">
                {brandName || 'Brand Name'}
              </span>
              <span className="text-xs text-muted-foreground flex-shrink-0 ml-3">
                {getCurrentTime()}
              </span>
            </div>

            {/* Subject line + Preview text row */}
            <div className="flex items-baseline gap-1.5">
              {/* Subject line - editable */}
              {isEditingSubject ? (
                <Input
                  ref={subjectInputRef}
                  value={editedSubject}
                  onChange={(e) => setEditedSubject(e.target.value)}
                  onBlur={handleSubjectBlur}
                  onKeyDown={handleSubjectKeyDown}
                  className="h-7 text-sm font-semibold px-1 -mx-1 max-w-[50%]"
                  placeholder="Enter subject line..."
                />
              ) : (
                <span
                  onClick={() => setIsEditingSubject(true)}
                  className={cn(
                    "font-semibold text-sm text-foreground truncate cursor-text hover:bg-muted/50 rounded px-1 -mx-1 transition-colors",
                    !subjectLine && "text-muted-foreground italic"
                  )}
                  title="Click to edit subject line"
                >
                  {subjectLine || 'Select a subject line →'}
                </span>
              )}

              {/* Separator */}
              {(subjectLine || isEditingSubject) && (previewText || isEditingPreview) && (
                <span className="text-muted-foreground flex-shrink-0">—</span>
              )}

              {/* Preview text - editable */}
              {isEditingPreview ? (
                <Input
                  ref={previewInputRef}
                  value={editedPreview}
                  onChange={(e) => setEditedPreview(e.target.value)}
                  onBlur={handlePreviewBlur}
                  onKeyDown={handlePreviewKeyDown}
                  className="h-7 text-sm px-1 -mx-1 flex-1"
                  placeholder="Enter preview text..."
                />
              ) : (
                <span
                  onClick={() => setIsEditingPreview(true)}
                  className={cn(
                    "text-sm text-muted-foreground truncate cursor-text hover:bg-muted/50 rounded px-1 -mx-1 transition-colors flex-1",
                    !previewText && "italic"
                  )}
                  title="Click to edit preview text"
                >
                  {previewText || 'Select preview text →'}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Helper text */}
      <p className="text-xs text-muted-foreground mt-2 text-center">
        Click on the subject line or preview text to edit directly
      </p>
    </div>
  );
}
