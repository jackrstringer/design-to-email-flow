import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Trash2, Send, RefreshCw, ExternalLink, Plus, X, Check, AlertTriangle, Link, Unlink, CheckCircle, Image, Code } from 'lucide-react';
import { CampaignQueueItem } from '@/hooks/useCampaignQueue';
import { InboxPreview } from './InboxPreview';
import { SpellingErrorsPanel } from './SpellingErrorsPanel';
import { CampaignPreviewFrame } from '@/components/CampaignPreviewFrame';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { ProcessedSlice } from '@/types/slice';

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
  type?: 'image' | 'html';
  htmlContent?: string;
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
        // Load Klaviyo API key from brands table
        const { data: brand } = await supabase
          .from('brands')
          .select('klaviyo_api_key, footer_html')
          .eq('id', item.brand_id)
          .single();

        // Load footer from brand_footers table (primary footer first)
        const { data: footerData } = await supabase
          .from('brand_footers')
          .select('html')
          .eq('brand_id', item.brand_id)
          .order('is_primary', { ascending: false })
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (footerData?.html) {
          setFooterHtml(footerData.html);
        } else if (brand?.footer_html) {
          // Fallback to legacy footer_html on brands table
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

  // Toggle link for a slice
  const toggleSliceLink = (index: number) => {
    const slice = slices[index];
    if (slice.link !== null && slice.link !== undefined) {
      updateSlice(index, { link: null });
    } else {
      updateSlice(index, { link: '' });
    }
  };

  // Check if alt text is placeholder
  const hasPlaceholderAlt = (altText?: string) => {
    if (!altText) return true;
    return placeholderPattern.test(altText.trim());
  };

  // Editing state for alt text and link
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  // Toggle link for a slice
  const toggleLink = (index: number) => {
    const slice = slices[index];
    if (slice.link) {
      updateSlice(index, { link: null });
    } else {
      updateSlice(index, { link: '' });
      setEditingIndex(index);
    }
  };

  // Convert slices to ProcessedSlice for CampaignPreviewFrame
  const processedSlices: ProcessedSlice[] = slices.map((slice, index) => ({
    imageUrl: slice.imageUrl || '',
    altText: slice.altText || `Slice ${index + 1}`,
    link: slice.link || null,
    isClickable: !!slice.link,
    type: slice.type || 'image',
    htmlContent: slice.htmlContent,
  }));

  return (
    <div className="bg-muted/20 border-t p-4 animate-in slide-in-from-top-2 duration-200">
      {/* TOP ROW - Compact controls bar */}
      <div className="flex items-start gap-4 mb-4">
        {/* Inbox Preview - compact */}
        <div className="flex-1 min-w-0">
          <InboxPreview
            senderName={brandName}
            subjectLine={selectedSubject}
            previewText={selectedPreview}
          />
        </div>

        {/* Segments - inline */}
        <div className="flex-shrink-0 space-y-1">
          <div className="text-[10px] font-medium text-muted-foreground">Segments</div>
          {listLoadError ? (
            <div className="text-[10px] text-destructive">{listLoadError}</div>
          ) : (
            <div className="flex flex-wrap gap-1 max-w-[200px]">
              {includedSegments.map(id => {
                const list = klaviyoLists.find(l => l.id === id);
                return (
                  <Badge key={id} variant="secondary" className="gap-0.5 text-[10px] py-0 h-5">
                    {list?.name || id}
                    <button onClick={() => removeSegment(id, 'include')}>
                      <X className="h-2 w-2" />
                    </button>
                  </Badge>
                );
              })}
              {excludedSegments.map(id => {
                const list = klaviyoLists.find(l => l.id === id);
                return (
                  <Badge key={id} variant="outline" className="gap-0.5 text-[10px] py-0 h-5 text-destructive">
                    {list?.name || id}
                    <button onClick={() => removeSegment(id, 'exclude')}>
                      <X className="h-2 w-2" />
                    </button>
                  </Badge>
                );
              })}
              <Select onValueChange={(v) => addSegment(v, 'include')}>
                <SelectTrigger className="h-5 text-[10px] w-auto px-1.5 border-dashed">
                  <Plus className="h-2.5 w-2.5" />
                </SelectTrigger>
                <SelectContent>
                  {isLoadingLists ? (
                    <SelectItem value="loading" disabled>Loading...</SelectItem>
                  ) : availableLists.length === 0 ? (
                    <SelectItem value="none" disabled>No segments</SelectItem>
                  ) : (
                    availableLists.map(list => (
                      <SelectItem key={list.id} value={list.id}>{list.name}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* QA Status - compact */}
        <div className="flex-shrink-0 space-y-0.5">
          <div className="text-[10px] font-medium text-muted-foreground">QA</div>
          <SpellingErrorsPanel
            campaignId={item.id}
            spellingErrors={spellingErrors}
            slices={slices}
            source={item.source}
            sourceMetadata={item.source_metadata as Record<string, unknown> | undefined}
            onErrorFixed={onUpdate}
          />
          <div className="space-y-0 text-[10px]">
            {!hasSlices ? (
              <div className="flex items-center gap-1 text-amber-600">
                <AlertTriangle className="h-2.5 w-2.5" />
                <span>No slices</span>
              </div>
            ) : (
              <>
                {allHaveLinks ? (
                  <div className="flex items-center gap-1 text-green-600">
                    <Check className="h-2.5 w-2.5" />
                    <span>Links ✓</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-amber-600">
                    <AlertTriangle className="h-2.5 w-2.5" />
                    <span>{slicesMissingLinks.length} links</span>
                  </div>
                )}
                {allHaveAltText ? (
                  <div className="flex items-center gap-1 text-green-600">
                    <Check className="h-2.5 w-2.5" />
                    <span>Alt ✓</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-amber-600">
                    <AlertTriangle className="h-2.5 w-2.5" />
                    <span>{slicesWithPlaceholderAlt.length} alt</span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Actions - compact buttons */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {item.status === 'sent_to_klaviyo' && item.klaviyo_campaign_url ? (
            <Button size="sm" variant="outline" className="h-7 text-xs" asChild>
              <a href={item.klaviyo_campaign_url} target="_blank" rel="noopener noreferrer">
                Klaviyo <ExternalLink className="h-3 w-3 ml-1" />
              </a>
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                className="h-7 text-xs"
                disabled={isSending || item.status === 'processing' || !selectedSubject || !selectedPreview}
                onClick={handleSendToKlaviyo}
              >
                <Send className="h-3 w-3 mr-1" />
                {isSending ? 'Sending...' : 'Send'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={handleReprocess}
                disabled={isReprocessing || item.status === 'processing'}
              >
                <RefreshCw className={cn("h-3 w-3", isReprocessing && "animate-spin")} />
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <Separator className="mb-4" />

      {/* MAIN CONTENT - Two columns: Slice Editor + Campaign Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* LEFT: Slice Editor - using legacy SliceResults card layout */}
        <div className="border border-border rounded-lg bg-background">
          <div className="text-[10px] font-medium text-muted-foreground p-2 border-b bg-muted/30">
            Slice Details ({slices.length})
          </div>
          
          {slices.length === 0 ? (
            <div className="text-xs text-muted-foreground py-8 text-center">
              No slices. Try reprocessing.
            </div>
          ) : (
            <div className="space-y-3 max-h-[500px] overflow-y-auto p-3">
              {slices.map((slice, index) => (
                <div 
                  key={index}
                  className={cn(
                    'p-3 rounded-lg border bg-muted/30',
                    slice.type === 'html' ? 'border-blue-500/50' : 'border-border'
                  )}
                >
                  <div className="flex gap-3">
                    {/* Thumbnail */}
                    <div className="w-20 h-20 flex-shrink-0 rounded overflow-hidden border border-border bg-background">
                      {slice.imageUrl ? (
                        <img 
                          src={slice.imageUrl} 
                          alt={slice.altText || `Slice ${index + 1}`}
                          className="w-full h-full object-cover object-top"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground">
                          No image
                        </div>
                      )}
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-muted-foreground">
                          Slice {index + 1}
                        </span>
                        
                        {/* Type toggle */}
                        <button
                          onClick={() => updateSlice(index, { type: slice.type === 'html' ? 'image' : 'html' })}
                          className={cn(
                            'flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors',
                            slice.type === 'html'
                              ? 'bg-blue-500/20 text-blue-600 hover:bg-blue-500/30'
                              : 'bg-muted text-muted-foreground hover:bg-muted/80'
                          )}
                        >
                          {slice.type === 'html' ? (
                            <><Code className="w-3 h-3" /> HTML</>
                          ) : (
                            <><Image className="w-3 h-3" /> Image</>
                          )}
                        </button>
                      </div>

                      {/* Alt text */}
                      <Input
                        value={slice.altText || ''}
                        onChange={(e) => updateSlice(index, { altText: e.target.value })}
                        placeholder="Alt text"
                        className={cn(
                          "h-8 text-sm",
                          hasPlaceholderAlt(slice.altText) && "border-amber-500/50"
                        )}
                      />

                      {/* Link */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleLink(index)}
                          className={cn(
                            'flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors flex-shrink-0',
                            slice.link !== null && slice.link !== undefined
                              ? 'bg-primary/10 text-primary hover:bg-primary/20'
                              : 'bg-muted text-muted-foreground hover:bg-muted/80'
                          )}
                        >
                          {slice.link !== null && slice.link !== undefined ? (
                            <><Link className="w-3 h-3" /> Linked</>
                          ) : (
                            <><Unlink className="w-3 h-3" /> No link</>
                          )}
                        </button>

                        {slice.link !== null && slice.link !== undefined && (
                          <Input
                            value={slice.link || ''}
                            onChange={(e) => updateSlice(index, { link: e.target.value })}
                            placeholder="https://..."
                            className="h-7 text-xs flex-1"
                            autoFocus={editingIndex === index}
                            onFocus={() => setEditingIndex(index)}
                            onBlur={() => setEditingIndex(null)}
                          />
                        )}

                        {slice.link && (
                          <>
                            {slice.linkVerified ? (
                              <div className="flex items-center gap-1 text-green-500" title="Verified">
                                <CheckCircle className="w-3.5 h-3.5" />
                              </div>
                            ) : (
                              <div className="flex items-center gap-1 text-amber-500" title={slice.linkWarning || "Unverified link"}>
                                <AlertTriangle className="w-3.5 h-3.5" />
                              </div>
                            )}
                            <a
                              href={slice.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1 text-muted-foreground hover:text-foreground"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          </>
                        )}
                      </div>
                      {/* Link warning message */}
                      {slice.link && slice.linkWarning && (
                        <div className="flex items-center gap-1 text-xs text-amber-500">
                          <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                          <span>{slice.linkWarning}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT: Campaign Preview */}
        <div className="border border-border rounded-lg bg-background">
          <div className="text-[10px] font-medium text-muted-foreground p-2 border-b bg-muted/30">
            Campaign Preview
          </div>
          <div className="max-h-[600px] overflow-auto p-3">
            <CampaignPreviewFrame
              slices={processedSlices}
              footerHtml={footerHtml || undefined}
              width={400}
            />
          </div>
        </div>
      </div>

      {/* Footer status indicator */}
      {!footerHtml && (
        <div className="text-[10px] text-amber-500/70 text-center py-2 mt-2">
          ⚠️ No footer configured for this brand - check Brand Settings → Footers
        </div>
      )}
    </div>
  );
}
