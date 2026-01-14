import { Check, AlertTriangle } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface ExternalLinksIndicatorProps {
  slices: Array<{ link?: string }>;
  brandDomain?: string;
}

export function ExternalLinksIndicator({ slices, brandDomain }: ExternalLinksIndicatorProps) {
  // If no brand domain set, we can't check for external links
  if (!brandDomain) {
    return <span className="text-gray-400">—</span>;
  }

  const hasExternalLinks = slices.some(s => 
    s.link && !s.link.includes(brandDomain)
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center justify-center">
          {hasExternalLinks ? (
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          ) : (
            <Check className="h-4 w-4 text-green-500" />
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <p className="text-xs">
          {hasExternalLinks ? 'Has external links' : 'All links internal'}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
