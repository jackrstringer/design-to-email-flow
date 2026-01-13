import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Check, AlertTriangle, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface SpellingError {
  text: string;
  correction: string;
  location?: string;
  sliceIndex?: number;
}

interface SpellingErrorsPanelProps {
  campaignId: string;
  spellingErrors: SpellingError[];
  slices: Array<{ yStartPercent?: number; yEndPercent?: number }>;
  source: string;
  sourceMetadata?: Record<string, unknown>;
  onErrorFixed: () => void;
}

export function SpellingErrorsPanel({
  campaignId,
  spellingErrors,
  slices,
  source,
  sourceMetadata,
  onErrorFixed,
}: SpellingErrorsPanelProps) {
  const [fixingErrors, setFixingErrors] = useState<Set<number>>(new Set());
  const [fixedErrors, setFixedErrors] = useState<Set<number>>(new Set());

  if (!spellingErrors || spellingErrors.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-green-600">
        <Check className="h-4 w-4" />
        <span>No spelling errors detected</span>
      </div>
    );
  }

  // Group errors by slice
  const errorsBySlice: Map<number, SpellingError[]> = new Map();
  spellingErrors.forEach((error, index) => {
    const sliceIndex = error.sliceIndex ?? 0;
    if (!errorsBySlice.has(sliceIndex)) {
      errorsBySlice.set(sliceIndex, []);
    }
    errorsBySlice.get(sliceIndex)!.push({ ...error, sliceIndex: index });
  });

  const handleMarkAsFixed = async (errorIndex: number, sliceIndex: number) => {
    // If source is not figma, we can't re-fetch
    if (source !== 'figma') {
      // Just mark as fixed locally
      setFixedErrors((prev) => new Set([...prev, errorIndex]));
      toast.success('Error marked as fixed');
      return;
    }

    setFixingErrors((prev) => new Set([...prev, errorIndex]));

    try {
      // Get slice coordinates
      const slice = slices[sliceIndex];
      if (!slice) {
        throw new Error('Slice not found');
      }

      // Call edge function to re-fetch this slice from Figma
      const { error } = await supabase.functions.invoke('refetch-slice', {
        body: {
          campaignQueueId: campaignId,
          sliceIndex,
          yTopPercent: slice.yStartPercent || 0,
          yBottomPercent: slice.yEndPercent || 100,
        },
      });

      if (error) throw error;

      setFixedErrors((prev) => new Set([...prev, errorIndex]));
      toast.success('Slice re-fetched from Figma');
      onErrorFixed();
    } catch (err) {
      console.error('Failed to refetch slice:', err);
      toast.error('Failed to re-fetch slice. Please try again.');
    } finally {
      setFixingErrors((prev) => {
        const next = new Set(prev);
        next.delete(errorIndex);
        return next;
      });
    }
  };

  const handleMarkAsFixedManual = (errorIndex: number) => {
    setFixedErrors((prev) => new Set([...prev, errorIndex]));
    toast.success('Marked as fixed');
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-yellow-600">
        <AlertTriangle className="h-4 w-4" />
        <span>{spellingErrors.length} spelling error{spellingErrors.length > 1 ? 's' : ''} detected</span>
      </div>

      <div className="space-y-2">
        {Array.from(errorsBySlice.entries()).map(([sliceIdx, errors]) => (
          <div key={sliceIdx} className="border rounded-lg p-3 bg-muted/30">
            <div className="text-xs font-medium text-muted-foreground mb-2">
              Slice {sliceIdx + 1}
            </div>
            <div className="space-y-2">
              {errors.map((error, i) => {
                const globalIndex = error.sliceIndex ?? i;
                const isFixed = fixedErrors.has(globalIndex);
                const isFixing = fixingErrors.has(globalIndex);

                return (
                  <div
                    key={i}
                    className={cn(
                      "flex items-center justify-between gap-2 text-sm py-1.5 px-2 rounded",
                      isFixed ? "bg-green-50 dark:bg-green-950/20" : "bg-background"
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      {isFixed ? (
                        <span className="text-green-600 flex items-center gap-1">
                          <Check className="h-3 w-3" />
                          Fixed
                        </span>
                      ) : (
                        <>
                          <span className="text-red-600 line-through">{error.text}</span>
                          <span className="text-muted-foreground mx-1">→</span>
                          <span className="text-green-600">{error.correction}</span>
                        </>
                      )}
                    </div>
                    {!isFixed && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          source === 'figma'
                            ? handleMarkAsFixed(globalIndex, sliceIdx)
                            : handleMarkAsFixedManual(globalIndex)
                        }
                        disabled={isFixing}
                        className="shrink-0 h-7 text-xs"
                      >
                        {isFixing ? (
                          <>
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            Fetching...
                          </>
                        ) : (
                          'Mark as Fixed'
                        )}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {source !== 'figma' && (
        <p className="text-xs text-muted-foreground">
          Note: Auto-refresh is only available for Figma sources. For uploads, please re-upload after fixing.
        </p>
      )}
    </div>
  );
}
