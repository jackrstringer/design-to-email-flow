import { useState } from 'react';
import { X, ExternalLink, Trash2, RefreshCw, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { StatusBadge } from './StatusBadge';
import { SubjectLineSelector } from './SubjectLineSelector';
import { CampaignQueueItem } from '@/hooks/useCampaignQueue';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

interface QueueFlyoutProps {
  item: CampaignQueueItem | null;
  onClose: () => void;
  onUpdate: () => void;
}

const formatQaFlag = (key: string): string => {
  const messages: Record<string, string> = {
    spelling: 'Spelling errors detected',
    links: 'Link issues found',
    altText: 'Missing alt text',
  };
  return messages[key] || key.replace(/([A-Z])/g, ' $1').trim();
};

export function QueueFlyout({ item, onClose, onUpdate }: QueueFlyoutProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isReprocessing, setIsReprocessing] = useState(false);
  const [isSending, setIsSending] = useState(false);

  if (!item) return null;

  const slices = (item.slices as Array<{ link?: string; altText?: string }>) || [];
  
  // Convert qa_flags object to array for display
  const qaFlagsArray = item.qa_flags && typeof item.qa_flags === 'object' && !Array.isArray(item.qa_flags)
    ? Object.entries(item.qa_flags as Record<string, unknown>)
        .filter(([_, value]) => Boolean(value))
        .map(([key]) => ({ type: key }))
    : null;

  const handleSubjectLineSelect = async (value: string) => {
    const { error } = await supabase
      .from('campaign_queue')
      .update({ selected_subject_line: value })
      .eq('id', item.id);
    
    if (error) {
      toast.error('Failed to update subject line');
      return;
    }
    toast.success('Subject line updated');
    onUpdate();
  };

  const handlePreviewTextSelect = async (value: string) => {
    const { error } = await supabase
      .from('campaign_queue')
      .update({ selected_preview_text: value })
      .eq('id', item.id);
    
    if (error) {
      toast.error('Failed to update preview text');
      return;
    }
    toast.success('Preview text updated');
    onUpdate();
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this campaign?')) return;
    
    setIsDeleting(true);
    const { error } = await supabase
      .from('campaign_queue')
      .delete()
      .eq('id', item.id);
    setIsDeleting(false);

    if (error) {
      toast.error('Failed to delete campaign');
      return;
    }
    
    toast.success('Campaign deleted');
    onClose();
    onUpdate();
  };

  const handleReprocess = async () => {
    setIsReprocessing(true);
    
    const { error: updateError } = await supabase
      .from('campaign_queue')
      .update({ 
        status: 'processing', 
        processing_step: 'reprocessing',
        processing_percent: 0,
        error_message: null,
        retry_count: (item.retry_count || 0) + 1
      })
      .eq('id', item.id);
    
    if (updateError) {
      toast.error('Failed to start reprocessing');
      setIsReprocessing(false);
      return;
    }

    // Trigger reprocessing edge function
    const { error: invokeError } = await supabase.functions.invoke('process-campaign-queue', {
      body: { campaignQueueId: item.id }
    });
    
    setIsReprocessing(false);

    if (invokeError) {
      toast.error('Failed to trigger reprocessing');
      return;
    }
    
    toast.success('Reprocessing started');
    onUpdate();
  };

  const handleSendToKlaviyo = async () => {
    if (!item.selected_subject_line || !item.selected_preview_text) {
      toast.error('Please select a subject line and preview text first');
      return;
    }
    
    setIsSending(true);
    
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
    
    if (error) {
      toast.error('Failed to send to Klaviyo');
      setIsSending(false);
      return;
    }
    
    await supabase
      .from('campaign_queue')
      .update({
        status: 'sent_to_klaviyo',
        klaviyo_template_id: data?.templateId,
        klaviyo_campaign_id: data?.campaignId,
        klaviyo_campaign_url: data?.campaignUrl,
        sent_to_klaviyo_at: new Date().toISOString()
      })
      .eq('id', item.id);
    
    setIsSending(false);
    toast.success('Sent to Klaviyo!');
    onUpdate();
  };

  return (
    <Sheet open={!!item} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader className="pb-4">
          <div className="flex items-start justify-between">
            <div>
              <SheetTitle className="text-lg">
                {item.name || 'Untitled Campaign'}
              </SheetTitle>
              <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                {item.source === 'figma' && item.source_url && (
                  <a 
                    href={item.source_url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 hover:text-foreground"
                  >
                    Source: Figma <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                {item.source === 'upload' && 'Uploaded'}
                <span>•</span>
                <span>Created {formatDistanceToNow(new Date(item.created_at))} ago</span>
              </div>
            </div>
            <StatusBadge 
              status={item.status}
              processingStep={item.processing_step}
              processingPercent={item.processing_percent}
              qaFlags={qaFlagsArray}
            />
          </div>
        </SheetHeader>

        <div className="grid grid-cols-2 gap-6">
          {/* Left Column - Preview */}
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-medium mb-2">Campaign Preview</h3>
              {item.image_url ? (
                <div className="border rounded-lg overflow-hidden">
                  <img
                    src={item.image_url}
                    alt={item.name || 'Campaign preview'}
                    className="w-full"
                  />
                </div>
              ) : (
                <div className="border rounded-lg h-64 flex items-center justify-center bg-muted">
                  <span className="text-muted-foreground">No preview available</span>
                </div>
              )}
            </div>

            <div>
              <h3 className="text-sm font-medium mb-2">Slices</h3>
              <div className="space-y-1 text-sm">
                {slices.length > 0 ? (
                  slices.map((slice, index) => (
                    <div 
                      key={index}
                      className="flex items-center justify-between py-1.5 px-2 rounded bg-muted/50"
                    >
                      <span className="text-muted-foreground">
                        {index + 1}. {slice.altText || `Slice ${index + 1}`}
                      </span>
                      <span className="text-xs truncate max-w-[120px]">
                        {slice.link || '—'}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-muted-foreground">No slices defined</p>
                )}
              </div>
            </div>
          </div>

          {/* Right Column - Details */}
          <div className="space-y-6">
            <SubjectLineSelector
              label="Subject Line"
              selected={item.selected_subject_line}
              provided={item.provided_subject_line}
              generated={item.generated_subject_lines}
              onSelect={handleSubjectLineSelect}
            />

            <SubjectLineSelector
              label="Preview Text"
              selected={item.selected_preview_text}
              provided={item.provided_preview_text}
              generated={item.generated_preview_texts}
              onSelect={handlePreviewTextSelect}
            />

            <Separator />

            <div>
              <h3 className="text-sm font-medium mb-2">QA Check</h3>
              <div className="space-y-1 text-sm">
                {!item.spelling_errors?.length && (!qaFlagsArray || qaFlagsArray.length === 0) ? (
                  <>
                    <p className="text-green-600">✓ No spelling errors</p>
                    <p className="text-green-600">✓ All links verified</p>
                    <p className="text-green-600">✓ Alt text complete</p>
                  </>
                ) : (
                  <>
                    {qaFlagsArray?.map((flag, i) => (
                      <p key={i} className="text-yellow-600">⚠️ {formatQaFlag(flag.type)}</p>
                    ))}
                  </>
                )}
              </div>
            </div>

            <Separator />

            <div>
              <h3 className="text-sm font-medium mb-2">Links</h3>
              <div className="space-y-1">
                {slices.map((slice, index) => (
                  <div 
                    key={index}
                    className="flex items-center justify-between text-sm py-1"
                  >
                    <span className="text-muted-foreground">Slice {index + 1}:</span>
                    {slice.link ? (
                      <span className="truncate max-w-[180px]">{slice.link}</span>
                    ) : (
                      <span className="text-muted-foreground">— not clickable</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <Separator className="my-6" />

        {/* Footer Actions */}
        <div className="flex items-center justify-between">
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-destructive hover:text-destructive"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            {isDeleting ? 'Deleting...' : 'Delete Campaign'}
          </Button>

          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleReprocess}
              disabled={isReprocessing || item.status === 'processing'}
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${isReprocessing ? 'animate-spin' : ''}`} />
              {isReprocessing ? 'Reprocessing...' : 'Reprocess'}
            </Button>
            <Button 
              size="sm" 
              disabled={item.status === 'processing' || isSending}
              onClick={handleSendToKlaviyo}
            >
              <Send className="h-4 w-4 mr-1" />
              {isSending ? 'Sending...' : 'Send to Klaviyo'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
