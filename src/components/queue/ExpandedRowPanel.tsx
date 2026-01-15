import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
  preloadedPresets?: SegmentPreset[];
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

export function ExpandedRowPanel({ item, onUpdate, onClose, preloadedPresets }: ExpandedRowPanelProps) {
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
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [showCreateDefaultModal, setShowCreateDefaultModal] = useState(false);
  const [presetName, setPresetName] = useState('');
  
  // Searchable segment picker state
  const [includePickerOpen, setIncludePickerOpen] = useState(false);
  const [excludePickerOpen, setExcludePickerOpen] = useState(false);
  const [segmentSearchValue, setSegmentSearchValue] = useState('');

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

  // Container sizing - zoom level persisted per user
  const footerIframeRef = useRef<HTMLIFrameElement>(null);
  const [zoomLevel, setZoomLevel] = useState(39);
  const hasAppliedDefaultPreset = useRef(false);
  const scaledWidth = useMemo(() => BASE_WIDTH * (zoomLevel / 100), [zoomLevel]);

  // Get brand info
  const brandName = (item as any).brands?.name || 'Brand';
  const brandColor = (item as any).brands?.primary_color || '#6b7280';

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

  // Load zoom level from user profile on mount
  useEffect(() => {
    const loadZoomLevel = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const { data: profile } = await supabase
        .from('profiles')
        .select('queue_zoom_level')
        .eq('id', user.id)
        .single();
      
      if (profile?.queue_zoom_level) {
        setZoomLevel(profile.queue_zoom_level);
      }
    };
    loadZoomLevel();
  }, []);

  // Save zoom level when changed
  const handleZoomChange = async (newZoom: number) => {
    setZoomLevel(newZoom);
    
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from('profiles')
        .update({ queue_zoom_level: newZoom })
        .eq('id', user.id);
    }
  };

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

        // Use preloaded presets if available, otherwise fetch
        if (preloadedPresets && preloadedPresets.length > 0) {
          setPresets(preloadedPresets);
          
          // Auto-apply default preset (only once)
          const defaultPreset = preloadedPresets.find(p => p.is_default);
          if (defaultPreset && !hasAppliedDefaultPreset.current) {
            hasAppliedDefaultPreset.current = true;
            setIncludedSegments(defaultPreset.included_segments);
            setExcludedSegments(defaultPreset.excluded_segments);
            setSelectedPresetId(defaultPreset.id);
          }
        } else {
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
            
            // Auto-apply default preset (only once)
            const defaultPreset = mappedPresets.find(p => p.is_default);
            if (defaultPreset && !hasAppliedDefaultPreset.current) {
              hasAppliedDefaultPreset.current = true;
              setIncludedSegments(defaultPreset.included_segments);
              setExcludedSegments(defaultPreset.excluded_segments);
              setSelectedPresetId(defaultPreset.id);
            }
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
  }, [item.brand_id, preloadedPresets]);

  // Force default segment modal if no default preset exists
  useEffect(() => {
    // Only check after lists and presets have loaded
    if (isLoadingLists) return;
    
    const hasDefaultPreset = presets.some(p => p.is_default);
    
    // If we have loaded data but no default preset exists, show the modal
    if (!hasDefaultPreset && klaviyoLists.length > 0) {
      setShowCreateDefaultModal(true);
    }
  }, [presets, isLoadingLists, klaviyoLists]);

  // Set an existing preset as the default
  const setExistingAsDefault = async (presetId: string) => {
    try {
      // Clear any existing default for this brand
      await supabase
        .from('segment_presets')
        .update({ is_default: false })
        .eq('brand_id', item.brand_id);
      
      // Set the selected preset as default
      await supabase
        .from('segment_presets')
        .update({ is_default: true })
        .eq('id', presetId);
      
      // Find and apply the preset
      const preset = presets.find(p => p.id === presetId);
      if (preset) {
        setIncludedSegments(preset.included_segments);
        setExcludedSegments(preset.excluded_segments);
        setSelectedPresetId(preset.id);
        hasAppliedDefaultPreset.current = true;
        
        // Update local state
        setPresets(prev => prev.map(p => ({
          ...p,
          is_default: p.id === presetId
        })));
      }
      
      setShowCreateDefaultModal(false);
      toast.success('Default segment set updated');
    } catch (err) {
      toast.error('Failed to set default preset');
    }
  };

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
    setSelectedPresetId(preset.id);
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
  const externalLinkCount = externalLinks.length;

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

  // Footer iframe srcDoc - render at BASE_WIDTH, then scale with CSS transform
  const footerSrcDoc = footerHtml ? `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { margin: 0; padding: 0; overflow: hidden; }
          table { border-collapse: collapse; }
          img { max-width: 100%; height: auto; }
        </style>
      </head>
      <body>
        <table width="${BASE_WIDTH}" cellpadding="0" cellspacing="0" border="0" style="width:${BASE_WIDTH}px;margin:0;">
          <tr>
            <td>${footerHtml}</td>
          </tr>
        </table>
      </body>
    </html>
  ` : '';

  return (
    <div className="bg-muted/20 border-t animate-in slide-in-from-top-2 duration-200">
      <div className="flex">
        {/* LEFT SIDE - Campaign Preview - fills available space */}
        <div className="flex-1 p-4 border-r min-w-0">
          {/* Inbox Preview - full width */}
          <div className="mb-3">
            <div className="bg-white rounded-lg border shadow-sm">
              <InboxPreview
                senderName={brandName}
                subjectLine={selectedSubject || 'Select a subject line...'}
                previewText={selectedPreview || 'Select preview text...'}
                avatarColor={brandColor}
              />
            </div>
          </div>

          {/* Zoom Control */}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] text-muted-foreground">Zoom</span>
            <input
              type="range"
              min={25}
              max={65}
              value={zoomLevel}
              onChange={(e) => handleZoomChange(Number(e.target.value))}
              className="w-24 h-1 accent-primary"
            />
            <span className="text-[10px] text-muted-foreground w-8">{zoomLevel}%</span>
          </div>

          {/* Email Preview - slices stacked - no scroll, show full content */}
          <div>
            <div className="flex flex-col">
              <div className="py-3">
                {/* No slices message */}
                {slices.length === 0 && (
                  <div className="flex items-center justify-center h-40 text-muted-foreground">
                    <div className="text-center">
                      <FileText className="h-10 w-10 mx-auto mb-3 opacity-50" />
                      <p className="text-sm">No slices available. Try reprocessing.</p>
                    </div>
                  </div>
                )}

                {/* Render each slice group (row) */}
                {sortedGroups.map((slicesInRow, groupIndex) => (
                  <div key={groupIndex} className="relative flex items-stretch group/row hover:bg-muted/10 -mx-5 px-5">
                    {/* Slice separator line */}
                    {groupIndex > 0 && (
                      <div className="absolute top-0 left-0 right-0 flex items-center z-10" style={{ transform: 'translateY(-50%)' }}>
                        <div className="h-px bg-border flex-1" />
                      </div>
                    )}
                    
                    {/* Left: Link Column - expands to fill available space */}
                    <div className="flex-1 min-w-[120px] flex flex-col justify-center py-1 pr-3 gap-1 items-end">
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
                              <button className="flex items-start gap-1 px-2 py-1 bg-primary/10 border border-primary/20 rounded text-[9px] hover:bg-primary/20 transition-colors text-left w-full">
                                <Link className="w-3 h-3 text-primary flex-shrink-0 mt-0.5" />
                                <span className="text-foreground/80 break-all leading-tight">{slice.link}</span>
                              </button>
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
                    
                    {/* Right: Alt Text Column - expands to fill available space */}
                    <div className="flex-1 min-w-[120px] flex flex-col justify-center py-1 pl-3 gap-1">
                      {slicesInRow.map(({ slice, originalIndex }) => (
                        <div key={originalIndex}>
                          {editingAltIndex === originalIndex ? (
                            <textarea
                              value={slice.altText || ''}
                              onChange={(e) => updateSlice(originalIndex, { altText: e.target.value })}
                              placeholder="Alt..."
                              className="w-full text-[9px] text-muted-foreground bg-muted/40 rounded px-1.5 py-1 border-0 resize-none focus:outline-none focus:ring-1 focus:ring-primary/30"
                              rows={3}
                              autoFocus
                              onBlur={() => setEditingAltIndex(null)}
                            />
                          ) : (
                            <p 
                              onClick={() => setEditingAltIndex(originalIndex)}
                              className="text-[11px] text-foreground leading-tight cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5 break-words"
                            >
                              {slice.altText || <span className="text-muted-foreground italic">Add alt text...</span>}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                {/* Footer Section - aligned with slices, scaled with CSS transform */}
                {footerHtml && (
                  <div className="flex items-stretch">
                    {/* Empty link column space - matches flex layout */}
                    <div className="flex-1 min-w-[120px]" />
                    {/* Footer iframe container - clips the scaled content */}
                    <div 
                      className="flex-shrink-0 overflow-hidden" 
                      style={{ 
                        width: scaledWidth, 
                        height: footerPreviewHeight * (zoomLevel / 100) 
                      }}
                    >
                      <iframe
                        ref={footerIframeRef}
                        srcDoc={footerSrcDoc}
                        onLoad={handleFooterIframeLoad}
                        scrolling="no"
                        style={{
                          width: BASE_WIDTH,
                          height: footerPreviewHeight,
                          border: 'none',
                          display: 'block',
                          transform: `scale(${zoomLevel / 100})`,
                          transformOrigin: 'top left',
                          overflow: 'hidden',
                        }}
                        title="Footer Preview"
                      />
                    </div>
                    {/* Empty alt text column space - matches flex layout */}
                    <div className="flex-1 min-w-[120px]" />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT SIDE - Fixed width - Controls & QA */}
        <div className="w-80 flex-shrink-0 p-4 space-y-4">
          {/* Audience Section */}
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Audience</h4>
            {presets.length > 0 && (
              <Select 
                value={selectedPresetId || undefined}
                onValueChange={(id) => {
                  const preset = presets.find(p => p.id === id);
                  if (preset) applyPreset(preset);
                }}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Select preset..." />
                </SelectTrigger>
                <SelectContent>
                  {presets.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} {p.is_default && '(default)'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            
            {/* Editable Include Segments */}
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">Include</label>
              <div className="flex flex-wrap gap-1 min-h-[28px] p-1.5 border rounded bg-muted/20">
                {includedSegments.map(id => {
                  const list = klaviyoLists.find(l => l.id === id);
                  return (
                    <Badge key={id} variant="secondary" className="text-[10px] gap-1">
                      {list?.name || id}
                      <button onClick={() => removeSegment(id, 'include')}>
                        <X className="h-2 w-2" />
                      </button>
                    </Badge>
                  );
                })}
                <Select onValueChange={(v) => addSegment(v, 'include')}>
                  <SelectTrigger className="h-5 w-auto text-[10px] border-dashed gap-0.5 px-1.5">
                    <Plus className="h-2.5 w-2.5" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableLists.length === 0 ? (
                      <SelectItem value="none" disabled>No segments available</SelectItem>
                    ) : (
                      availableLists.map(list => (
                        <SelectItem key={list.id} value={list.id} className="text-xs">{list.name}</SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Editable Exclude Segments */}
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">Exclude</label>
              <div className="flex flex-wrap gap-1 min-h-[28px] p-1.5 border rounded bg-muted/20">
                {excludedSegments.map(id => {
                  const list = klaviyoLists.find(l => l.id === id);
                  return (
                    <Badge key={id} variant="outline" className="text-[10px] gap-1 text-destructive border-destructive/30">
                      {list?.name || id}
                      <button onClick={() => removeSegment(id, 'exclude')}>
                        <X className="h-2 w-2" />
                      </button>
                    </Badge>
                  );
                })}
                <Select onValueChange={(v) => addSegment(v, 'exclude')}>
                  <SelectTrigger className="h-5 w-auto text-[10px] border-dashed gap-0.5 px-1.5">
                    <Plus className="h-2.5 w-2.5" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableLists.length === 0 ? (
                      <SelectItem value="none" disabled>No segments available</SelectItem>
                    ) : (
                      availableLists.map(list => (
                        <SelectItem key={list.id} value={list.id} className="text-xs">{list.name}</SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {presets.length === 0 && (
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full text-xs"
                onClick={() => setShowCreateDefaultModal(true)}
              >
                <Plus className="h-3 w-3 mr-2" />
                Save as default
              </Button>
            )}
          </div>

          {/* QA Section */}
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">QA Checks</h4>
            
            {/* Links Summary - Detailed */}
            <div className="bg-white rounded-lg border p-3 space-y-2">
              <div className="flex items-center gap-2">
                {hasExternalLinks ? (
                  <>
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    <span className="text-sm font-medium text-amber-700">
                      {slicesWithLinks.length} Links | {externalLinkCount} External
                    </span>
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 text-green-500" />
                    <span className="text-sm font-medium text-green-700">
                      {slicesWithLinks.length} Links | All in brand domain
                    </span>
                  </>
                )}
              </div>
              
              {/* Compact link list */}
              {slicesWithLinks.length > 0 && (
                <div className="space-y-1 pt-2 border-t">
                  {slicesWithLinks.slice(0, 6).map((slice, i) => {
                    const isExternal = slice.link && brandDomain && !slice.link.includes(brandDomain);
                    return (
                      <div 
                        key={i} 
                        className={cn(
                          "text-[11px] truncate flex items-center gap-1.5",
                          isExternal ? "text-amber-600" : "text-muted-foreground"
                        )}
                      >
                        {isExternal && <AlertTriangle className="h-3 w-3 flex-shrink-0" />}
                        <span className="truncate">{slice.link}</span>
                      </div>
                    );
                  })}
                  {slicesWithLinks.length > 6 && (
                    <span className="text-[11px] text-muted-foreground">
                      +{slicesWithLinks.length - 6} more
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Spelling Status with details */}
            <div className="bg-white rounded-lg border p-3 space-y-2">
              <div className="flex items-center gap-2">
                {spellingErrors.length > 0 ? (
                  <>
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    <span className="text-sm font-medium text-amber-700">
                      {spellingErrors.length} Spelling Error{spellingErrors.length > 1 ? 's' : ''}
                    </span>
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 text-green-500" />
                    <span className="text-sm font-medium text-green-700">No Spelling Errors</span>
                  </>
                )}
              </div>
              
              {/* Show actual spelling errors */}
              {spellingErrors.length > 0 && (
                <div className="space-y-1 pt-2 border-t">
                  {spellingErrors.slice(0, 5).map((error, i) => (
                    <div key={i} className="text-[11px] flex items-center gap-2">
                      <span className="text-red-600 line-through">{error.text}</span>
                      <span className="text-muted-foreground">→</span>
                      <span className="text-green-600 font-medium">{error.correction}</span>
                    </div>
                  ))}
                  {spellingErrors.length > 5 && (
                    <span className="text-[11px] text-muted-foreground">
                      +{spellingErrors.length - 5} more
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Alt Text Status */}
            <div className="bg-white rounded-lg border p-3">
              <div className="flex items-center gap-2">
                {allHaveAltText ? (
                  <>
                    <Check className="h-4 w-4 text-green-500" />
                    <span className="text-sm font-medium text-green-700">All Alt Text Set</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      {slicesWithPlaceholderAlt.length} slice{slicesWithPlaceholderAlt.length > 1 ? 's' : ''} missing alt text
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-4 space-y-2">
            {item.status === 'sent_to_klaviyo' && item.klaviyo_campaign_url ? (
              <Button className="w-full" variant="outline" asChild>
                <a href={item.klaviyo_campaign_url} target="_blank" rel="noopener noreferrer">
                  View in Klaviyo <ExternalLink className="h-4 w-4 ml-2" />
                </a>
              </Button>
            ) : (
              <Button
                className="w-full"
                disabled={isSending || item.status === 'processing' || !selectedSubject || !selectedPreview || includedSegments.length === 0}
                onClick={handleSendToKlaviyo}
              >
                <Send className="h-4 w-4 mr-2" />
                {isSending ? 'Sending...' : 'Send to Klaviyo'}
              </Button>
            )}
            
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={handleReprocess} disabled={isReprocessing}>
                <RefreshCw className={cn("h-4 w-4 mr-1", isReprocessing && "animate-spin")} />
                Reprocess
              </Button>
              <Button variant="outline" size="sm" className="text-destructive" onClick={handleDelete} disabled={isDeleting}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Create Default Segment Modal */}
      <Dialog 
        open={showCreateDefaultModal} 
        onOpenChange={(open) => {
          // Only allow closing if there's now a default preset
          const hasDefault = presets.some(p => p.is_default);
          if (!open && !hasDefault) {
            toast.error('Please set a default segment before continuing');
            return;
          }
          setShowCreateDefaultModal(open);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {presets.length > 0 ? 'Set Default Segment' : 'Create Default Segment Set'}
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              {presets.length > 0 
                ? "This brand doesn't have a default segment set. Choose an existing preset or create a new one."
                : "This brand doesn't have any saved segment presets. Create a default set to use for all campaigns."}
            </p>
          </DialogHeader>
          <div className="py-4 space-y-4">
            {/* If presets exist, show option to select existing one as default */}
            {presets.length > 0 && (
              <>
                <div className="space-y-2">
                  <label className="text-xs font-medium">Use Existing Preset</label>
                  <Select onValueChange={(id) => setExistingAsDefault(id)}>
                    <SelectTrigger className="h-8">
                      <SelectValue placeholder="Select a preset to set as default..." />
                    </SelectTrigger>
                    <SelectContent>
                      {presets.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-3 py-2">
                  <div className="flex-1 border-t" />
                  <span className="text-xs text-muted-foreground">OR create new</span>
                  <div className="flex-1 border-t" />
                </div>
              </>
            )}

            {/* Preset Name */}
            <div className="space-y-2">
              <label className="text-xs font-medium">Preset Name</label>
              <Input
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="e.g., 'All Subscribers'"
                className="h-8 text-sm"
              />
            </div>
            
            {/* Include Segments - with searchable picker */}
            <div className="space-y-2">
              <label className="text-xs font-medium">Include Segments</label>
              <div className="flex flex-wrap gap-1.5 min-h-[40px] p-2 border rounded-md bg-muted/20">
                {includedSegments.map(id => {
                  const list = klaviyoLists.find(l => l.id === id);
                  return (
                    <Badge key={id} variant="secondary" className="text-[11px] gap-1">
                      {list?.name || id}
                      <button onClick={() => removeSegment(id, 'include')}>
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </Badge>
                  );
                })}
                {isLoadingLists ? (
                  <span className="text-xs text-muted-foreground">Loading...</span>
                ) : (
                  <Popover open={includePickerOpen} onOpenChange={setIncludePickerOpen}>
                    <PopoverTrigger asChild>
                      <button className="inline-flex items-center gap-1 h-6 px-2 text-xs border border-dashed rounded-md hover:bg-muted/50 transition-colors">
                        <Plus className="h-3 w-3" />
                        <span>Add</span>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[280px] p-0 z-50 bg-background border shadow-lg" align="start">
                      <Command>
                        <CommandInput 
                          placeholder="Search segments..." 
                          value={segmentSearchValue}
                          onValueChange={setSegmentSearchValue}
                          className="h-9"
                        />
                        <CommandList className="max-h-[400px] overflow-y-auto pointer-events-auto">
                          <CommandEmpty>No segments found.</CommandEmpty>
                          <CommandGroup>
                            {availableLists.map(list => (
                              <CommandItem
                                key={list.id}
                                value={list.name}
                                onSelect={() => {
                                  addSegment(list.id, 'include');
                                  setSegmentSearchValue('');
                                  setIncludePickerOpen(false);
                                }}
                                className="text-xs cursor-pointer"
                              >
                                <Check className={cn("h-3 w-3 mr-2", includedSegments.includes(list.id) ? "opacity-100" : "opacity-0")} />
                                {list.name}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            </div>
            
            {/* Exclude Segments - with searchable picker */}
            <div className="space-y-2">
              <label className="text-xs font-medium">Exclude Segments (optional)</label>
              <div className="flex flex-wrap gap-1.5 min-h-[40px] p-2 border rounded-md bg-muted/20">
                {excludedSegments.map(id => {
                  const list = klaviyoLists.find(l => l.id === id);
                  return (
                    <Badge key={id} variant="outline" className="text-[11px] gap-1 text-destructive border-destructive/30">
                      {list?.name || id}
                      <button onClick={() => removeSegment(id, 'exclude')}>
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </Badge>
                  );
                })}
                <Popover open={excludePickerOpen} onOpenChange={setExcludePickerOpen}>
                  <PopoverTrigger asChild>
                    <button className="inline-flex items-center gap-1 h-6 px-2 text-xs border border-dashed rounded-md hover:bg-muted/50 transition-colors">
                      <Plus className="h-3 w-3" />
                      <span>Add</span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[280px] p-0 z-50 bg-background border shadow-lg" align="start">
                    <Command>
                      <CommandInput 
                        placeholder="Search segments..." 
                        value={segmentSearchValue}
                        onValueChange={setSegmentSearchValue}
                        className="h-9"
                      />
                      <CommandList className="max-h-[400px] overflow-y-auto pointer-events-auto">
                        <CommandEmpty>No segments found.</CommandEmpty>
                        <CommandGroup>
                          {availableLists.map(list => (
                            <CommandItem
                              key={list.id}
                              value={list.name}
                              onSelect={() => {
                                addSegment(list.id, 'exclude');
                                setSegmentSearchValue('');
                                setExcludePickerOpen(false);
                              }}
                              className="text-xs cursor-pointer"
                            >
                              <Check className={cn("h-3 w-3 mr-2", excludedSegments.includes(list.id) ? "opacity-100" : "opacity-0")} />
                              {list.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={saveAsDefault} disabled={!presetName.trim() || includedSegments.length === 0}>
              Save as Default
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
