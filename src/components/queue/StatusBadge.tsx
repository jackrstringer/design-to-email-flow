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
          <div className="flex items-center gap-1.5">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
            <span className="text-xs font-medium text-blue-600">
              {processingPercent}%
            </span>
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
            <div className={cn(
              "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap",
              "bg-yellow-100 text-yellow-700"
            )}>
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

    // No issues - Yellow badge (same as with issues)
    return (
      <div className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap",
        "bg-yellow-100 text-yellow-700"
      )}>
        Ready for Review
      </div>
    );
  }

  if (status === 'approved') {
    // Light green for approved/approve & build
    return (
      <div className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap",
        "bg-emerald-100 text-emerald-700"
      )}>
        Approve & Build
      </div>
    );
  }

  if (status === 'sent_to_klaviyo') {
    // Dark green for built in Klaviyo
    return (
      <div className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap",
        "bg-green-600 text-white"
      )}>
        Built in Klaviyo
      </div>
    );
  }

  if (status === 'closed') {
    return (
      <div className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap",
        "bg-gray-100 text-gray-600"
      )}>
        <Archive className="h-3 w-3 flex-shrink-0" />
        Closed
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap",
        "bg-red-100 text-red-700"
      )}>
        <XCircle className="h-3 w-3 flex-shrink-0" />
        Failed
      </div>
    );
  }

  return null;
}
