// Small destructive indicator shown inside a red-outlined SL/PT field.
// Click opens a popover listing each flagged word/issue, with one-click
// "Add to dictionary" for misspellings (brand/product names, intentional
// spellings). Neutral pill aesthetic; destructive color only for the error
// state itself.

import { useState } from 'react';
import { AlertCircle, BookPlus } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { CopyIssue } from '@/hooks/useSpellcheck';

interface CopyQaIndicatorProps {
  issues: CopyIssue[];
  /** One-click whitelist; omitted (e.g. no brand) hides the action. */
  onAddToDictionary?: (word: string) => void | Promise<unknown>;
  className?: string;
}

export function CopyQaIndicator({ issues, onAddToDictionary, className }: CopyQaIndicatorProps) {
  const [open, setOpen] = useState(false);
  const [addingWord, setAddingWord] = useState<string | null>(null);

  if (issues.length === 0) return null;

  const handleAdd = async (word: string) => {
    if (!onAddToDictionary) return;
    setAddingWord(word);
    try {
      await onAddToDictionary(word);
    } finally {
      setAddingWord(null);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((o) => !o);
          }}
          onDoubleClick={(e) => e.stopPropagation()}
          className={cn(
            'flex shrink-0 items-center gap-1 rounded-full px-1.5 py-px text-[10.5px] font-semibold text-destructive transition-colors hover:bg-destructive/10',
            className,
          )}
          aria-label={`${issues.length} copy issue${issues.length === 1 ? '' : 's'}`}
        >
          <AlertCircle className="h-3 w-3" strokeWidth={2.5} />
          {issues.length}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="z-50 w-[300px] overflow-hidden rounded-2xl border-0 bg-card p-0 shadow-floating"
        align="end"
        side="bottom"
        sideOffset={4}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b bg-secondary/50 px-3 py-2">
          <p className="text-[11px] font-medium text-muted-foreground">
            {issues.length} issue{issues.length === 1 ? '' : 's'} found — fix before building
          </p>
        </div>
        <div className="p-1">
          {issues.map((issue, i) => (
            <div key={`${issue.kind}-${issue.word}-${i}`} className="flex items-start gap-2 rounded px-2 py-1.5">
              <span
                className={cn(
                  'mt-px inline-flex h-[18px] shrink-0 items-center rounded-full px-1.5 text-[10px] font-medium leading-none',
                  issue.kind === 'spelling'
                    ? 'bg-destructive/[0.08] text-destructive'
                    : 'bg-muted text-foreground/65',
                )}
              >
                {issue.kind === 'spelling' ? 'Spelling' : 'Grammar'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-medium leading-snug text-foreground">{issue.word}</p>
                {issue.message && (
                  <p className="text-[11px] leading-snug text-muted-foreground">{issue.message}</p>
                )}
              </div>
              {issue.kind === 'spelling' && onAddToDictionary && (
                <button
                  type="button"
                  disabled={addingWord === issue.word}
                  onClick={() => handleAdd(issue.word)}
                  className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full bg-muted px-2 text-[10.5px] font-medium text-foreground/70 transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
                  title={`Treat “${issue.word}” as correct for this brand`}
                >
                  <BookPlus className="h-3 w-3" />
                  Add to dictionary
                </button>
              )}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
