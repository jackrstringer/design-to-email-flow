import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Check, MoreHorizontal, ThumbsDown } from 'lucide-react';
import { QA_SEVERITY_META } from '@/lib/agentMeta';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type QaSeverity = keyof typeof QA_SEVERITY_META;

interface QaFlag {
  type?: string;
  severity: QaSeverity;
  category?: string;
  message: string;
  sliceIndex?: number;
}

interface QAFlagsPanelProps {
  flags: unknown;
  onJumpToSlice?: (index: number) => void;
  /** Needed for the "This is wrong" feedback action. */
  brandId?: string | null;
  queueId?: string;
  className?: string;
}

const SEVERITY_ORDER: QaSeverity[] = ['error', 'warning', 'info'];

function parseFlags(flags: unknown): Array<{ flag: QaFlag; index: number }> {
  // Legacy / malformed shapes (objects, strings, null): render nothing.
  if (!Array.isArray(flags)) return [];
  return flags
    .map((raw, index) => ({ raw, index }))
    .filter(({ raw }) => raw && typeof raw === 'object' && typeof (raw as QaFlag).message === 'string')
    .map(({ raw, index }) => {
      const f = raw as QaFlag;
      const severity: QaSeverity = SEVERITY_ORDER.includes(f.severity) ? f.severity : 'info';
      return { flag: { ...f, severity }, index };
    });
}

export function QAFlagsPanel({ flags, onJumpToSlice, brandId, queueId, className }: QAFlagsPanelProps) {
  const [hiddenIndexes, setHiddenIndexes] = useState<Set<number>>(new Set());

  const parsed = parseFlags(flags);
  const visible = parsed.filter(({ index }) => !hiddenIndexes.has(index));
  if (visible.length === 0) return null;

  const hideFlag = (index: number) => {
    setHiddenIndexes(prev => new Set(prev).add(index));
  };

  const markWrong = async (flag: QaFlag, index: number) => {
    hideFlag(index);
    if (!brandId) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('knowledge_events').insert({
        brand_id: brandId,
        user_id: user?.id ?? null,
        queue_id: queueId ?? null,
        event_type: 'qa_flag_dismissed',
        before: JSON.parse(JSON.stringify(flag)),
        after: { dismissed: true },
      });
      if (error) throw error;
    } catch (err) {
      console.warn('Failed to record QA flag feedback:', err);
      toast.error('Failed to record feedback');
    }
  };

  const grouped = SEVERITY_ORDER
    .map(severity => ({ severity, items: visible.filter(({ flag }) => flag.severity === severity) }))
    .filter(g => g.items.length > 0);

  return (
    <div className={cn('rounded-lg border bg-card p-3 space-y-3', className)}>
      <h4 className="text-sm font-medium">QA flags</h4>
      {grouped.map(({ severity, items }) => (
        <div key={severity} className="space-y-1.5">
          {items.map(({ flag, index }) => (
            <div key={index} className="flex items-start gap-2 group">
              <Badge variant="outline" className={cn('text-[10px] shrink-0 mt-0.5', QA_SEVERITY_META[severity].badgeClass)}>
                {QA_SEVERITY_META[severity].label}
              </Badge>
              <div className="flex-1 min-w-0">
                <p className="text-sm leading-snug">{flag.message}</p>
                {flag.category && (
                  <p className="text-xs text-muted-foreground mt-0.5">{flag.category}</p>
                )}
              </div>
              {typeof flag.sliceIndex === 'number' && (
                onJumpToSlice ? (
                  <button
                    onClick={() => onJumpToSlice(flag.sliceIndex as number)}
                    className="shrink-0 text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-colors"
                  >
                    Slice {flag.sliceIndex + 1}
                  </button>
                ) : (
                  <span className="shrink-0 text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                    Slice {flag.sliceIndex + 1}
                  </span>
                )
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="shrink-0 p-0.5 rounded text-muted-foreground/50 hover:text-foreground opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100 transition-opacity"
                    aria-label="Flag actions"
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => hideFlag(index)}>
                    <Check className="w-3.5 h-3.5 mr-2" />
                    Resolved
                  </DropdownMenuItem>
                  {brandId && (
                    <DropdownMenuItem onClick={() => markWrong(flag, index)}>
                      <ThumbsDown className="w-3.5 h-3.5 mr-2" />
                      This is wrong
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
