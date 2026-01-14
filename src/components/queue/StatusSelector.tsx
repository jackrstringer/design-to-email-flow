import { useState } from 'react';
import { Loader2, RotateCw, Check, ChevronDown } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { CampaignQueueItem } from '@/hooks/useCampaignQueue';

interface StatusSelectorProps {
  item: CampaignQueueItem;
  onUpdate: () => void;
}

export function StatusSelector({ item, onUpdate }: StatusSelectorProps) {
  const [open, setOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const handleStatusChange = async (newStatus: 'ready_for_review' | 'approved') => {
    if (newStatus === 'approved') {
      // Validate subject line and preview text
      if (!item.selected_subject_line || !item.selected_preview_text) {
        toast.error('Please select subject line and preview text first');
        setOpen(false);
        return;
      }

      setIsUpdating(true);
      setOpen(false);

      try {
        // First update to approved
        await supabase
          .from('campaign_queue')
          .update({ status: 'approved' })
          .eq('id', item.id);

        // Then push to Klaviyo
        const { data, error } = await supabase.functions.invoke('push-to-klaviyo', {
          body: {
            brandId: item.brand_id,
            campaignName: item.name,
            subjectLine: item.selected_subject_line,
            previewText: item.selected_preview_text,
            slices: item.slices,
            imageUrl: item.image_url
          }
        });

        if (error) throw error;

        if (data) {
          await supabase
            .from('campaign_queue')
            .update({
              status: 'sent_to_klaviyo',
              klaviyo_template_id: data.templateId,
              klaviyo_campaign_id: data.campaignId,
              klaviyo_campaign_url: data.campaignUrl,
              sent_to_klaviyo_at: new Date().toISOString()
            })
            .eq('id', item.id);

          toast.success('Sent to Klaviyo');
        }
      } catch (err) {
        console.error('Failed to send to Klaviyo:', err);
        toast.error('Failed to send to Klaviyo');
        
        // Revert to ready_for_review on failure
        await supabase
          .from('campaign_queue')
          .update({ status: 'ready_for_review' })
          .eq('id', item.id);
      } finally {
        setIsUpdating(false);
        onUpdate();
      }
    } else {
      // Just update status to ready_for_review
      setIsUpdating(true);
      setOpen(false);

      const { error } = await supabase
        .from('campaign_queue')
        .update({ status: newStatus })
        .eq('id', item.id);

      setIsUpdating(false);

      if (error) {
        toast.error('Failed to update status');
      } else {
        onUpdate();
      }
    }
  };

  const handleRetry = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    const { error: updateError } = await supabase
      .from('campaign_queue')
      .update({
        status: 'processing',
        processing_step: 'retrying',
        processing_percent: 0,
        error_message: null,
        retry_count: (item.retry_count || 0) + 1
      })
      .eq('id', item.id);

    if (updateError) {
      toast.error('Failed to start retry');
      return;
    }

    supabase.functions.invoke('process-campaign-queue', {
      body: { campaignQueueId: item.id }
    });

    toast.success('Retrying...');
    onUpdate();
  };

  // Processing state - not clickable
  if (item.status === 'processing' || isUpdating) {
    return (
      <div className="flex items-center gap-1.5">
        <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
        <span className="text-[11px] font-medium text-blue-600">
          {isUpdating ? 'Sending...' : `${item.processing_percent || 0}%`}
        </span>
      </div>
    );
  }

  // Sent state - end state, not clickable
  if (item.status === 'sent_to_klaviyo') {
    return (
      <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-600">
        <Check className="h-3 w-3" />
        Sent
      </div>
    );
  }

  // Failed state - with retry
  if (item.status === 'failed') {
    return (
      <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-red-100 text-red-700">
        Failed
        <button
          onClick={handleRetry}
          className="ml-0.5 hover:bg-red-200 rounded p-0.5 transition-colors"
        >
          <RotateCw className="h-3 w-3" />
        </button>
      </div>
    );
  }

  // Ready or Approved - clickable dropdown
  const isReady = item.status === 'ready_for_review';
  const isApproved = item.status === 'approved';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors",
            isReady && "bg-green-100 text-green-700 hover:bg-green-200",
            isApproved && "bg-blue-100 text-blue-700 hover:bg-blue-200"
          )}
        >
          {isReady ? 'Ready' : 'Approved'}
          <ChevronDown className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-40 p-1 z-50 bg-white" 
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => handleStatusChange('ready_for_review')}
          className={cn(
            "w-full flex items-center gap-2 px-2 py-1.5 text-[12px] text-left rounded transition-colors hover:bg-gray-100",
            isReady && "bg-gray-50"
          )}
        >
          <div className="w-3">
            {isReady && <Check className="h-3 w-3 text-green-600" />}
          </div>
          <span className="text-green-700">Ready</span>
        </button>
        <button
          onClick={() => handleStatusChange('approved')}
          className={cn(
            "w-full flex items-center gap-2 px-2 py-1.5 text-[12px] text-left rounded transition-colors hover:bg-gray-100",
            isApproved && "bg-gray-50"
          )}
        >
          <div className="w-3">
            {isApproved && <Check className="h-3 w-3 text-blue-600" />}
          </div>
          <span className="text-blue-700">Approve & Send</span>
        </button>
      </PopoverContent>
    </Popover>
  );
}
