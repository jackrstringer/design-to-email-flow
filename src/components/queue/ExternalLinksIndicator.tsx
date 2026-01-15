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
    return <span className="text-gray-400 text-[11px]">—</span>;
  }

  const externalLinks = slices.filter(s => 
    s.link && !s.link.includes(brandDomain)
  );
  const hasExternalLinks = externalLinks.length > 0;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center justify-center">
          {hasExternalLinks ? (
            <div className="flex items-center gap-1 text-amber-600 text-[11px]">
              <AlertTriangle className="h-3 w-3" />
              <span>{externalLinks.length}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 text-green-600 text-[11px]">
              <Check className="h-3 w-3" />
              <span>None</span>
            </div>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <p className="text-xs">
          {hasExternalLinks 
            ? `${externalLinks.length} external link${externalLinks.length > 1 ? 's' : ''} found`
            : 'All links are internal'
          }
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
