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
            style={{ backgroundColor: 'hsl(0 0% 95%)', color: 'hsl(0 0% 25%)' }}
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: 'hsl(0 0% 40%)' }} />
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
              style={{ backgroundColor: 'hsl(0 0% 100%)', color: 'hsl(0 0% 4%)', boxShadow: 'inset 0 0 0 1px hsl(0 0% 4%)' }}
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
        style={{ backgroundColor: 'hsl(0 0% 100%)', color: 'hsl(0 0% 4%)', boxShadow: 'inset 0 0 0 1px hsl(0 0% 4%)' }}
      >
        Ready for Review
      </div>
    );
  }

  if (status === 'approved') {
    return (
      <div 
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
        style={{ backgroundColor: 'hsl(0 0% 9%)', color: 'hsl(0 0% 100%)' }}
      >
        Approve & Build
      </div>
    );
  }

  if (status === 'sent_to_klaviyo') {
    return (
      <div 
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
        style={{ backgroundColor: 'hsl(0 0% 9%)', color: 'hsl(0 0% 100%)' }}
      >
        Built in Klaviyo
      </div>
    );
  }

  if (status === 'closed') {
    return (
      <div 
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
        style={{ backgroundColor: 'hsl(0 0% 9%)', color: 'hsl(0 0% 100%)' }}
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
        style={{ backgroundColor: 'hsl(0 72% 45% / 0.08)', color: 'hsl(0 72% 40%)' }}
      >
        <XCircle className="h-3 w-3 flex-shrink-0" />
        Failed
      </div>
    );
  }

  return null;
}
