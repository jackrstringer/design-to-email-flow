import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Trash2, Send, RefreshCw, ExternalLink, Plus, X, Check, AlertTriangle } from 'lucide-react';
import { CampaignQueueItem } from '@/hooks/useCampaignQueue';
import { InboxPreview } from './InboxPreview';
import { EditableSliceRow } from './EditableSliceRow';
import { SpellingErrorsPanel } from './SpellingErrorsPanel';
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

interface SliceData {
  imageUrl?: string;
  altText?: string;
  link?: string | null;
  linkVerified?: boolean;
  linkWarning?: string;
  yStartPercent?: number;
  yEndPercent?: number;
}

export function ExpandedRowPanel({ item, onUpdate, onClose }: ExpandedRowPanelProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isReprocessing, setIsReprocessing] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState(item.selected_subject_line || '');
  const [selectedPreview, setSelectedPreview] = useState(item.selected_preview_text || '');
  
  // Local slices state for editing
  const [slices, setSlices] = useState<SliceData[]>([]);

  // Segment state
  const [klaviyoLists, setKlaviyoLists] = useState<KlaviyoList[]>([]);
  const [includedSegments, setIncludedSegments] = useState<string[]>([]);
  const [excludedSegments, setExcludedSegments] = useState<string[]>([]);
  const [isLoadingLists, setIsLoadingLists] = useState(false);
  const [listLoadError, setListLoadError] = useState<string | null>(null);

  // Footer HTML
  const [footerHtml, setFooterHtml] = useState<string | null>(null);

  // Get brand info
  const brandName = (item as any).brands?.name || 'Brand';

  const spellingErrors = (item.spelling_errors as Array<{
    text: string;
    correction: string;
    location?: string;
    sliceIndex?: number;
  }>) || [];

  // Initialize slices from item
  useEffect(() => {
    const itemSlices = (item.slices as SliceData[]) || [];
    setSlices(itemSlices);
  }, [item.slices]);

  // Sync subject/preview with item updates
  useEffect(() => {
    setSelectedSubject(item.selected_subject_line || '');
    setSelectedPreview(item.selected_preview_text || '');
  }, [item.selected_subject_line, item.selected_preview_text]);

  // Load Klaviyo lists and footer on mount
  useEffect(() => {
    const loadBrandData = async () => {
      if (!item.brand_id) return;
      
      setIsLoadingLists(true);
      setListLoadError(null);
      
      try {
        const { data: brand } = await supabase
          .from('brands')
          .select('klaviyo_api_key, footer_html')
          .eq('id', item.brand_id)
          .single();

        if (brand?.footer_html) {
          setFooterHtml(brand.footer_html);
        }

        if (brand?.klaviyo_api_key) {
          const { data, error } = await supabase.functions.invoke('get-klaviyo-lists', {
            body: { klaviyoApiKey: brand.klaviyo_api_key }
          });
          
          if (error) {
            setListLoadError('Failed to load segments');
          } else if (data?.lists) {
            setKlaviyoLists(data.lists);
          }
        }
      } catch (err) {
        console.error('Failed to load brand data:', err);
        setListLoadError('Failed to load brand data');
      } finally {
        setIsLoadingLists(false);
      }
    };

    loadBrandData();
  }, [item.brand_id]);

  // Update slice in local state and database
  const updateSlice = async (index: number, updates: Partial<SliceData>) => {
    const newSlices = [...slices];
    newSlices[index] = { ...newSlices[index], ...updates };
    setSlices(newSlices);

    // Persist to database
    await supabase
      .from('campaign_queue')
      .update({ slices: JSON.parse(JSON.stringify(newSlices)) })
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

  const handleReprocess = async () => {
    setIsReprocessing(true);
    
    const updates: Record<string, unknown> = {
      status: 'processing',
      processing_step: 'reprocessing',
      processing_percent: 0,
      error_message: null,
      retry_count: (item.retry_count || 0) + 1
    };

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
        slices: slices,
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

  // QA calculations with proper empty array handling
  const hasSlices = slices.length > 0;
  const slicesWithLinks = slices.filter(s => s.link);
  const slicesMissingLinks = slices.filter(s => !s.link);
  const allHaveLinks = hasSlices && slicesMissingLinks.length === 0;
  
  const placeholderPattern = /^(Slice|Section|Email section|Email Section)\s*\d+$/i;
  const slicesWithPlaceholderAlt = slices.filter(s => 
    !s.altText || placeholderPattern.test(s.altText.trim())
  );
  const allHaveAltText = hasSlices && slicesWithPlaceholderAlt.length === 0;

  return (
    <div className="bg-muted/20 border-t p-4 animate-in slide-in-from-top-2 duration-200">
      {/* TOP ROW - Full width controls */}
      <div className="flex gap-4 mb-4">
        {/* Inbox Preview */}
        <div className="flex-1 min-w-0">
          <InboxPreview
            senderName={brandName}
            subjectLine={selectedSubject}
            previewText={selectedPreview}
          />
        </div>

        {/* Segments */}
        <div className="w-64 flex-shrink-0 space-y-2">
          <div className="text-xs font-medium text-muted-foreground">Segments</div>
          
          {listLoadError ? (
            <div className="text-xs text-destructive">{listLoadError}</div>
          ) : (
            <>
              {/* Included */}
              <div className="flex flex-wrap gap-1">
                {includedSegments.map(id => {
                  const list = klaviyoLists.find(l => l.id === id);
                  return (
                    <Badge key={id} variant="secondary" className="gap-1 text-xs py-0">
                      {list?.name || id}
                      <button onClick={() => removeSegment(id, 'include')}>
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </Badge>
                  );
                })}
                <Select onValueChange={(v) => addSegment(v, 'include')}>
                  <SelectTrigger className="h-6 text-xs w-auto px-2 border-dashed">
                    <Plus className="h-3 w-3" />
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
              <div className="flex flex-wrap gap-1">
                {excludedSegments.map(id => {
                  const list = klaviyoLists.find(l => l.id === id);
                  return (
                    <Badge key={id} variant="outline" className="gap-1 text-xs py-0 text-destructive">
                      {list?.name || id}
                      <button onClick={() => removeSegment(id, 'exclude')}>
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </Badge>
                  );
                })}
                {availableLists.length > 0 && (
                  <Select onValueChange={(v) => addSegment(v, 'exclude')}>
                    <SelectTrigger className="h-6 text-xs w-auto px-2 border-dashed text-destructive">
                      <X className="h-3 w-3" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableLists.map(list => (
                        <SelectItem key={list.id} value={list.id}>{list.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </>
          )}
        </div>

        {/* QA Status */}
        <div className="w-48 flex-shrink-0 space-y-1">
          <div className="text-xs font-medium text-muted-foreground">QA Check</div>
          
          <SpellingErrorsPanel
            campaignId={item.id}
            spellingErrors={spellingErrors}
            slices={slices}
            source={item.source}
            sourceMetadata={item.source_metadata as Record<string, unknown> | undefined}
            onErrorFixed={onUpdate}
          />

          <div className="space-y-0.5 text-xs">
            {!hasSlices ? (
              <div className="flex items-center gap-1.5 text-amber-600">
                <AlertTriangle className="h-3 w-3" />
                <span>No slices generated</span>
              </div>
            ) : (
              <>
                {allHaveLinks ? (
                  <div className="flex items-center gap-1.5 text-green-600">
                    <Check className="h-3 w-3" />
                    <span>All slices have links</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-amber-600">
                    <AlertTriangle className="h-3 w-3" />
                    <span>{slicesMissingLinks.length} missing links</span>
                  </div>
                )}
                
                {allHaveAltText ? (
                  <div className="flex items-center gap-1.5 text-green-600">
                    <Check className="h-3 w-3" />
                    <span>Alt text complete</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-amber-600">
                    <AlertTriangle className="h-3 w-3" />
                    <span>{slicesWithPlaceholderAlt.length} need alt text</span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 flex-shrink-0">
          {item.status === 'sent_to_klaviyo' && item.klaviyo_campaign_url ? (
            <Button size="sm" variant="outline" asChild>
              <a href={item.klaviyo_campaign_url} target="_blank" rel="noopener noreferrer">
                View in Klaviyo <ExternalLink className="h-3.5 w-3.5 ml-1" />
              </a>
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                disabled={isSending || item.status === 'processing' || !selectedSubject || !selectedPreview}
                onClick={handleSendToKlaviyo}
              >
                <Send className="h-3.5 w-3.5 mr-1" />
                {isSending ? 'Sending...' : 'Send to Klaviyo'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleReprocess}
                disabled={isReprocessing || item.status === 'processing'}
              >
                <RefreshCw className={cn("h-3.5 w-3.5 mr-1", isReprocessing && "animate-spin")} />
                Reprocess
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            {isDeleting ? 'Deleting...' : 'Delete'}
          </Button>
        </div>
      </div>

      <Separator className="mb-4" />

      {/* BOTTOM SECTION - 30/70 split */}
      <div className="flex gap-4">
        {/* Left 30% - Slice images stacked */}
        <div className="w-[30%] flex-shrink-0 space-y-1">
          <div className="text-xs font-medium text-muted-foreground mb-2">
            Slices ({slices.length})
          </div>
          <div className="space-y-0.5 max-h-[400px] overflow-y-auto pr-1">
            {slices.map((slice, index) => (
              <div key={index} className="relative">
                {slice.imageUrl ? (
                  <img
                    src={slice.imageUrl}
                    alt={slice.altText || `Slice ${index + 1}`}
                    className="w-full rounded border border-border"
                  />
                ) : (
                  <div className="w-full h-16 bg-muted rounded border border-border flex items-center justify-center text-xs text-muted-foreground">
                    Slice {index + 1}
                  </div>
                )}
              </div>
            ))}

            {/* Footer HTML */}
            {footerHtml && (
              <div className="mt-2">
                <div className="text-xs font-medium text-muted-foreground mb-1">Footer</div>
                <div 
                  className="rounded border border-border overflow-hidden bg-white"
                  dangerouslySetInnerHTML={{ __html: footerHtml }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Right 70% - Editable slice details (matching SliceResults.tsx exactly) */}
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-muted-foreground mb-2">
            Slice Details
          </div>
          <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
            {slices.length === 0 ? (
              <div className="text-sm text-muted-foreground py-4 text-center">
                No slices available. Try reprocessing the campaign.
              </div>
            ) : (
              slices.map((slice, index) => (
                <EditableSliceRow
                  key={index}
                  slice={slice}
                  index={index}
                  onUpdate={(updates) => updateSlice(index, updates)}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
