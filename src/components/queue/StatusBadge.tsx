import { cn } from '@/lib/utils';
import { Loader2, AlertTriangle, XCircle, Archive } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface StatusBadgeProps {
  status: 'processing' | 'ready_for_review' | 'approved' | 'sent_to_klaviyo' | 'failed' | 'closed';
  processingStep?: string | null;
  processingPercent?: number;
  qaFlags?: Array<{ type: string }> | null;
}

export function StatusBadge({ status, processingStep, processingPercent = 0, qaFlags }: StatusBadgeProps) {
  const issueCount = qaFlags?.length || 0;

  if (status === 'processing') {
    return (
      <Tooltip>
        <TooltipTrigger>
          <div 
            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
            style={{ backgroundColor: 'hsl(204 100% 50% / 0.10)', color: 'hsl(204 80% 38%)' }}
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: 'hsl(204 80% 45%)' }} />
            {processingPercent}%
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">
            {processingStep || 'Processing...'}
          </p>
        </TooltipContent>
      </Tooltip>
    );
  }

  if (status === 'ready_for_review') {
    if (issueCount > 0) {
      return (
        <Tooltip>
          <TooltipTrigger>
            <div 
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
              style={{ backgroundColor: 'hsl(32 95% 44% / 0.10)', color: 'hsl(30 80% 36%)' }}
            >
              <AlertTriangle className="h-3 w-3 flex-shrink-0" />
              {issueCount} {issueCount === 1 ? 'issue' : 'issues'}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">Review required - {issueCount} QA flag(s)</p>
          </TooltipContent>
        </Tooltip>
      );
    }

    // No issues
    return (
      <div 
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
        style={{ backgroundColor: 'hsl(32 95% 44% / 0.10)', color: 'hsl(30 80% 36%)' }}
      >
        Ready for Review
      </div>
    );
  }

  if (status === 'approved') {
    return (
      <div 
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
        style={{ backgroundColor: 'hsl(152 60% 34% / 0.12)', color: 'hsl(152 65% 26%)' }}
      >
        Approve & Build
      </div>
    );
  }

  if (status === 'sent_to_klaviyo') {
    return (
      <div 
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
        style={{ backgroundColor: 'hsl(152 60% 34% / 0.12)', color: 'hsl(152 65% 26%)' }}
      >
        Built in Klaviyo
      </div>
    );
  }

  if (status === 'closed') {
    return (
      <div 
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
        style={{ backgroundColor: 'hsl(152 60% 34% / 0.12)', color: 'hsl(152 65% 26%)' }}
      >
        <Archive className="h-3 w-3 flex-shrink-0" />
        Closed
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div 
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
        style={{ backgroundColor: 'hsl(0 72% 51% / 0.10)', color: 'hsl(0 65% 42%)' }}
      >
        <XCircle className="h-3 w-3 flex-shrink-0" />
        Failed
      </div>
    );
  }

  return null;
}
