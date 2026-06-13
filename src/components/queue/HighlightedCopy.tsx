// Renders SL/PT text with each misspelled/grammar-flagged word wavy-underlined
// in red. Hovering a flagged word opens a card with one-click replacements
// (from the local speller) plus "Add to dictionary". Replacing a word splices
// just that token and saves the whole string back via onReplace.

import { useMemo, useState } from 'react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { BookPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CopyIssue } from '@/hooks/useSpellcheck';

interface HighlightedCopyProps {
  text: string;
  issues: CopyIssue[];
  /** Save the full text after a one-click replacement. */
  onReplace: (newText: string) => void | Promise<unknown>;
  onAddToDictionary?: (word: string) => void | Promise<unknown>;
  className?: string;
  placeholder?: string;
  /** Single-line truncation (queue row). Off = wrap (expanded panel). */
  truncate?: boolean;
}

interface Segment {
  text: string;
  issue: CopyIssue | null;
  start: number;
}

export function HighlightedCopy({
  text,
  issues,
  onReplace,
  onAddToDictionary,
  className,
  placeholder,
  truncate = false,
}: HighlightedCopyProps) {
  const [busy, setBusy] = useState(false);

  // Keep only positioned issues, sorted, non-overlapping.
  const placed = useMemo(() => {
    return issues
      .filter((i) => i.index >= 0 && i.word && text.slice(i.index, i.index + i.word.length) === i.word)
      .sort((a, b) => a.index - b.index)
      .reduce<CopyIssue[]>((acc, i) => {
        const last = acc[acc.length - 1];
        if (!last || i.index >= last.index + last.word.length) acc.push(i);
        return acc;
      }, []);
  }, [issues, text]);

  const segments = useMemo<Segment[]>(() => {
    if (!text) return [];
    if (placed.length === 0) return [{ text, issue: null, start: 0 }];
    const segs: Segment[] = [];
    let cursor = 0;
    for (const issue of placed) {
      if (issue.index > cursor) segs.push({ text: text.slice(cursor, issue.index), issue: null, start: cursor });
      segs.push({ text: text.slice(issue.index, issue.index + issue.word.length), issue, start: issue.index });
      cursor = issue.index + issue.word.length;
    }
    if (cursor < text.length) segs.push({ text: text.slice(cursor), issue: null, start: cursor });
    return segs;
  }, [text, placed]);

  const apply = async (issue: CopyIssue, replacement: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const next = text.slice(0, issue.index) + replacement + text.slice(issue.index + issue.word.length);
      await onReplace(next);
    } finally {
      setBusy(false);
    }
  };

  const add = async (word: string) => {
    if (!onAddToDictionary || busy) return;
    setBusy(true);
    try {
      await onAddToDictionary(word);
    } finally {
      setBusy(false);
    }
  };

  if (!text) {
    return <span className={cn('italic text-muted-foreground/60', className)}>{placeholder}</span>;
  }

  return (
    <span className={cn('min-w-0', truncate ? 'block truncate' : 'inline', className)} title={truncate ? text : undefined}>
      {segments.map((seg, i) => {
        if (!seg.issue) return <span key={i}>{seg.text}</span>;
        const issue = seg.issue;
        return (
          <HoverCard key={i} openDelay={80} closeDelay={120}>
            <HoverCardTrigger asChild>
              <span
                onClick={(e) => e.stopPropagation()}
                className={cn(
                  'cursor-pointer underline underline-offset-[3px]',
                  issue.severity === 'suggestion'
                    ? 'decoration-dotted decoration-[1.5px] decoration-amber-500/80'
                    : 'decoration-wavy decoration-[1.5px] decoration-destructive',
                )}
              >
                {seg.text}
              </span>
            </HoverCardTrigger>
            <HoverCardContent
              align="start"
              side="bottom"
              sideOffset={6}
              className="z-50 w-[248px] overflow-hidden rounded-2xl border-0 bg-card p-0 shadow-floating"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2 border-b bg-secondary/50 px-3 py-2">
                <span
                  className={cn(
                    'inline-flex h-[18px] items-center rounded-full px-1.5 text-[10px] font-medium leading-none',
                    issue.severity === 'suggestion'
                      ? 'bg-amber-500/10 text-amber-700'
                      : 'bg-destructive/[0.08] text-destructive',
                  )}
                >
                  {issue.severity === 'suggestion'
                    ? 'Suggestion'
                    : issue.kind === 'spelling'
                      ? 'Spelling'
                      : 'Grammar'}
                </span>
                <span className="truncate text-[12px] font-semibold text-foreground">{issue.word}</span>
              </div>

              {issue.suggestions && issue.suggestions.length > 0 ? (
                <div className="p-1">
                  {issue.suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={busy}
                      onClick={() => apply(issue, s)}
                      className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[13px] text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
                    >
                      <span className="font-medium">{s}</span>
                      <span className="text-[10.5px] text-muted-foreground">Replace</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="px-3 py-2">
                  <p className="text-[11.5px] leading-snug text-muted-foreground">
                    {issue.message || 'No suggestion available — edit the field to fix.'}
                  </p>
                </div>
              )}

              {issue.kind === 'spelling' && onAddToDictionary && (
                <div className="border-t p-1">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => add(issue.word)}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[11.5px] font-medium text-foreground/70 transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
                    title={`Treat “${issue.word}” as correct for this brand`}
                  >
                    <BookPlus className="h-3.5 w-3.5" />
                    Add “{issue.word}” to dictionary
                  </button>
                </div>
              )}
            </HoverCardContent>
          </HoverCard>
        );
      })}
    </span>
  );
}
