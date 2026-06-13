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

// Normalize segment IDs - handle both object format {id, name} and plain string IDs
function normalizeSegmentIds(segments: unknown): string[] {
  if (!Array.isArray(segments)) return [];
  return segments.map(seg => {
    if (typeof seg === 'string') return seg;
    if (typeof seg === 'object' && seg !== null && 'id' in seg) {
      return (seg as { id: string }).id;
    }
    return String(seg);
  });
}

interface StatusSelectorProps {
  item: CampaignQueueItem;
  onUpdate: () => void;
  presets?: Array<{ id: string; name: string; included_segments: unknown; excluded_segments: unknown }>;
  liveSegmentIds?: Set<string>;
  liveSegmentsLoaded?: boolean;
  /** Flagged SL/PT words from live QA — blocks the build until cleared. */
  copyIssueWords?: string[];
}

export function StatusSelector({ item, onUpdate, presets, liveSegmentIds, liveSegmentsLoaded, copyIssueWords }: StatusSelectorProps) {
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

      // Block the build while the subject/preview has spelling or grammar issues.
      if (copyIssueWords && copyIssueWords.length > 0) {
        toast.error(
          `Fix the flagged copy first: ${copyIssueWords.slice(0, 4).map((w) => `“${w}”`).join(', ')}` +
            (copyIssueWords.length > 4 ? ` +${copyIssueWords.length - 4} more` : ''),
          { duration: 8000 },
        );
        setOpen(false);
        return;
      }

      setIsUpdating(true);
      setOpen(false);

      try {
        // Fetch brand data including Klaviyo key status
        const { data: brand, error: brandError } = await supabase
          .from('brands')
          .select('klaviyo_key_set, footer_html')
          .eq('id', item.brand_id)
          .single();

        if (brandError || !brand?.klaviyo_key_set) {
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
            includedSegments = normalizeSegmentIds(preset.included_segments);
            excludedSegments = normalizeSegmentIds(preset.excluded_segments);
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
            includedSegments = normalizeSegmentIds(defaultPreset.included_segments);
            excludedSegments = normalizeSegmentIds(defaultPreset.excluded_segments);
          }
        }

        // Validate we have segments
        if (includedSegments.length === 0) {
          toast.error('No audience segments configured. Please expand the row and configure segments first.');
          setIsUpdating(false);
          return;
        }

        // Pre-flight: verify every segment in the selected preset still exists in Klaviyo.
        // Klaviyo rejects campaign creation with "inclusion group ids were not found" if any
        // segment ID has been deleted on their side — fail fast with a clear message instead.
        if (liveSegmentsLoaded && liveSegmentIds && liveSegmentIds.size > 0) {
          const allIds = [...includedSegments, ...excludedSegments];
          const missing = allIds.filter((id) => !liveSegmentIds.has(id));
          if (missing.length > 0) {
            const presetName =
              presets?.find((p) => p.id === item.selected_segment_preset_id)?.name ||
              'the selected segment set';
            toast.error(
              `Can't send: ${missing.length} segment(s) in "${presetName}" no longer exist in Klaviyo. ` +
              `Open the segment set and remove or replace: ${missing.join(', ')}`,
              { duration: 10000 }
            );
            setIsUpdating(false);
            return;
          }
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
            brandId: item.brand_id,
            queueId: item.id,
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
          // Check if campaign creation failed but template succeeded (partial failure)
          if (data.error && !data.campaignId) {
            console.error('Klaviyo partial failure:', data.error);
            toast.error(data.error);
            
            // Revert status since campaign wasn't fully created
            await supabase
              .from('campaign_queue')
              .update({ status: 'ready_for_review' })
              .eq('id', item.id);
          } else {
            // Full success - both template and campaign created
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

  // Base pill shell — geometry only, no color here.
  const pillBase =
    'inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-[11px] font-medium whitespace-nowrap';
  const dot = 'h-[5px] w-[5px] rounded-full flex-shrink-0';

  // Per-status color tokens: tinted background + matched text + dot color.
  // Backgrounds use ~10% alpha of the functional hue (see .bg-status-* in
  // index.css). Text uses the semantic color token directly.
  const statusStyles = {
    ready_for_review: {
      pill: 'bg-status-warning text-warning',
      dot:  'bg-warning',
    },
    approved: {
      pill: 'bg-status-info text-info',
      dot:  'bg-info',
    },
    sent_to_klaviyo: {
      pill: 'bg-status-success text-success',
      dot:  'bg-success',
    },
    processing: {
      // Calm and transient — faint primary tint, muted text.
      pill: 'bg-status-primary text-muted-foreground',
      dot:  '',
    },
    closed: {
      // Deliberately recessive — stays grey.
      pill: 'bg-muted text-muted-foreground',
      dot:  '',
    },
    failed: {
      pill: 'bg-status-error text-destructive',
      dot:  'bg-destructive',
    },
  } as const;

  // Processing state - not clickable
  if (item.status === 'processing' || isUpdating) {
    const s = statusStyles.processing;
    return (
      <div className={cn(pillBase, s.pill)}>
        <Loader2 className="h-3 w-3 animate-spin opacity-60" />
        {isUpdating ? 'Building…' : `${item.processing_percent || 0}%`}
      </div>
    );
  }

  // Sent state - "Built in Klaviyo" badge
  if (item.status === 'sent_to_klaviyo') {
    const s = statusStyles.sent_to_klaviyo;
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            onClick={(e) => e.stopPropagation()}
            className={cn(pillBase, s.pill, 'group/st transition-colors hover:brightness-95')}
          >
            <span className={cn(dot, s.dot)} />
            <span className="whitespace-nowrap">Built in Klaviyo</span>
            <ChevronDown className="h-3 w-3 flex-shrink-0 opacity-0 transition-opacity group-hover/st:opacity-60" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-36 rounded-xl p-1 z-50 bg-card shadow-floating border-0"
          align="start"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => handleStatusChange('closed')}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 text-[12px] text-left rounded-lg transition-colors hover:bg-muted"
          >
            <Archive className="h-3 w-3 text-muted-foreground" />
            Close
          </button>
        </PopoverContent>
      </Popover>
    );
  }

  // Closed state - static badge
  if (item.status === 'closed') {
    const s = statusStyles.closed;
    return (
      <div className={cn(pillBase, s.pill)}>
        <Archive className="h-3 w-3" />
        Closed
      </div>
    );
  }

  // Failed state - with retry
  if (item.status === 'failed') {
    const s = statusStyles.failed;
    return (
      <div className={cn(pillBase, s.pill)}>
        <span className={cn(dot, s.dot)} />
        Failed
        <button
          onClick={handleRetry}
          className="ml-0.5 rounded p-0.5 opacity-60 transition-opacity hover:opacity-100"
          title="Retry"
        >
          <RotateCw className="h-3 w-3" />
        </button>
      </div>
    );
  }

  // Ready or Approved - clickable dropdown
  const isReady = item.status === 'ready_for_review';
  const isApproved = item.status === 'approved';
  const activePillStyles = isReady ? statusStyles.ready_for_review : statusStyles.approved;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          className={cn(pillBase, activePillStyles.pill, 'group/st transition-colors hover:brightness-95')}
        >
          <span className={cn(dot, activePillStyles.dot)} />
          {isReady
            ? hasIssues
              ? `Needs review · ${qaFlags?.length}`
              : 'Needs review'
            : 'Approved'}
          <ChevronDown className="h-3 w-3 opacity-0 transition-opacity group-hover/st:opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-44 rounded-xl p-1 z-50 bg-card shadow-floating border-0"
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => handleStatusChange('ready_for_review')}
          className={cn(
            'w-full flex items-center gap-2 px-2.5 py-1.5 text-[12px] text-left rounded-lg transition-colors hover:bg-muted',
            isReady && 'bg-muted/70 font-medium',
          )}
        >
          <span className={cn(dot, statusStyles.ready_for_review.dot)} />
          Needs review
        </button>
        <button
          onClick={() => handleStatusChange('approved')}
          className={cn(
            'w-full flex items-center gap-2 px-2.5 py-1.5 text-[12px] text-left rounded-lg transition-colors hover:bg-muted',
            isApproved && 'bg-muted/70 font-medium',
          )}
        >
          <span className={cn(dot, statusStyles.approved.dot)} />
          Approve &amp; build
        </button>
        <div className="h-px bg-border/70 my-1" />
        <button
          onClick={() => handleStatusChange('closed')}
          className="w-full flex items-center gap-2 px-2.5 py-1.5 text-[12px] text-left rounded-lg transition-colors hover:bg-muted"
        >
          <Archive className="h-3 w-3 text-muted-foreground" />
          Close
        </button>
      </PopoverContent>
    </Popover>
  );
}
