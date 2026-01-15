import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Trash2, Send, RefreshCw, ExternalLink, Plus, X, Check, AlertTriangle, Link, FileText } from 'lucide-react';
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

interface SegmentPreset {
  id: string;
  name: string;
  included_segments: string[];
  excluded_segments: string[];
  is_default: boolean;
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

  // Segment presets
  const [presets, setPresets] = useState<SegmentPreset[]>([]);
  const [showCreateDefaultModal, setShowCreateDefaultModal] = useState(false);
  const [presetName, setPresetName] = useState('');

  // Footer HTML
  const [footerHtml, setFooterHtml] = useState<string | null>(null);
  const [footerError, setFooterError] = useState<string | null>(null);
  const [footerPreviewHeight, setFooterPreviewHeight] = useState(200);

  // CampaignStudio-style editing state
  const [editingLinkIndex, setEditingLinkIndex] = useState<number | null>(null);
  const [editingAltIndex, setEditingAltIndex] = useState<number | null>(null);
  const [linkSearchValue, setLinkSearchValue] = useState('');
  
  // Brand links for autocomplete
  const [brandLinks, setBrandLinks] = useState<string[]>([]);
  const [brandDomain, setBrandDomain] = useState<string | null>(null);

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

  // Filter brand links based on search
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

  // Load Klaviyo lists, footer, presets, and brand links on mount
  useEffect(() => {
    const loadBrandData = async () => {
      if (!item.brand_id) return;
      
      setIsLoadingLists(true);
      setListLoadError(null);
      setFooterError(null);
      
      try {
        // Load brand data including all_links and domain
        const { data: brand } = await supabase
          .from('brands')
          .select('klaviyo_api_key, footer_html, all_links, domain')
          .eq('id', item.brand_id)
          .single();

        // Set brand links for autocomplete
        if (brand?.all_links && Array.isArray(brand.all_links)) {
          setBrandLinks(brand.all_links as string[]);
        }
        
        // Set brand domain for external link checking
        if (brand?.domain) {
          setBrandDomain(brand.domain);
        }

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

        // Load Klaviyo lists
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

        // Load segment presets for this brand
        const { data: presetsData } = await supabase
          .from('segment_presets')
          .select('*')
          .eq('brand_id', item.brand_id)
          .order('created_at', { ascending: false });

        if (presetsData && presetsData.length > 0) {
          const mappedPresets = presetsData.map(p => ({
            id: p.id,
            name: p.name,
            included_segments: (p.included_segments as string[]) || [],
            excluded_segments: (p.excluded_segments as string[]) || [],
            is_default: p.is_default || false,
          }));
          
          // Sort: defaults first
          mappedPresets.sort((a, b) => (b.is_default ? 1 : 0) - (a.is_default ? 1 : 0));
          setPresets(mappedPresets);
          
          // Auto-apply default preset if segments are empty
          const defaultPreset = mappedPresets.find(p => p.is_default);
          if (defaultPreset && includedSegments.length === 0 && excludedSegments.length === 0) {
            setIncludedSegments(defaultPreset.included_segments);
            setExcludedSegments(defaultPreset.excluded_segments);
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

  // Apply a preset
  const applyPreset = (preset: SegmentPreset) => {
    setIncludedSegments(preset.included_segments);
    setExcludedSegments(preset.excluded_segments);
    toast.success(`Applied "${preset.name}"`);
  };

  // Save current segments as default preset
  const saveAsDefault = async () => {
    if (!presetName.trim() || !item.brand_id) return;
    
    try {
      // Clear any existing default for this brand
      await supabase
        .from('segment_presets')
        .update({ is_default: false })
        .eq('brand_id', item.brand_id);
      
      const { data, error } = await supabase
        .from('segment_presets')
        .insert({
          brand_id: item.brand_id,
          name: presetName.trim(),
          included_segments: includedSegments,
          excluded_segments: excludedSegments,
          is_default: true,
        })
        .select()
        .single();

      if (error) {
        toast.error('Failed to save preset');
        return;
      }

      setPresets(prev => [{
        id: data.id,
        name: data.name,
        included_segments: data.included_segments as string[],
        excluded_segments: data.excluded_segments as string[],
        is_default: true,
      }, ...prev.map(p => ({ ...p, is_default: false }))]);
      
      setShowCreateDefaultModal(false);
      setPresetName('');
      toast.success('Default segment set saved');
      
      // Now proceed with sending
      await doSendToKlaviyo();
    } catch (err) {
      toast.error('Failed to save preset');
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

  const doSendToKlaviyo = async () => {
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

  const handleSendToKlaviyo = async () => {
    if (!selectedSubject || !selectedPreview) {
      toast.error('Please select a subject line and preview text first');
      return;
    }
    
    if (includedSegments.length === 0) {
      // Check if brand has any presets
      if (presets.length === 0) {
        setShowCreateDefaultModal(true);
        return;
      }
      toast.error('Please select at least one segment');
      return;
    }
    
    await doSendToKlaviyo();
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

  // External links check
  const externalLinks = brandDomain 
    ? slicesWithLinks.filter(s => s.link && !s.link.includes(brandDomain))
    : [];
  const hasExternalLinks = externalLinks.length > 0;

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
      {/* Compact Control Bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b bg-white/50">
        {/* Audience Selector - compact inline */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">Audience:</span>
          {presets.length > 0 ? (
            <Select 
              onValueChange={(id) => {
                const preset = presets.find(p => p.id === id);
                if (preset) applyPreset(preset);
              }}
            >
              <SelectTrigger className="h-6 text-[11px] w-[160px] bg-white">
                <SelectValue placeholder="Select audience..." />
              </SelectTrigger>
              <SelectContent>
                {presets.map(p => (
                  <SelectItem key={p.id} value={p.id} className="text-xs">
                    {p.name} {p.is_default && '★'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Button 
              variant="outline" 
              size="sm" 
              className="h-6 text-[11px]"
              onClick={() => setShowCreateDefaultModal(true)}
            >
              Set up audience
            </Button>
          )}
          {/* Show selected segments as chips */}
          {includedSegments.length > 0 && (
            <div className="flex items-center gap-1">
              {includedSegments.slice(0, 2).map(id => {
                const list = klaviyoLists.find(l => l.id === id);
                return (
                  <Badge key={id} variant="secondary" className="text-[10px] py-0 h-5">
                    {list?.name?.slice(0, 15) || id}
                    <button onClick={() => removeSegment(id, 'include')} className="ml-0.5">
                      <X className="h-2 w-2" />
                    </button>
                  </Badge>
                );
              })}
              {includedSegments.length > 2 && (
                <span className="text-[10px] text-muted-foreground">+{includedSegments.length - 2}</span>
              )}
            </div>
          )}
        </div>

        <div className="h-4 w-px bg-border" />

        {/* QA Indicators - compact row */}
        <div className="flex items-center gap-3 text-[11px]">
          {hasExternalLinks ? (
            <span className="flex items-center gap-1 text-amber-600">
              <AlertTriangle className="h-3 w-3" />
              {externalLinks.length} external
            </span>
          ) : (
            <span className="flex items-center gap-1 text-green-600">
              <Check className="h-3 w-3" />
              Links OK
            </span>
          )}
          
          {spellingErrors.length > 0 ? (
            <span className="flex items-center gap-1 text-amber-600">
              <AlertTriangle className="h-3 w-3" />
              {spellingErrors.length} spelling
            </span>
          ) : (
            <span className="flex items-center gap-1 text-green-600">
              <Check className="h-3 w-3" />
              Spelling OK
            </span>
          )}
          
          {!allHaveAltText && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <AlertTriangle className="h-3 w-3" />
              {slicesWithPlaceholderAlt.length} alt
            </span>
          )}
        </div>

        <div className="flex-1" />

        {/* Actions - right side */}
        <div className="flex items-center gap-2">
          {item.status === 'sent_to_klaviyo' && item.klaviyo_campaign_url ? (
            <Button size="sm" variant="outline" className="h-6 text-[11px]" asChild>
              <a href={item.klaviyo_campaign_url} target="_blank" rel="noopener noreferrer">
                View in Klaviyo <ExternalLink className="h-3 w-3 ml-1" />
              </a>
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                className="h-6 text-[11px]"
                disabled={isSending || item.status === 'processing' || !selectedSubject || !selectedPreview || includedSegments.length === 0}
                onClick={handleSendToKlaviyo}
              >
                <Send className="h-3 w-3 mr-1" />
                {isSending ? 'Sending...' : 'Send'}
              </Button>
              <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={handleReprocess} disabled={isReprocessing}>
                <RefreshCw className={cn("h-3 w-3", isReprocessing && "animate-spin")} />
              </Button>
              <Button size="sm" variant="ghost" className="h-6 text-[11px] text-destructive" onClick={handleDelete} disabled={isDeleting}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Main Content Area - Inbox Preview centered above email */}
      <div className="flex justify-center py-4">
        <div className="space-y-3">
          {/* Inbox Preview - looks like an email in inbox */}
          <div className="bg-white rounded-lg border shadow-sm p-3" style={{ width: scaledWidth + 40 }}>
            <InboxPreview
              senderName={brandName}
              subjectLine={selectedSubject || 'Select a subject line...'}
              previewText={selectedPreview || 'Select preview text...'}
            />
          </div>

          {/* Email Preview - slices stacked */}
          <div className="bg-white rounded-lg border shadow-sm overflow-hidden" style={{ width: scaledWidth + 40 }}>
            <div className="px-5 py-3 overflow-auto max-h-[60vh]">
              {/* No slices message */}
              {slices.length === 0 && (
                <div className="flex items-center justify-center h-40 text-muted-foreground">
                  <div className="text-center">
                    <FileText className="h-10 w-10 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">No slices available. Try reprocessing.</p>
                  </div>
                </div>
              )}

              {/* Render each slice group (row) - Compact layout */}
              {sortedGroups.map((slicesInRow, groupIndex) => (
                <div key={groupIndex} className="relative flex items-stretch group/row hover:bg-muted/10 -mx-5 px-5">
                  {/* Slice separator line */}
                  {groupIndex > 0 && (
                    <div className="absolute top-0 left-0 right-0 flex items-center z-10" style={{ transform: 'translateY(-50%)' }}>
                      <div className="h-px bg-border flex-1" />
                    </div>
                  )}
                  
                  {/* Left: Link Column */}
                  <div className="w-48 flex-shrink-0 flex flex-col justify-center py-1 pr-2 gap-1">
                    {slicesInRow.map(({ slice, originalIndex }) => (
                      <Popover key={originalIndex} open={editingLinkIndex === originalIndex} onOpenChange={(open) => {
                        if (open) {
                          setEditingLinkIndex(originalIndex);
                          setLinkSearchValue('');
                        } else {
                          setEditingLinkIndex(null);
                        }
                      }}>
                        <PopoverTrigger asChild>
                          {slice.link ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button className="flex items-center gap-1 px-2 py-0.5 bg-primary/10 border border-primary/20 rounded text-[10px] hover:bg-primary/20 transition-colors text-left w-full truncate">
                                  <Link className="w-3 h-3 text-primary flex-shrink-0" />
                                  <span className="text-foreground/80 truncate">{slice.link}</span>
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="left" className="max-w-xs">
                                <p className="break-all text-xs">{slice.link}</p>
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <button className="flex items-center gap-1 px-2 py-0.5 border border-dashed border-muted-foreground/20 rounded text-muted-foreground/40 hover:border-primary/40 transition-colors text-[10px] w-full opacity-0 group-hover/row:opacity-100">
                              <Link className="w-3 h-3 flex-shrink-0" />
                              <span>Add link</span>
                            </button>
                          )}
                        </PopoverTrigger>
                        <PopoverContent className="w-72 p-0" align="end" side="left">
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
                              {slice.link && (
                                <CommandGroup>
                                  <CommandItem
                                    onSelect={() => {
                                      removeLink(originalIndex);
                                      setEditingLinkIndex(null);
                                    }}
                                    className="text-xs text-destructive"
                                  >
                                    <X className="w-3 h-3 mr-2" />
                                    Remove link
                                  </CommandItem>
                                </CommandGroup>
                              )}
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    ))}
                  </div>
                  
                  {/* Center: Image Column */}
                  <div className="flex flex-shrink-0" style={{ width: scaledWidth }}>
                    {slicesInRow.map(({ slice, originalIndex }) => {
                      const colWidth = slice.totalColumns 
                        ? scaledWidth / slice.totalColumns 
                        : scaledWidth / slicesInRow.length;
                      
                      return (
                        <div key={originalIndex} style={{ width: colWidth }}>
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
                              className="bg-muted flex items-center justify-center text-muted-foreground text-xs"
                              style={{ width: '100%', height: 60 }}
                            >
                              No image
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  
                  {/* Right: Alt Text Column */}
                  <div className="w-32 flex-shrink-0 flex flex-col justify-center py-1 pl-2 gap-1">
                    {slicesInRow.map(({ slice, originalIndex }) => (
                      <div key={originalIndex}>
                        {editingAltIndex === originalIndex ? (
                          <textarea
                            value={slice.altText || ''}
                            onChange={(e) => updateSlice(originalIndex, { altText: e.target.value })}
                            placeholder="Alt..."
                            className="w-full text-[10px] text-muted-foreground bg-muted/40 rounded px-1.5 py-1 border-0 resize-none focus:outline-none focus:ring-1 focus:ring-primary/30"
                            rows={2}
                            autoFocus
                            onBlur={() => setEditingAltIndex(null)}
                          />
                        ) : (
                          <p 
                            onClick={() => setEditingAltIndex(originalIndex)}
                            className="text-[10px] text-muted-foreground/40 leading-tight cursor-pointer hover:text-muted-foreground truncate opacity-0 group-hover/row:opacity-100 transition-opacity"
                          >
                            {slice.altText ? slice.altText.slice(0, 20) + '...' : 'Alt...'}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* Footer Section */}
              {footerHtml && (
                <div className="border-t border-dashed border-muted-foreground/20 mt-2 pt-2">
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
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Create Default Preset Modal */}
      <Dialog open={showCreateDefaultModal} onOpenChange={setShowCreateDefaultModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Default Segment Set</DialogTitle>
            <p className="text-sm text-muted-foreground">
              This brand doesn't have any saved segment presets. Create a default set to use for all campaigns.
            </p>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <Input
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="Preset name (e.g., 'All Subscribers')"
              autoFocus
            />
            <div className="text-xs text-muted-foreground space-y-1">
              <p>Include: {includedSegments.length} segment(s)</p>
              <p>Exclude: {excludedSegments.length} segment(s)</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDefaultModal(false)}>Cancel</Button>
            <Button onClick={saveAsDefault} disabled={!presetName.trim() || includedSegments.length === 0}>
              Save & Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
