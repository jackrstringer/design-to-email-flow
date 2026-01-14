import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Trash2, Send, RefreshCw, ExternalLink, Plus, X, Check, AlertTriangle, Link, CheckCircle, FileText, Image, Code2, Loader2 } from 'lucide-react';
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

  // CampaignStudio-style editing state
  const [editingLinkIndex, setEditingLinkIndex] = useState<number | null>(null);
  const [editingAltIndex, setEditingAltIndex] = useState<number | null>(null);
  const [linkSearchValue, setLinkSearchValue] = useState('');
  const [convertingIndex] = useState<number | null>(null); // For future HTML conversion feature

  // Container sizing - FIXED zoom level like CampaignStudio
  const footerIframeRef = useRef<HTMLIFrameElement>(null);
  const zoomLevel = 65; // Fixed, same as CampaignStudio default
  const scaledWidth = BASE_WIDTH * (zoomLevel / 100); // = 390px

  // Get brand info
  const brandName = (item as any).brands?.name || 'Brand';

  const spellingErrors = (item.spelling_errors as Array<{
    text: string;
    correction: string;
    location?: string;
    sliceIndex?: number;
  }>) || [];

  // Brand links for autocomplete (can be enhanced later to fetch from database)
  const brandLinks: string[] = [];
  const filteredLinks = brandLinks.filter(link => 
    link.toLowerCase().includes(linkSearchValue.toLowerCase())
  );

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

  // Set slice link (CampaignStudio style)
  const setSliceLink = (index: number, link: string) => {
    updateSlice(index, { link });
    setEditingLinkIndex(null);
    setLinkSearchValue('');
  };

  // Remove link from slice
  const removeLink = (index: number) => {
    updateSlice(index, { link: null });
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
      <div className="overflow-auto max-h-[70vh] bg-muted/10">
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

            {/* Render each slice group (row) - CampaignStudio style */}
            {sortedGroups.map((slicesInRow, groupIndex) => {
              const isMultiColumn = slicesInRow.length > 1;
              
              return (
                <div key={groupIndex} className="relative flex items-stretch">
                  {/* Slice separator line (CampaignStudio style) */}
                  {groupIndex > 0 && (
                    <div className="absolute top-0 left-0 right-0 flex items-center" style={{ transform: 'translateY(-50%)' }}>
                      <div className="h-px bg-destructive/60 flex-1" />
                      <span className="px-2 text-[9px] text-destructive/60 font-medium">SLICE {groupIndex + 1}</span>
                    </div>
                  )}
                  
                  {/* Left: Details Column (CampaignStudio style) */}
                  <div className="min-w-[320px] w-96 flex-shrink-0 p-4 space-y-3 pt-6">
                    {slicesInRow.map(({ slice, originalIndex }, colIndex) => (
                      <div key={originalIndex} className="space-y-2">
                        {isMultiColumn && (
                          <span className="text-[9px] text-muted-foreground font-medium uppercase tracking-wider">
                            Column {colIndex + 1}
                          </span>
                        )}
                        
                        {/* Type toggle + Link */}
                        <div className="flex items-center gap-2 flex-wrap">
                          {/* Pill toggle */}
                          <div className="flex items-center bg-muted/50 border border-border/40 rounded-full p-0.5">
                            <button
                              onClick={() => slice.type === 'html' && updateSlice(originalIndex, { type: 'image' })}
                              disabled={convertingIndex !== null}
                              className={cn(
                                "h-6 w-6 rounded-full flex items-center justify-center transition-colors",
                                slice.type !== 'html'
                                  ? "bg-primary/15 text-primary border border-primary/30" 
                                  : "text-muted-foreground/50 hover:text-muted-foreground",
                                convertingIndex !== null && "opacity-50 cursor-not-allowed"
                              )}
                              title="Image mode"
                            >
                              <Image className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => slice.type === 'image' && updateSlice(originalIndex, { type: 'html' })}
                              disabled={convertingIndex !== null}
                              className={cn(
                                "h-6 w-6 rounded-full flex items-center justify-center transition-colors",
                                slice.type === 'html' 
                                  ? "bg-primary/15 text-primary border border-primary/30" 
                                  : "text-muted-foreground/50 hover:text-muted-foreground",
                                convertingIndex !== null && "opacity-50 cursor-not-allowed"
                              )}
                              title="HTML mode"
                            >
                              {convertingIndex === originalIndex ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Code2 className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>

                          {/* Link (CampaignStudio style Popover + Command) */}
                          <Popover open={editingLinkIndex === originalIndex} onOpenChange={(open) => {
                            if (open) {
                              setEditingLinkIndex(originalIndex);
                              setLinkSearchValue('');
                            } else {
                              setEditingLinkIndex(null);
                            }
                          }}>
                            <PopoverTrigger asChild>
                              {slice.link !== null && slice.link !== '' && slice.link !== undefined ? (
                                <button className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-primary/10 border border-primary/20 rounded-md text-xs hover:bg-primary/20 transition-colors max-w-full">
                                  <Link className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                                  <span className="text-foreground break-all text-left font-medium text-[10px]">{slice.link}</span>
                                </button>
                              ) : (
                                <button className="flex items-center gap-1.5 px-2.5 py-1.5 border border-dashed border-muted-foreground/30 rounded-md text-muted-foreground/50 hover:border-primary/50 hover:text-primary/70 transition-colors text-xs">
                                  <Link className="w-3.5 h-3.5" />
                                  <span>Add link</span>
                                </button>
                              )}
                            </PopoverTrigger>
                            <PopoverContent className="w-72 p-0" align="start">
                              <Command>
                                <CommandInput 
                                  placeholder="Search or enter URL..." 
                                  value={linkSearchValue}
                                  onValueChange={setLinkSearchValue}
                                />
                                <CommandList>
                                  <CommandEmpty>
                                    {linkSearchValue && (
                                      <button
                                        className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                                        onClick={() => setSliceLink(originalIndex, linkSearchValue)}
                                      >
                                        Use "{linkSearchValue}"
                                      </button>
                                    )}
                                  </CommandEmpty>
                                  {filteredLinks.length > 0 && (
                                    <CommandGroup heading="Brand Links">
                                      {filteredLinks.slice(0, 10).map((link) => (
                                        <CommandItem
                                          key={link}
                                          value={link}
                                          onSelect={() => setSliceLink(originalIndex, link)}
                                          className="text-xs"
                                        >
                                          <span className="break-all">{link}</span>
                                        </CommandItem>
                                      ))}
                                    </CommandGroup>
                                  )}
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                          
                          {/* Remove link button */}
                          {slice.link && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                removeLink(originalIndex);
                              }}
                              className="text-muted-foreground/40 hover:text-foreground/60"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>

                        {/* Alt text (CampaignStudio style - click to edit) */}
                        {editingAltIndex === originalIndex ? (
                          <textarea
                            value={slice.altText || ''}
                            onChange={(e) => updateSlice(originalIndex, { altText: e.target.value })}
                            placeholder="Add description..."
                            className="w-full text-[11px] text-muted-foreground/70 leading-relaxed bg-muted/40 rounded-md px-2 py-1.5 border-0 resize-none focus:outline-none focus:ring-1 focus:ring-primary/30"
                            rows={2}
                            autoFocus
                            onBlur={() => setEditingAltIndex(null)}
                          />
                        ) : (
                          <p 
                            onClick={() => setEditingAltIndex(originalIndex)}
                            className="text-[11px] text-muted-foreground/70 leading-relaxed cursor-pointer hover:text-muted-foreground transition-colors"
                          >
                            {slice.altText || 'Add description...'}
                          </p>
                        )}
                        
                        {colIndex < slicesInRow.length - 1 && (
                          <Separator className="my-3" />
                        )}
                      </div>
                    ))}
                  </div>
                  
                  {/* Right: Image Column (CampaignStudio style - no cropping!) */}
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
              );
            })}

            {/* Footer Section (CampaignStudio style) */}
            {(footerHtml || footerError || slices.length > 0) && (
              <>
                <div className="border-t-2 border-dashed border-primary/40 mt-2">
                  <div className="flex items-stretch">
                    {/* Left: Footer Details */}
                    <div className="min-w-[320px] w-96 flex-shrink-0 p-4">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-medium text-primary/60 uppercase tracking-wider">Footer</span>
                      </div>
                      {footerError && (
                        <div className="mt-2 text-xs text-destructive flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          {footerError}
                        </div>
                      )}
                      {!footerHtml && !footerError && (
                        <p className="text-[11px] text-muted-foreground/60 mt-1">
                          No saved footer found for this brand
                        </p>
                      )}
                    </div>
                    
                    {/* Right: Footer Preview (CampaignStudio style - transform scaling) */}
                    <div 
                      className="flex-shrink-0 origin-top-left" 
                      style={{ width: scaledWidth, height: footerHtml ? footerPreviewHeight * (zoomLevel / 100) : 60 }}
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
                            transform: `scale(${zoomLevel / 100})`,
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
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
