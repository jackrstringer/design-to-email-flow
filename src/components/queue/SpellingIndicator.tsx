import { Check } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface SpellingIndicatorProps {
  spellingErrors: Array<{ text: string }> | null;
}

export function SpellingIndicator({ spellingErrors }: SpellingIndicatorProps) {
  const errorCount = spellingErrors?.length || 0;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center justify-center">
          {errorCount > 0 ? (
            <div className="flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-red-100 text-red-700 text-[11px] font-medium">
              {errorCount}
            </div>
          ) : (
            <Check className="h-4 w-4 text-green-500" />
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <p className="text-xs">
          {errorCount > 0 
            ? `${errorCount} spelling error${errorCount > 1 ? 's' : ''} detected` 
            : 'No spelling errors'}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
