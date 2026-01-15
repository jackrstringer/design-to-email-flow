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
      {/* TOP ROW - Inbox Preview and Actions */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex-1 max-w-md">
          <InboxPreview
            senderName={brandName}
            subjectLine={selectedSubject}
            previewText={selectedPreview}
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {item.status === 'sent_to_klaviyo' && item.klaviyo_campaign_url ? (
            <Button size="sm" variant="outline" className="h-8 text-xs" asChild>
              <a href={item.klaviyo_campaign_url} target="_blank" rel="noopener noreferrer">
                Klaviyo <ExternalLink className="h-3 w-3 ml-1" />
              </a>
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                className="h-8 text-xs"
                disabled={isSending || item.status === 'processing' || !selectedSubject || !selectedPreview}
                onClick={handleSendToKlaviyo}
              >
                <Send className="h-3 w-3 mr-1" />
                {isSending ? 'Sending...' : 'Send'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={handleReprocess}
                disabled={isReprocessing || item.status === 'processing'}
              >
                <RefreshCw className={cn("h-3.5 w-3.5", isReprocessing && "animate-spin")} />
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* SECOND ROW - Audience & QA Cards */}
      <div className="grid grid-cols-2 gap-4 p-4 border-b">
        {/* Audience Card */}
        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium">Audience</h4>
            {presets.length > 0 && (
              <Select onValueChange={(id) => {
                const preset = presets.find(p => p.id === id);
                if (preset) applyPreset(preset);
              }}>
                <SelectTrigger className="h-7 text-xs w-[140px]">
                  <SelectValue placeholder="Load preset..." />
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
          </div>

          {listLoadError ? (
            <div className="text-xs text-destructive">{listLoadError}</div>
          ) : (
            <div className="space-y-3">
              {/* Include segments */}
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Include</label>
                <div className="flex flex-wrap gap-1.5">
                  {includedSegments.map(id => {
                    const list = klaviyoLists.find(l => l.id === id);
                    return (
                      <Badge key={id} variant="secondary" className="gap-1 text-xs py-0.5 h-6">
                        {list?.name || id}
                        <button onClick={() => removeSegment(id, 'include')} className="hover:text-destructive">
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    );
                  })}
                  <Select onValueChange={(v) => addSegment(v, 'include')}>
                    <SelectTrigger className="h-6 text-xs w-auto px-2 border-dashed gap-1">
                      <Plus className="h-3 w-3" />
                      <span>Add</span>
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
              </div>

              {/* Exclude segments */}
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Exclude</label>
                <div className="flex flex-wrap gap-1.5">
                  {excludedSegments.map(id => {
                    const list = klaviyoLists.find(l => l.id === id);
                    return (
                      <Badge key={id} variant="outline" className="gap-1 text-xs py-0.5 h-6 text-destructive border-destructive/30">
                        {list?.name || id}
                        <button onClick={() => removeSegment(id, 'exclude')} className="hover:text-destructive">
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    );
                  })}
                  <Select onValueChange={(v) => addSegment(v, 'exclude')}>
                    <SelectTrigger className="h-6 text-xs w-auto px-2 border-dashed gap-1">
                      <Plus className="h-3 w-3" />
                      <span>Exclude</span>
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
              </div>
            </div>
          )}
        </div>

        {/* QA Card */}
        <div className="bg-white rounded-lg border p-4">
          <h4 className="text-sm font-medium mb-3">QA Checks</h4>
          <div className="grid grid-cols-2 gap-3">
            {/* External Links */}
            <div className={cn(
              "flex items-center gap-2 p-2 rounded",
              hasExternalLinks ? "bg-amber-50" : "bg-green-50"
            )}>
              {hasExternalLinks ? (
                <>
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <span className="text-xs text-amber-700">{externalLinks.length} external</span>
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 text-green-600" />
                  <span className="text-xs text-green-700">All internal</span>
                </>
              )}
            </div>

            {/* Spelling */}
            <div className={cn(
              "flex items-center gap-2 p-2 rounded",
              spellingErrors.length > 0 ? "bg-amber-50" : "bg-green-50"
            )}>
              {spellingErrors.length > 0 ? (
                <>
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <span className="text-xs text-amber-700">{spellingErrors.length} spelling</span>
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 text-green-600" />
                  <span className="text-xs text-green-700">No errors</span>
                </>
              )}
            </div>

            {/* Links Coverage */}
            <div className={cn(
              "flex items-center gap-2 p-2 rounded",
              !allHaveLinks ? "bg-amber-50" : "bg-green-50"
            )}>
              {allHaveLinks ? (
                <>
                  <Check className="h-4 w-4 text-green-600" />
                  <span className="text-xs text-green-700">All linked</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <span className="text-xs text-amber-700">{slicesMissingLinks.length} missing links</span>
                </>
              )}
            </div>

            {/* Alt Text */}
            <div className={cn(
              "flex items-center gap-2 p-2 rounded",
              !allHaveAltText ? "bg-amber-50" : "bg-green-50"
            )}>
              {allHaveAltText ? (
                <>
                  <Check className="h-4 w-4 text-green-600" />
                  <span className="text-xs text-green-700">Alt text ✓</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <span className="text-xs text-amber-700">{slicesWithPlaceholderAlt.length} need alt</span>
                </>
              )}
            </div>
          </div>

          {/* Spelling errors panel */}
          {spellingErrors.length > 0 && (
            <div className="mt-3 pt-3 border-t">
              <SpellingErrorsPanel
                campaignId={item.id}
                spellingErrors={spellingErrors}
                slices={slices}
                source={item.source}
                sourceMetadata={item.source_metadata as Record<string, unknown> | undefined}
                onErrorFixed={onUpdate}
              />
            </div>
          )}
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

            {/* Render each slice group (row) - Compact 3-column layout: Link | Image | Alt */}
            {sortedGroups.map((slicesInRow, groupIndex) => (
              <div key={groupIndex} className="relative flex items-stretch">
                {/* Slice separator line */}
                {groupIndex > 0 && (
                  <div className="absolute top-0 left-0 right-0 flex items-center z-10" style={{ transform: 'translateY(-50%)' }}>
                    <div className="h-px bg-destructive/60 flex-1" />
                    <span className="px-2 text-[9px] text-destructive/60 font-medium">SLICE {groupIndex + 1}</span>
                  </div>
                )}
                
                {/* Left: Link Column */}
                <div className="w-64 flex-shrink-0 flex flex-col justify-center py-2 pr-3 gap-2">
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
                              <button className="flex items-center gap-1.5 px-2 py-1 bg-primary/10 border border-primary/20 rounded text-[10px] hover:bg-primary/20 transition-colors text-left w-full">
                                <Link className="w-3 h-3 text-primary flex-shrink-0" />
                                <span className="text-foreground/80 truncate max-w-[200px]">{slice.link}</span>
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="left" className="max-w-sm">
                              <p className="break-all text-xs">{slice.link}</p>
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <button className="flex items-center gap-1.5 px-2 py-1 border border-dashed border-muted-foreground/30 rounded text-muted-foreground/40 hover:border-primary/50 hover:text-primary/70 transition-colors text-[10px] w-full">
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
                            {/* Remove link option if exists */}
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
                
                {/* Right: Alt Text Column */}
                <div className="w-48 flex-shrink-0 flex flex-col justify-center py-2 pl-3 gap-2">
                  {slicesInRow.map(({ slice, originalIndex }) => (
                    <div key={originalIndex}>
                      {editingAltIndex === originalIndex ? (
                        <textarea
                          value={slice.altText || ''}
                          onChange={(e) => updateSlice(originalIndex, { altText: e.target.value })}
                          placeholder="Add alt..."
                          className="w-full text-[10px] text-muted-foreground leading-snug bg-muted/40 rounded px-2 py-1.5 border-0 resize-none focus:outline-none focus:ring-1 focus:ring-primary/30"
                          rows={2}
                          autoFocus
                          onBlur={() => setEditingAltIndex(null)}
                        />
                      ) : (
                        <p 
                          onClick={() => setEditingAltIndex(originalIndex)}
                          className="text-[10px] text-muted-foreground/60 leading-snug cursor-pointer hover:text-muted-foreground transition-colors"
                        >
                          {slice.altText || 'Add alt...'}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Footer Section - aligned with 3-column layout */}
            {(footerHtml || footerError || slices.length > 0) && (
              <div className="border-t-2 border-dashed border-primary/40 mt-2">
                <div className="flex items-stretch">
                  {/* Left: Label column */}
                  <div className="w-64 flex-shrink-0 flex items-center justify-end py-2 pr-3">
                    <span className="text-[10px] font-medium text-primary/50 uppercase tracking-wider">Footer</span>
                  </div>
                  
                  {/* Center: Footer Preview */}
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
                  
                  {/* Right: Error column */}
                  <div className="w-48 flex-shrink-0 flex items-center py-2 pl-3">
                    {footerError && (
                      <div className="text-[10px] text-destructive flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                        <span>{footerError}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
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
