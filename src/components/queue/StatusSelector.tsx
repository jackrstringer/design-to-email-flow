import { useState } from 'react';
import { Loader2, RotateCw, ChevronDown, Archive } from 'lucide-react';
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

  const handleStatusChange = async (newStatus: 'ready_for_review' | 'approved' | 'closed') => {
    if (newStatus === 'closed') {
      // Just update status to closed
      setIsUpdating(true);
      setOpen(false);

      const { error, count } = await supabase
        .from('campaign_queue')
        .update({ status: 'closed' })
        .eq('id', item.id)
        .select();

      setIsUpdating(false);

      if (error) {
        console.error('Failed to close campaign:', error);
        toast.error('Failed to close campaign');
      } else {
        toast.success('Campaign closed');
        onUpdate();
      }
      return;
    }

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
        // Fetch brand data including klaviyo_api_key
        const { data: brand, error: brandError } = await supabase
          .from('brands')
          .select('klaviyo_api_key, footer_html')
          .eq('id', item.brand_id)
          .single();

        if (brandError || !brand?.klaviyo_api_key) {
          toast.error('Brand Klaviyo API key not configured');
          setIsUpdating(false);
          return;
        }

        // Load footer from brand_footers table (same logic as ExpandedRowPanel)
        let footerHtml: string | null = null;
        const { data: primaryFooter } = await supabase
          .from('brand_footers')
          .select('html')
          .eq('brand_id', item.brand_id)
          .eq('is_primary', true)
          .limit(1)
          .maybeSingle();

        if (primaryFooter?.html) {
          footerHtml = primaryFooter.html;
        } else {
          // Fallback to most recent footer
          const { data: recentFooter } = await supabase
            .from('brand_footers')
            .select('html')
            .eq('brand_id', item.brand_id)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          
          // Final fallback to legacy brands.footer_html
          footerHtml = recentFooter?.html || brand.footer_html || null;
        }

        // Fetch segment preset for this campaign
        let includedSegments: string[] = [];
        let excludedSegments: string[] = [];

        if (item.selected_segment_preset_id) {
          // Use the selected preset
          const { data: preset } = await supabase
            .from('segment_presets')
            .select('included_segments, excluded_segments')
            .eq('id', item.selected_segment_preset_id)
            .single();

          if (preset) {
            includedSegments = (preset.included_segments as string[]) || [];
            excludedSegments = (preset.excluded_segments as string[]) || [];
          }
        } else if (item.brand_id) {
          // Fall back to default preset for the brand
          const { data: defaultPreset } = await supabase
            .from('segment_presets')
            .select('included_segments, excluded_segments')
            .eq('brand_id', item.brand_id)
            .eq('is_default', true)
            .single();

          if (defaultPreset) {
            includedSegments = (defaultPreset.included_segments as string[]) || [];
            excludedSegments = (defaultPreset.excluded_segments as string[]) || [];
          }
        }

        // Validate we have segments
        if (includedSegments.length === 0) {
          toast.error('No audience segments configured. Please expand the row and configure segments first.');
          setIsUpdating(false);
          return;
        }

        // First update to approved
        await supabase
          .from('campaign_queue')
          .update({ status: 'approved' })
          .eq('id', item.id);

        // Then push to Klaviyo with segments
        const { data, error } = await supabase.functions.invoke('push-to-klaviyo', {
          body: {
            templateName: item.name,
            klaviyoApiKey: brand.klaviyo_api_key,
            subjectLine: item.selected_subject_line,
            previewText: item.selected_preview_text,
            slices: item.slices,
            imageUrl: item.image_url,
            footerHtml: footerHtml,
            mode: 'campaign',
            includedSegments,
            excludedSegments,
            listId: includedSegments[0] // Fallback for legacy support
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

          toast.success('Built in Klaviyo');
        }
      } catch (err) {
        console.error('Failed to send to Klaviyo:', err);
        toast.error('Failed to build in Klaviyo');
        
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

  // Check if there are QA issues (typos)
  const qaFlags = item.qa_flags as Array<{ type: string }> | null;
  const hasIssues = qaFlags && qaFlags.length > 0;

  // Processing state - not clickable
  if (item.status === 'processing' || isUpdating) {
    return (
      <div 
        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium whitespace-nowrap"
        style={{ backgroundColor: '#E8F4FD', color: '#2563EB' }}
      >
        <Loader2 className="h-3 w-3 animate-spin" style={{ color: '#2563EB' }} />
        {isUpdating ? 'Building...' : `${item.processing_percent || 0}%`}
      </div>
    );
  }

  // Sent state - "Built in Klaviyo" badge
  if (item.status === 'sent_to_klaviyo') {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium hover:opacity-90 transition-colors whitespace-nowrap"
            style={{ backgroundColor: '#D1FAE5', color: '#059669' }}
          >
            <span className="whitespace-nowrap">Built in Klaviyo</span>
            <ChevronDown className="h-3 w-3 flex-shrink-0" />
          </button>
        </PopoverTrigger>
        <PopoverContent 
          className="w-32 p-1 z-50 bg-white" 
          align="start"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => handleStatusChange('closed')}
            className="w-full flex items-center gap-2 px-2 py-1.5 text-[12px] text-left rounded transition-colors hover:bg-gray-100"
          >
            <span 
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium whitespace-nowrap"
              style={{ backgroundColor: '#F3E8FF', color: '#9333EA' }}
            >
              <Archive className="h-3 w-3" />
              Close
            </span>
          </button>
        </PopoverContent>
      </Popover>
    );
  }

  // Closed state - static badge
  if (item.status === 'closed') {
    return (
      <div 
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium whitespace-nowrap"
        style={{ backgroundColor: '#F3E8FF', color: '#9333EA' }}
      >
        <Archive className="h-3 w-3" />
        Closed
      </div>
    );
  }

  // Failed state - with retry
  if (item.status === 'failed') {
    return (
      <div 
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium whitespace-nowrap"
        style={{ backgroundColor: '#FEE2E2', color: '#DC2626' }}
      >
        Failed
        <button
          onClick={handleRetry}
          className="ml-0.5 hover:opacity-80 rounded p-0.5 transition-colors"
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
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors whitespace-nowrap hover:opacity-90"
          style={isReady 
            ? { backgroundColor: '#FEF3C7', color: '#D97706' } 
            : { backgroundColor: '#D1FAE5', color: '#059669' }
          }
        >
          {isReady ? (hasIssues ? `${qaFlags?.length} issues` : 'Ready for Review') : 'Approve & Build'}
          <ChevronDown className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-44 p-1 z-50 bg-white" 
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
          <span 
            className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium whitespace-nowrap"
            style={{ backgroundColor: '#FEF3C7', color: '#D97706' }}
          >
            Ready for Review
          </span>
        </button>
        <button
          onClick={() => handleStatusChange('approved')}
          className={cn(
            "w-full flex items-center gap-2 px-2 py-1.5 text-[12px] text-left rounded transition-colors hover:bg-gray-100",
            isApproved && "bg-gray-50"
          )}
        >
          <span 
            className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium whitespace-nowrap"
            style={{ backgroundColor: '#D1FAE5', color: '#059669' }}
          >
            Approve & Build
          </span>
        </button>
        <div className="h-px bg-gray-100 my-1" />
        <button
          onClick={() => handleStatusChange('closed')}
          className="w-full flex items-center gap-2 px-2 py-1.5 text-[12px] text-left rounded transition-colors hover:bg-gray-100"
        >
          <span 
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium whitespace-nowrap"
            style={{ backgroundColor: '#F3E8FF', color: '#9333EA' }}
          >
            <Archive className="h-3 w-3" />
            Close
          </span>
        </button>
      </PopoverContent>
    </Popover>
  );
}
