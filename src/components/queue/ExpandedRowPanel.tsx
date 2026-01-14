import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Trash2, Send, RefreshCw, ExternalLink, Plus, X, Check, AlertTriangle, Link, Unlink, CheckCircle, FileText } from 'lucide-react';
import { CampaignQueueItem } from '@/hooks/useCampaignQueue';
import { InboxPreview } from './InboxPreview';
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
  type?: 'image' | 'html';
  htmlContent?: string;
  column?: number;
  totalColumns?: number;
  rowIndex?: number;
}

// Base width for email content (standard email width)
const BASE_WIDTH = 600;

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
  const [footerError, setFooterError] = useState<string | null>(null);
  const [footerPreviewHeight, setFooterPreviewHeight] = useState(200);

  // Container sizing for responsive scaling (like CampaignStudio)
  const containerRef = useRef<HTMLDivElement>(null);
  const footerIframeRef = useRef<HTMLIFrameElement>(null);
  const [containerWidth, setContainerWidth] = useState(900);

  // Get brand info
  const brandName = (item as any).brands?.name || 'Brand';

  const spellingErrors = (item.spelling_errors as Array<{
    text: string;
    correction: string;
    location?: string;
    sliceIndex?: number;
  }>) || [];

  // Measure container width for responsive scaling
  useEffect(() => {
    if (!containerRef.current) return;
    
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Calculate scale exactly like CampaignStudio
  const detailsColumnWidth = 320; // min-w-[320px] from CampaignStudio
  const gutter = 48; // padding/margins
  const availableForPreview = containerWidth - detailsColumnWidth - gutter;
  const scale = Math.max(0.4, Math.min(1, availableForPreview / BASE_WIDTH));
  const scaledWidth = BASE_WIDTH * scale;

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
      setFooterError(null);
      
      try {
        // Load Klaviyo API key from brands table
        const { data: brand } = await supabase
          .from('brands')
          .select('klaviyo_api_key, footer_html')
          .eq('id', item.brand_id)
          .single();

        // Load footer from brand_footers table (primary footer first)
        const { data: primaryFooter, error: primaryError } = await supabase
          .from('brand_footers')
          .select('html')
          .eq('brand_id', item.brand_id)
          .eq('is_primary', true)
          .limit(1)
          .maybeSingle();

        if (primaryError) {
          console.error('Error fetching primary footer:', primaryError);
          setFooterError(`Permission error: ${primaryError.message}`);
        } else if (primaryFooter?.html) {
          setFooterHtml(primaryFooter.html);
        } else {
          // No primary footer, try most recent
          const { data: recentFooter, error: recentError } = await supabase
            .from('brand_footers')
            .select('html')
            .eq('brand_id', item.brand_id)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (recentError) {
            console.error('Error fetching recent footer:', recentError);
            setFooterError(`Permission error: ${recentError.message}`);
          } else if (recentFooter?.html) {
            setFooterHtml(recentFooter.html);
          } else if (brand?.footer_html) {
            // Legacy fallback
            setFooterHtml(brand.footer_html);
          }
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

  // Handle footer iframe load to measure height
  const handleFooterIframeLoad = useCallback(() => {
    if (footerIframeRef.current) {
      try {
        const doc = footerIframeRef.current.contentDocument;
        if (doc?.body) {
          const height = doc.body.scrollHeight;
          setFooterPreviewHeight(height);
        }
      } catch (e) {
        // Cross-origin issues, use default height
      }
    }
  }, []);

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

  // Toggle link for a slice
  const toggleLink = (index: number) => {
    const slice = slices[index];
    if (slice.link !== null && slice.link !== undefined) {
      updateSlice(index, { link: null });
    } else {
      updateSlice(index, { link: '' });
    }
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

  // Group slices by rowIndex (same logic as CampaignStudio)
  const groupedSlices = slices.reduce((groups, slice, index) => {
    const rowIndex = slice.rowIndex ?? index;
    if (!groups[rowIndex]) {
      groups[rowIndex] = [];
    }
    groups[rowIndex].push({ slice, originalIndex: index });
    return groups;
  }, {} as Record<number, Array<{ slice: SliceData; originalIndex: number }>>);

  // Sort groups by rowIndex and sort slices within groups by column
  const sortedGroups = Object.entries(groupedSlices)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([, slicesInGroup]) => 
      slicesInGroup.sort((a, b) => (a.slice.column ?? 0) - (b.slice.column ?? 0))
    );

  // Footer iframe srcDoc (same as CampaignStudio)
  const footerSrcDoc = footerHtml ? `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { margin: 0; padding: 0; }
          table { border-collapse: collapse; }
        </style>
      </head>
      <body>
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;margin:0 auto;">
          <tr>
            <td>${footerHtml}</td>
          </tr>
        </table>
      </body>
    </html>
  ` : '';

  return (
    <div className="bg-muted/20 border-t animate-in slide-in-from-top-2 duration-200">
      {/* TOP ROW - Compact controls bar */}
      <div className="flex items-start gap-4 p-4 border-b">
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

      {/* MAIN CONTENT - CampaignStudio Layout: Details left + Slices right, scrolling together */}
      <div 
        ref={containerRef}
        className="overflow-auto max-h-[70vh] bg-muted/10"
      >
        <div className="p-6 flex justify-center">
          <div className="relative">
            {/* No slices message */}
            {slices.length === 0 && (
              <div className="flex items-center justify-center h-64 text-muted-foreground">
                <div className="text-center">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No slices available. Try reprocessing.</p>
                </div>
              </div>
            )}

            {/* Render each slice group (row) */}
            {sortedGroups.map((slicesInRow, groupIndex) => (
              <div key={groupIndex}>
                {/* Slice separator line (except for first slice) */}
                {groupIndex > 0 && (
                  <div 
                    className="border-t-2 border-dashed border-primary/40"
                    style={{ width: detailsColumnWidth + scaledWidth }}
                  />
                )}
                
                <div className="relative flex items-stretch">
                  {/* Left: Details Column (like CampaignStudio) */}
                  <div 
                    className="flex-shrink-0 p-4 space-y-2 bg-background/80 border-r border-border"
                    style={{ minWidth: detailsColumnWidth, width: detailsColumnWidth }}
                  >
                    {slicesInRow.map(({ slice, originalIndex }, colIndex) => (
                      <div key={originalIndex} className="space-y-3">
                        {slicesInRow.length > 1 && (
                          <div className="text-xs text-muted-foreground font-medium">
                            Column {colIndex + 1} of {slicesInRow.length}
                          </div>
                        )}
                        
                        <div className="text-sm font-medium text-foreground">
                          Slice {originalIndex + 1}
                        </div>
                        
                        {/* Alt Text */}
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Alt Text</Label>
                          <Textarea
                            value={slice.altText || ''}
                            onChange={(e) => updateSlice(originalIndex, { altText: e.target.value })}
                            className="text-sm min-h-[60px] resize-none"
                            placeholder="Describe this image..."
                          />
                        </div>
                        
                        {/* Link Toggle and Input */}
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Switch
                              id={`link-toggle-${originalIndex}`}
                              checked={slice.link !== null && slice.link !== undefined}
                              onCheckedChange={() => toggleLink(originalIndex)}
                            />
                            <Label 
                              htmlFor={`link-toggle-${originalIndex}`}
                              className="text-xs text-muted-foreground cursor-pointer flex items-center gap-1"
                            >
                              {slice.link !== null && slice.link !== undefined ? (
                                <>
                                  <Link className="h-3 w-3" />
                                  Linked
                                </>
                              ) : (
                                <>
                                  <Unlink className="h-3 w-3" />
                                  No Link
                                </>
                              )}
                            </Label>
                          </div>
                          
                          {slice.link !== null && slice.link !== undefined && (
                            <Input
                              value={slice.link || ''}
                              onChange={(e) => updateSlice(originalIndex, { link: e.target.value })}
                              placeholder="https://..."
                              className="text-sm"
                            />
                          )}
                        </div>
                        
                        {colIndex < slicesInRow.length - 1 && (
                          <Separator className="my-3" />
                        )}
                      </div>
                    ))}
                  </div>
                  
                  {/* Right: Image Column (like CampaignStudio - no cropping!) */}
                  <div 
                    className="flex flex-shrink-0"
                    style={{ width: scaledWidth }}
                  >
                    {slicesInRow.map(({ slice, originalIndex }) => {
                      const colWidth = slice.totalColumns 
                        ? scaledWidth / slice.totalColumns 
                        : scaledWidth / slicesInRow.length;
                      
                      return (
                        <div 
                          key={originalIndex}
                          style={{ width: colWidth }}
                        >
                          {slice.type === 'html' && slice.htmlContent ? (
                            <div 
                              className="bg-white"
                              dangerouslySetInnerHTML={{ __html: slice.htmlContent }}
                              style={{ width: '100%' }}
                            />
                          ) : slice.imageUrl ? (
                            <img
                              src={slice.imageUrl}
                              alt={slice.altText || `Slice ${originalIndex + 1}`}
                              style={{ width: '100%' }}
                              className="block"
                            />
                          ) : (
                            <div 
                              className="bg-muted flex items-center justify-center text-muted-foreground text-sm"
                              style={{ width: '100%', height: 100 }}
                            >
                              No image
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}

            {/* Footer Section (same structure as CampaignStudio) */}
            {(footerHtml || footerError || slices.length > 0) && (
              <>
                <div 
                  className="border-t-2 border-dashed border-primary/40"
                  style={{ width: detailsColumnWidth + scaledWidth }}
                />
                
                <div className="relative flex items-stretch">
                  {/* Left: Footer Details */}
                  <div 
                    className="flex-shrink-0 p-4 bg-background/80 border-r border-border"
                    style={{ minWidth: detailsColumnWidth, width: detailsColumnWidth }}
                  >
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Footer</span>
                    </div>
                    {footerError && (
                      <div className="mt-2 text-xs text-destructive flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        {footerError}
                      </div>
                    )}
                    {!footerHtml && !footerError && (
                      <div className="mt-2 text-xs text-muted-foreground">
                        No saved footer found for this brand
                      </div>
                    )}
                  </div>
                  
                  {/* Right: Footer Preview (scaled like CampaignStudio) */}
                  <div 
                    className="flex-shrink-0 overflow-hidden bg-white"
                    style={{ 
                      width: scaledWidth,
                      height: footerHtml ? footerPreviewHeight * scale : 60,
                    }}
                  >
                    {footerHtml ? (
                      <iframe
                        ref={footerIframeRef}
                        srcDoc={footerSrcDoc}
                        onLoad={handleFooterIframeLoad}
                        style={{
                          width: BASE_WIDTH,
                          height: footerPreviewHeight,
                          border: 'none',
                          transform: `scale(${scale})`,
                          transformOrigin: 'top left',
                        }}
                        title="Footer Preview"
                      />
                    ) : (
                      <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                        No footer
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
