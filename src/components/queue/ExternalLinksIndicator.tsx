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
  if (!brandDomain) {
    return <span className="text-[11px] text-gray-400">—</span>;
  }

  const externalLinks = slices.filter(s => 
    s.link && !s.link.includes(brandDomain)
  );
  const hasExternalLinks = externalLinks.length > 0;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-1">
          {hasExternalLinks ? (
            <>
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-[11px] text-amber-600">{externalLinks.length}</span>
            </>
          ) : (
            <Check className="h-3.5 w-3.5 text-green-500" />
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <p className="text-xs">
          {hasExternalLinks 
            ? `${externalLinks.length} link(s) outside ${brandDomain}` 
            : 'All links within brand domain'}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
