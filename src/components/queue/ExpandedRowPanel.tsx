import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Trash2, Send, RefreshCw, ExternalLink, Plus, X, Check, AlertTriangle } from 'lucide-react';
import { CampaignQueueItem } from '@/hooks/useCampaignQueue';
import { QueueSlicePreview } from './QueueSlicePreview';
import { SpellingErrorsPanel } from './SpellingErrorsPanel';
import { InboxPreview } from '@/components/InboxPreview';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface ExpandedRowPanelProps {
  item: CampaignQueueItem;
  onUpdate: () => void;
  onClose: () => void;
}

interface KlaviyoList {
  id: string;
  name: string;
}

export function ExpandedRowPanel({ item, onUpdate, onClose }: ExpandedRowPanelProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isReprocessing, setIsReprocessing] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState(item.selected_subject_line || '');
  const [selectedPreview, setSelectedPreview] = useState(item.selected_preview_text || '');
  
  // Segment state
  const [klaviyoLists, setKlaviyoLists] = useState<KlaviyoList[]>([]);
  const [includedSegments, setIncludedSegments] = useState<string[]>([]);
  const [excludedSegments, setExcludedSegments] = useState<string[]>([]);
  const [isLoadingLists, setIsLoadingLists] = useState(false);

  // Get brand info
  const brandName = (item as any).brands?.name || 'Brand';

  const slices = (item.slices as Array<{
    link?: string;
    altText?: string;
    imageUrl?: string;
    yStartPercent?: number;
    yEndPercent?: number;
  }>) || [];

  const spellingErrors = (item.spelling_errors as Array<{
    text: string;
    correction: string;
    location?: string;
    sliceIndex?: number;
  }>) || [];

  // QA Flags (unused but kept for future use)
  const _qaFlags = item.qa_flags;

  // Load Klaviyo lists on mount
  useEffect(() => {
    const loadKlaviyoLists = async () => {
      if (!item.brand_id) return;
      
      setIsLoadingLists(true);
      try {
        const { data: brand } = await supabase
          .from('brands')
          .select('klaviyo_api_key')
          .eq('id', item.brand_id)
          .single();

        if (brand?.klaviyo_api_key) {
          const { data, error } = await supabase.functions.invoke('get-klaviyo-lists', {
            body: { apiKey: brand.klaviyo_api_key }
          });
          
          if (!error && data?.lists) {
            setKlaviyoLists(data.lists);
          }
        }
      } catch (err) {
        console.error('Failed to load Klaviyo lists:', err);
      } finally {
        setIsLoadingLists(false);
      }
    };

    loadKlaviyoLists();
  }, [item.brand_id]);

  const handleSubjectChange = async (value: string) => {
    setSelectedSubject(value);
    await supabase
      .from('campaign_queue')
      .update({ selected_subject_line: value })
      .eq('id', item.id);
  };

  const handlePreviewChange = async (value: string) => {
    setSelectedPreview(value);
    await supabase
      .from('campaign_queue')
      .update({ selected_preview_text: value })
      .eq('id', item.id);
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

  const handleReprocess = async (newSlices?: any[], footerPercent?: number) => {
    setIsReprocessing(true);
    
    const updates: Record<string, unknown> = {
      status: 'processing',
      processing_step: 'reprocessing',
      processing_percent: 0,
      error_message: null,
      retry_count: (item.retry_count || 0) + 1
    };

    if (newSlices) {
      updates.slices = newSlices;
    }
    if (footerPercent !== undefined) {
      updates.footer_start_percent = footerPercent;
    }

    const { error: updateError } = await supabase
      .from('campaign_queue')
      .update(updates)
      .eq('id', item.id);
    
    if (updateError) {
      toast.error('Failed to start reprocessing');
      setIsReprocessing(false);
      return;
    }

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
    if (!selectedSubject || !selectedPreview) {
      toast.error('Please select a subject line and preview text first');
      return;
    }
    
    setIsSending(true);
    
    const { data, error } = await supabase.functions.invoke('push-to-klaviyo', {
      body: {
        brandId: item.brand_id,
        campaignName: item.name,
        subjectLine: selectedSubject,
        previewText: selectedPreview,
        slices: item.slices,
        imageUrl: item.image_url,
        includedSegments,
        excludedSegments,
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

  const addSegment = (listId: string, type: 'include' | 'exclude') => {
    if (type === 'include') {
      setIncludedSegments([...includedSegments, listId]);
    } else {
      setExcludedSegments([...excludedSegments, listId]);
    }
  };

  const removeSegment = (listId: string, type: 'include' | 'exclude') => {
    if (type === 'include') {
      setIncludedSegments(includedSegments.filter(id => id !== listId));
    } else {
      setExcludedSegments(excludedSegments.filter(id => id !== listId));
    }
  };

  const availableLists = klaviyoLists.filter(
    l => !includedSegments.includes(l.id) && !excludedSegments.includes(l.id)
  );

  return (
    <div className="bg-muted/30 border-t p-6">
      <div className="grid grid-cols-[1fr,1px,1fr] gap-6">
        {/* Left Side - Campaign Preview */}
        <div className="space-y-4">
          {item.image_url ? (
            <QueueSlicePreview
              imageUrl={item.image_url}
              slices={slices}
              footerStartPercent={item.footer_start_percent}
              onReprocess={handleReprocess}
              isReprocessing={isReprocessing}
            />
          ) : (
            <div className="border rounded-lg h-64 flex items-center justify-center bg-muted">
              <span className="text-muted-foreground">No preview available</span>
            </div>
          )}

          {/* Slices List */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Slices ({slices.length})</h4>
            <div className="space-y-1 text-sm max-h-40 overflow-y-auto">
              {slices.map((slice, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between py-1.5 px-2 rounded bg-background"
                >
                  <span className="text-muted-foreground truncate flex-1">
                    {index + 1}. {slice.altText || `Slice ${index + 1}`}
                  </span>
                  <span className="text-xs truncate max-w-[140px] text-muted-foreground">
                    {slice.link || '— no link'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <Separator orientation="vertical" />

        {/* Right Side - Send Controls */}
        <div className="space-y-5">
          {/* Inbox Preview */}
          <div>
            <h4 className="text-sm font-medium mb-3">Inbox Preview</h4>
            <InboxPreview
              brandName={brandName}
              subjectLine={selectedSubject}
              previewText={selectedPreview}
              onSubjectLineChange={handleSubjectChange}
              onPreviewTextChange={handlePreviewChange}
            />
          </div>

          <Separator />

          {/* Segment Selection */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium">Segments</h4>
            
            {/* Included */}
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Include</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {includedSegments.map(id => {
                  const list = klaviyoLists.find(l => l.id === id);
                  return (
                    <Badge key={id} variant="secondary" className="gap-1">
                      {list?.name || id}
                      <button onClick={() => removeSegment(id, 'include')}>
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  );
                })}
                {includedSegments.length === 0 && (
                  <span className="text-xs text-muted-foreground italic">No segments selected</span>
                )}
              </div>
              <Select onValueChange={(v) => addSegment(v, 'include')}>
                <SelectTrigger className="h-8 text-xs">
                  <Plus className="h-3 w-3 mr-1" />
                  <span>Add segment</span>
                </SelectTrigger>
                <SelectContent>
                  {isLoadingLists ? (
                    <SelectItem value="loading" disabled>Loading...</SelectItem>
                  ) : availableLists.length === 0 ? (
                    <SelectItem value="none" disabled>No segments available</SelectItem>
                  ) : (
                    availableLists.map(list => (
                      <SelectItem key={list.id} value={list.id}>{list.name}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Excluded */}
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Exclude</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {excludedSegments.map(id => {
                  const list = klaviyoLists.find(l => l.id === id);
                  return (
                    <Badge key={id} variant="outline" className="gap-1 text-destructive">
                      {list?.name || id}
                      <button onClick={() => removeSegment(id, 'exclude')}>
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  );
                })}
              </div>
              {excludedSegments.length === 0 && availableLists.length > 0 && (
                <Select onValueChange={(v) => addSegment(v, 'exclude')}>
                  <SelectTrigger className="h-8 text-xs">
                    <Plus className="h-3 w-3 mr-1" />
                    <span>Add exclusion</span>
                  </SelectTrigger>
                  <SelectContent>
                    {availableLists.map(list => (
                      <SelectItem key={list.id} value={list.id}>{list.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          <Separator />

          {/* QA Status */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium">QA Check</h4>
            
            <SpellingErrorsPanel
              campaignId={item.id}
              spellingErrors={spellingErrors}
              slices={slices}
              source={item.source}
              sourceMetadata={item.source_metadata as Record<string, unknown> | undefined}
              onErrorFixed={onUpdate}
            />

            {/* Other QA flags */}
            <div className="space-y-1 text-sm">
              {slices.every(s => s.link) ? (
                <div className="flex items-center gap-2 text-green-600">
                  <Check className="h-4 w-4" />
                  <span>All slices have links</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-yellow-600">
                  <AlertTriangle className="h-4 w-4" />
                  <span>{slices.filter(s => !s.link).length} slice(s) missing links</span>
                </div>
              )}
              
              {slices.every(s => s.altText && !s.altText.match(/^(Slice|Section) \d+$/)) ? (
                <div className="flex items-center gap-2 text-green-600">
                  <Check className="h-4 w-4" />
                  <span>Alt text complete</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-yellow-600">
                  <AlertTriangle className="h-4 w-4" />
                  <span>Some slices need alt text review</span>
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Actions */}
          <div className="flex items-center justify-between pt-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              {isDeleting ? 'Deleting...' : 'Delete'}
            </Button>

            <div className="flex gap-2">
              {item.status === 'sent_to_klaviyo' && item.klaviyo_campaign_url ? (
                <Button size="sm" variant="outline" asChild>
                  <a href={item.klaviyo_campaign_url} target="_blank" rel="noopener noreferrer">
                    View in Klaviyo <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                  </a>
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleReprocess()}
                    disabled={isReprocessing || item.status === 'processing'}
                  >
                    <RefreshCw className={cn("h-4 w-4 mr-1", isReprocessing && "animate-spin")} />
                    Reprocess
                  </Button>
                  <Button
                    size="sm"
                    disabled={isSending || item.status === 'processing' || !selectedSubject || !selectedPreview}
                    onClick={handleSendToKlaviyo}
                  >
                    <Send className="h-4 w-4 mr-1" />
                    {isSending ? 'Sending...' : 'Send to Klaviyo'}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
