import { cn } from '@/lib/utils';
import { Loader2, Check, AlertTriangle, Send, XCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface StatusBadgeProps {
  status: 'processing' | 'ready_for_review' | 'approved' | 'sent_to_klaviyo' | 'failed';
  processingStep?: string | null;
  processingPercent?: number;
  qaFlags?: unknown[] | null;
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
              "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
              "bg-yellow-100 text-yellow-700"
            )}>
              <AlertTriangle className="h-3 w-3" />
              {issueCount} {issueCount === 1 ? 'issue' : 'issues'}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">Review required - {issueCount} QA flag(s)</p>
          </TooltipContent>
        </Tooltip>
      );
    }

    return (
      <div className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
        "bg-green-100 text-green-700"
      )}>
        <Check className="h-3 w-3" />
        Ready
      </div>
    );
  }

  if (status === 'approved') {
    return (
      <div className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
        "bg-blue-100 text-blue-700"
      )}>
        <Check className="h-3 w-3" />
        Approved
      </div>
    );
  }

  if (status === 'sent_to_klaviyo') {
    return (
      <div className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
        "bg-gray-100 text-gray-600"
      )}>
        <Send className="h-3 w-3" />
        Sent
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
        "bg-red-100 text-red-700"
      )}>
        <XCircle className="h-3 w-3" />
        Failed
      </div>
    );
  }

  return null;
}
