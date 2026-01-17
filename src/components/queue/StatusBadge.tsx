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
            style={{ backgroundColor: '#E8F4FD', color: '#2563EB' }}
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: '#2563EB' }} />
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
              style={{ backgroundColor: '#FEF3C7', color: '#D97706' }}
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
        style={{ backgroundColor: '#FEF3C7', color: '#D97706' }}
      >
        Ready for Review
      </div>
    );
  }

  if (status === 'approved') {
    return (
      <div 
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
        style={{ backgroundColor: '#D1FAE5', color: '#059669' }}
      >
        Approve & Build
      </div>
    );
  }

  if (status === 'sent_to_klaviyo') {
    return (
      <div 
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
        style={{ backgroundColor: '#D1FAE5', color: '#059669' }}
      >
        Built in Klaviyo
      </div>
    );
  }

  if (status === 'closed') {
    return (
      <div 
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
        style={{ backgroundColor: '#F3E8FF', color: '#9333EA' }}
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
        style={{ backgroundColor: '#FEE2E2', color: '#DC2626' }}
      >
        <XCircle className="h-3 w-3 flex-shrink-0" />
        Failed
      </div>
    );
  }

  return null;
}
