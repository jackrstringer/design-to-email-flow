import { AlertTriangle, Link as LinkIcon } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface LinksTooltipProps {
  slices: Array<{ link?: string; altText?: string }>;
  linkCount: number;
  missingLinks: number;
}

export function LinksTooltip({ slices, linkCount, missingLinks }: LinksTooltipProps) {
  if (slices.length === 0) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }

  return (
    <Tooltip>
      <TooltipTrigger>
        <div className="flex items-center gap-1.5">
          <LinkIcon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-sm">{linkCount} links</span>
          {missingLinks > 0 && (
            <span className="flex items-center gap-0.5 text-yellow-600">
              <AlertTriangle className="h-3 w-3" />
              <span className="text-xs">{missingLinks}</span>
            </span>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent side="left" className="max-w-xs">
        <div className="space-y-1">
          {slices.map((slice, index) => (
            <div key={index} className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground w-16 shrink-0">
                Slice {index + 1}:
              </span>
              {slice.link ? (
                <span className="truncate">{slice.link}</span>
              ) : (
                <span className="text-yellow-600 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Missing link
                </span>
              )}
            </div>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
