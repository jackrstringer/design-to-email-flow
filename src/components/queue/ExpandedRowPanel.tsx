import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Trash2, Send, RefreshCw, ExternalLink, Plus, X, Check, AlertTriangle, FileText, Copy, Flag, ChevronDown, PenLine } from 'lucide-react';
import { FooterStudioFlyout } from '@/components/footer/FooterStudioFlyout';
import { CampaignQueueItem } from '@/hooks/useCampaignQueue';
import { useBrandDictionary } from '@/hooks/useBrandDictionary';
import { useCopyQa } from '@/hooks/useSpellcheck';
import { InlineDropdownSelector } from './InlineDropdownSelector';
import { isRealLink } from '@/lib/links';
import { SpellingErrorsPanel } from './SpellingErrorsPanel';
import { QAFlagsPanel } from '@/components/knowledge/QAFlagsPanel';
import { FlagMistakeDialog } from '@/components/knowledge/FlagMistakeDialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { SliceCanvas } from './SliceCanvas';

interface KlaviyoList {
  id: string;
  name: string;
}

interface BrandData {
  footerHtml: string | null;
  allLinks: string[];
  domain: string | null;
}

interface ExpandedRowPanelProps {
  item: CampaignQueueItem;
  onUpdate: () => void;
  onClose: () => void;
  preloadedPresets?: SegmentPreset[];
  preloadedKlaviyoLists?: KlaviyoList[];
  preloadedBrandData?: BrandData;
  initialZoomLevel?: number;
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

// Normalize segment data - handles both string IDs and {id, name} objects
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

export function ExpandedRowPanel({ 
  item, 
  onUpdate, 
  onClose, 
  preloadedPresets, 
  preloadedKlaviyoLists,
  preloadedBrandData,
  initialZoomLevel = 39
}: ExpandedRowPanelProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isReprocessing, setIsReprocessing] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState(item.selected_subject_line || '');
  const [selectedPreview, setSelectedPreview] = useState(item.selected_preview_text || '');
  
  // Local slices state for editing
  const [slices, setSlices] = useState<SliceData[]>([]);

  // Segment state - initialize from preloaded data immediately
  const [klaviyoLists, setKlaviyoLists] = useState<KlaviyoList[]>(preloadedKlaviyoLists || []);
  const [includedSegments, setIncludedSegments] = useState<string[]>([]);
  const [excludedSegments, setExcludedSegments] = useState<string[]>([]);
  const [isLoadingLists, setIsLoadingLists] = useState(false);
  const [listLoadError, setListLoadError] = useState<string | null>(null);

  // Segment presets - initialize from preloaded data
  const [presets, setPresets] = useState<SegmentPreset[]>(preloadedPresets || []);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [showCreateDefaultModal, setShowCreateDefaultModal] = useState(false);
  const [presetName, setPresetName] = useState('');
  
  // Searchable segment picker state
  const [includePickerOpen, setIncludePickerOpen] = useState(false);
  const [excludePickerOpen, setExcludePickerOpen] = useState(false);
  const [segmentSearchValue, setSegmentSearchValue] = useState('');

  // Footer HTML - per-campaign override (footer studio) wins, then preloaded brand footer
  const [footerHtml, setFooterHtml] = useState<string | null>(
    item.footer_override_html || preloadedBrandData?.footerHtml || null,
  );
  const [footerStudioOpen, setFooterStudioOpen] = useState(false);
  const [footerError, setFooterError] = useState<string | null>(null);
  const [footerPreviewHeight, setFooterPreviewHeight] = useState(200);

  // Brand links for autocomplete - initialize from preloaded data
  const [brandLinks, setBrandLinks] = useState<string[]>(preloadedBrandData?.allLinks || []);
  const [brandDomain, setBrandDomain] = useState<string | null>(preloadedBrandData?.domain || null);

  // Display mode for slice info: 'all' | 'links' | 'none'
  type DisplayMode = 'all' | 'links' | 'none';
  // Links-only is the default view (Jack): links get the room to show in full.
  const [displayMode, setDisplayMode] = useState<DisplayMode>('links');
  const [hoveredSliceIndex, setHoveredSliceIndex] = useState<number | null>(null);

  // "Flag a mistake" dialog state (feeds the brand knowledge layer)
  const [flagDialogOpen, setFlagDialogOpen] = useState(false);
  const [flagContext, setFlagContext] = useState<Record<string, unknown> | undefined>(undefined);

  // Container sizing - zoom level passed in, no async fetch needed
  const footerIframeRef = useRef<HTMLIFrameElement>(null);
  const [zoomLevel, setZoomLevel] = useState(initialZoomLevel);
  const hasAppliedDefaultPreset = useRef(false);
  const scaledWidth = useMemo(() => BASE_WIDTH * (zoomLevel / 100), [zoomLevel]);

  // Get brand info
  const brandName = (item as any).brands?.name || 'Brand';
  const brandColor = (item as any).brands?.primary_color || '#6b7280';

  // Backend design-image spelling (Claude vision over the sliced PNG).
  // Shape is { word, suggestion, context } — filter out empty-word noise.
  const designSpelling = (((item.spelling_errors as Array<{
    word?: string;
    suggestion?: string;
    context?: string;
  }>) || []).filter((e) => e.word && e.word.trim().length > 0));

  // Spelling + grammar QA on the selected subject line / preview text.
  // Blocks "Build in Klaviyo" while any issue exists. Grammar (LLM) also
  // runs once when the panel opens — this is the pre-build checkpoint.
  const dictionary = useBrandDictionary(item.brand_id);
  const copyQa = useCopyQa(
    { subject: selectedSubject, preview: selectedPreview },
    {
      dictionary: dictionary.words,
      brandName: item.brands?.name,
      brandDomain: item.brands?.domain,
      grammarOnMount: true,
    },
  );
  const copyIssues = [
    ...(copyQa.issuesByField.subject ?? []),
    ...(copyQa.issuesByField.preview ?? []),
  ];
  // Only HARD errors block the build. Suggestions (preferential tweaks like
  // "ebook") stay visible but never halt the launch. Design-image typos and
  // LLM-confirmed copy mistakes are errors; local-only flags are suggestions.
  const copyErrors = copyIssues.filter((i) => i.severity === 'error');
  const copySuggestions = copyIssues.filter((i) => i.severity !== 'error');
  const buildBlockers = [
    ...copyErrors.map((i) => `${i.kind === 'spelling' ? 'Spelling' : 'Grammar'}: “${i.word}”${i.message ? ` — ${i.message}` : ''}`),
    ...designSpelling.map((e) => `Design typo: “${e.word}”${e.suggestion ? ` → “${e.suggestion}”` : ''}`),
  ];
  const isBlockedByCopyQa = buildBlockers.length > 0;

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

  // Apply default preset immediately on mount (synchronous, no useEffect needed for this)
  useEffect(() => {
    if (hasAppliedDefaultPreset.current) return;
    
    // Use preloaded presets (already set as initial state)
    const defaultPreset = presets.find(p => p.is_default);
    if (defaultPreset) {
      hasAppliedDefaultPreset.current = true;
      setIncludedSegments(defaultPreset.included_segments);
      setExcludedSegments(defaultPreset.excluded_segments);
      setSelectedPresetId(defaultPreset.id);
    }
  }, [presets]);

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

  // Only fetch data if not preloaded (fallback for edge cases)
  useEffect(() => {
    const loadMissingData = async () => {
      if (!item.brand_id) return;
      
      // Skip if we have all preloaded data
      const hasPreloadedData = preloadedBrandData && preloadedKlaviyoLists && preloadedPresets;
      if (hasPreloadedData) return;
      
      setIsLoadingLists(true);
      setListLoadError(null);
      
      try {
        // Only fetch what's missing
        if (!preloadedBrandData) {
          const { data: brand } = await supabase
            .from('brands')
            .select('klaviyo_key_set, footer_html, all_links, domain')
            .eq('id', item.brand_id)
            .single();

          if (brand?.all_links && Array.isArray(brand.all_links)) {
            setBrandLinks(brand.all_links as string[]);
          }
          if (brand?.domain) {
            setBrandDomain(brand.domain);
          }

          // Load footer (skip when this campaign has a footer-studio override)
          if (!item.footer_override_html) {
            const { data: primaryFooter } = await supabase
              .from('brand_footers')
              .select('html')
              .eq('brand_id', item.brand_id)
              .eq('is_primary', true)
              .limit(1)
              .maybeSingle();

            if (primaryFooter?.html) {
              setFooterHtml(primaryFooter.html);
            } else {
              const { data: recentFooter } = await supabase
                .from('brand_footers')
                .select('html')
                .eq('brand_id', item.brand_id)
                .order('updated_at', { ascending: false })
                .limit(1)
                .maybeSingle();

              if (recentFooter?.html) {
                setFooterHtml(recentFooter.html);
              } else if (brand?.footer_html) {
                setFooterHtml(brand.footer_html);
              }
            }
          }

          // Load Klaviyo lists if not preloaded (key resolved server-side)
          if (!preloadedKlaviyoLists && brand?.klaviyo_key_set) {
            const { data, error } = await supabase.functions.invoke('get-klaviyo-lists', {
              body: { brandId: item.brand_id }
            });
            
            if (error) {
              setListLoadError('Failed to load segments');
            } else if (data?.lists) {
              setKlaviyoLists(data.lists);
            }
          }
        }

        // Load presets if not preloaded
        if (!preloadedPresets) {
          const { data: presetsData } = await supabase
            .from('segment_presets')
            .select('*')
            .eq('brand_id', item.brand_id)
            .order('created_at', { ascending: false });

          if (presetsData && presetsData.length > 0) {
            const mappedPresets = presetsData.map(p => ({
              id: p.id,
              name: p.name,
              included_segments: normalizeSegmentIds(p.included_segments),
              excluded_segments: normalizeSegmentIds(p.excluded_segments),
              is_default: p.is_default || false,
            }));
            mappedPresets.sort((a, b) => (b.is_default ? 1 : 0) - (a.is_default ? 1 : 0));
            setPresets(mappedPresets);
          }
        }
      } catch (err) {
        console.error('Failed to load brand data:', err);
        setListLoadError('Failed to load brand data');
      } finally {
        setIsLoadingLists(false);
      }
    };

    loadMissingData();
  }, [item.brand_id, preloadedPresets, preloadedKlaviyoLists, preloadedBrandData]);

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
    const before = slices[index];
    const newSlices = [...slices];
    newSlices[index] = { ...newSlices[index], ...updates };
    setSlices(newSlices);

    // Persist to database
    await supabase
      .from('campaign_queue')
      .update({ slices: JSON.parse(JSON.stringify(newSlices)) })
      .eq('id', item.id);

    // Feed corrections to the brand knowledge layer (best-effort).
    // The learning agent distills these into durable lessons after push.
    if (item.brand_id && before) {
      const eventType =
        'link' in updates && updates.link !== before.link
          ? 'link_corrected'
          : 'altText' in updates && updates.altText !== before.altText
            ? 'alt_text_corrected'
            : null;
      if (eventType) {
        supabase
          .from('knowledge_events')
          .insert({
            brand_id: item.brand_id,
            user_id: item.user_id,
            queue_id: item.id,
            event_type: eventType,
            before: JSON.parse(JSON.stringify({
              link: before.link ?? null,
              altText: before.altText ?? null,
              imageUrl: before.imageUrl ?? null,
            })),
            after: JSON.parse(JSON.stringify(updates)),
          })
          .then(({ error }) => {
            if (error) console.warn('knowledge_events insert failed:', error.message);
          });
      }
    }
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
    setIncludedSegments(normalizeSegmentIds(preset.included_segments));
    setExcludedSegments(normalizeSegmentIds(preset.excluded_segments));
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
    
    // Set status to processing with "Building in Klaviyo" step (shows spinner in row)
    await supabase
      .from('campaign_queue')
      .update({ 
        status: 'processing', 
        processing_step: 'Building in Klaviyo',
        processing_percent: 0 
      })
      .eq('id', item.id);
    
    onUpdate(); // Refresh to show processing state in the row
    
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
        footerHtml: footerHtml,
        mode: 'campaign',
        listId: includedSegments[0],
      }
    });
    
    if (error) {
      // Revert status on error
      await supabase
        .from('campaign_queue')
        .update({ 
          status: 'ready_for_review',
          processing_step: null,
          processing_percent: null
        })
        .eq('id', item.id);
      toast.error('Failed to build in Klaviyo');
      setIsSending(false);
      onUpdate();
      return;
    }
    
    await supabase
      .from('campaign_queue')
      .update({
        status: 'sent_to_klaviyo',
        processing_step: null,
        processing_percent: null,
        klaviyo_template_id: data?.templateId,
        klaviyo_campaign_id: data?.campaignId,
        klaviyo_campaign_url: data?.campaignUrl,
        sent_to_klaviyo_at: new Date().toISOString()
      })
      .eq('id', item.id);
    
    setIsSending(false);
    toast.success('Built in Klaviyo!');
    onUpdate();
  };

  const handleSendToKlaviyo = async () => {
    if (!selectedSubject || !selectedPreview) {
      toast.error('Please select a subject line and preview text first');
      return;
    }

    if (isBlockedByCopyQa) {
      toast.error('Fix the flagged spelling/grammar issues before building');
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
  const slicesWithLinks = slices.filter(s => isRealLink(s.link));
  const uniqueLinkCount = new Set(slicesWithLinks.map(s => s.link)).size;
  const slicesMissingLinks = slices.filter(s => !isRealLink(s.link));
  const allHaveLinks = hasSlices && slicesMissingLinks.length === 0;
  

  // External links check
  const externalLinkCount = brandDomain
    ? new Set(slicesWithLinks.filter(s => !s.link!.includes(brandDomain)).map(s => s.link)).size
    : 0;
  const hasExternalLinks = externalLinkCount > 0;

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
    <div className="border-t bg-background animate-in slide-in-from-top-2 duration-200">
      <div className="flex items-start">
        {/* LEFT SIDE - Campaign Preview - fills available space, scrollable */}
        <div className="flex-1 p-4 border-r min-w-0 max-h-[80vh] overflow-y-auto overflow-x-visible">
          {/* Inbox preview — THE one editable home for subject/preview in the
              expanded view. Click either line to edit; chevron opens the 10
              generated options. (The row above is the only other location.) */}
          <div className="mb-3">
            <div className="surface-hairline px-3 py-3">
              <div className="mb-1 flex items-center gap-2.5">
                <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold text-foreground/70">
                  {brandName.charAt(0).toUpperCase()}
                </div>
                <div className="flex min-w-0 flex-1 items-center justify-between">
                  <span className="truncate text-[13px] font-semibold">{brandName}</span>
                  <span className="ml-2 flex-shrink-0 text-[11px] text-muted-foreground">now</span>
                </div>
              </div>
              <div className="pl-[38px]">
                <InlineDropdownSelector
                  selected={selectedSubject || null}
                  options={item.generated_subject_lines}
                  provided={item.provided_subject_line}
                  onSelect={async (value) => {
                    setSelectedSubject(value);
                    await supabase.from('campaign_queue').update({ selected_subject_line: value }).eq('id', item.id);
                    onUpdate();
                    return true;
                  }}
                  placeholder="Select a subject line…"
                  textClassName="!text-[13px] font-medium"
                  qaIssues={copyQa.issuesByField.subject ?? []}
                  onAddToDictionary={item.brand_id ? dictionary.addWord : undefined}
                  getDraftIssues={copyQa.checkDraft}
                />
                <InlineDropdownSelector
                  selected={selectedPreview || null}
                  options={item.generated_preview_texts}
                  provided={item.provided_preview_text}
                  onSelect={async (value) => {
                    setSelectedPreview(value);
                    await supabase.from('campaign_queue').update({ selected_preview_text: value }).eq('id', item.id);
                    onUpdate();
                    return true;
                  }}
                  placeholder="Select preview text…"
                  textClassName="!text-[12px] text-muted-foreground"
                  qaIssues={copyQa.issuesByField.preview ?? []}
                  onAddToDictionary={item.brand_id ? dictionary.addWord : undefined}
                  getDraftIssues={copyQa.checkDraft}
                />
              </div>
            </div>
          </div>

          {/* Canvas toolbar — quiet, pill-segmented, 11px */}
          <div className="mb-3 flex items-center gap-5">
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground">Zoom</span>
              <input
                type="range"
                min={25}
                max={100}
                value={zoomLevel}
                onChange={(e) => handleZoomChange(Number(e.target.value))}
                className="h-1 w-28 cursor-pointer accent-foreground"
              />
              <span className="w-8 font-mono text-[10px] tabular-nums text-muted-foreground">{zoomLevel}%</span>
            </div>

            {/* Display mode — segmented pill */}
            <div className="flex items-center rounded-full border bg-secondary/60 p-0.5">
              {(['all', 'links', 'none'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setDisplayMode(mode)}
                  className={cn(
                    'rounded-full px-2.5 py-[3px] text-[11px] leading-none transition-[background-color,color,box-shadow] duration-150',
                    displayMode === mode
                      ? 'bg-card font-medium text-foreground shadow-card'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {mode === 'all' ? 'All' : mode === 'links' ? 'Links' : 'Clean'}
                </button>
              ))}
            </div>

            {/* Flag a mistake - feeds the brand knowledge layer */}
            {item.brand_id && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[10px] text-muted-foreground ml-auto"
                onClick={() => {
                  const contextIndex = hoveredSliceIndex;
                  const slice = contextIndex != null ? slices[contextIndex] : undefined;
                  setFlagContext(slice ? {
                    sliceIndex: contextIndex,
                    imageUrl: slice.imageUrl ?? null,
                    link: slice.link ?? null,
                    altText: slice.altText ?? null,
                  } : undefined);
                  setFlagDialogOpen(true);
                }}
              >
                <Flag className="w-3 h-3 mr-1" />
                Flag a mistake
              </Button>
            )}
          </div>

          {/* Email Preview — one flush canvas; annotations overlay in gutters */}
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

                {slices.length > 0 && (
                  <SliceCanvas
                    slices={slices}
                    scaledWidth={scaledWidth}
                    displayMode={displayMode}
                    brandLinks={brandLinks}
                    brandId={item.brand_id}
                    onUpdateSlice={updateSlice}
                    onHoverSlice={setHoveredSliceIndex}
                  />
                )}

                {/* Footer Section - centered to match slices */}
                {footerHtml && (
                  <div className="flex justify-center">
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
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT SIDE - Fixed width - Controls & QA - Sticky */}
        <div className="w-[400px] flex-shrink-0 p-3 space-y-3 sticky top-0 self-start max-h-[80vh] overflow-y-auto border-l -ml-px">
          {/* QA flags from the autonomous QA agent - errors first, visible without scrolling */}
          <QAFlagsPanel
            flags={item.qa_flags}
            brandId={item.brand_id}
            queueId={item.id}
          />

          {/* Audience Section */}
          <div className="space-y-2">
            <h4 className="text-[11px] font-semibold text-muted-foreground">Audience</h4>
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
                    <Badge key={id} variant="secondary" className="h-[22px] max-w-[180px] gap-1 rounded-full border border-border bg-card pl-2.5 pr-1 text-[11px] font-medium leading-none text-foreground/80">
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
                    <Badge key={id} variant="outline" className="h-[22px] max-w-[180px] gap-1 rounded-full border-destructive/30 bg-destructive/[0.06] pl-2.5 pr-1 text-[11px] font-medium leading-none text-destructive">
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
            <div className="flex items-center justify-between">
              <h4 className="text-[11px] font-semibold text-muted-foreground">QA checks</h4>
              {item.brand_id && (
                <button
                  onClick={() => setFooterStudioOpen(true)}
                  className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
                  title="Open the footer studio"
                >
                  <PenLine className="h-3 w-3" />
                  Edit footer
                </button>
              )}
            </div>
            
            {/* Links Summary - Detailed */}
            <div className="bg-card rounded-lg border px-3 py-2.5 space-y-2">
              <details className="group/links">
              <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
                {hasExternalLinks ? (
                  <>
                    <AlertTriangle className="h-4 w-4 text-warning" />
                    <span className="text-sm font-medium text-foreground">
                      {uniqueLinkCount} unique link{uniqueLinkCount === 1 ? '' : 's'} · {externalLinkCount} external
                    </span>
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 text-success" />
                    <span className="text-sm font-medium text-foreground">
                      {uniqueLinkCount} unique link{uniqueLinkCount === 1 ? '' : 's'} · all on brand domain
                    </span>
                  </>
                )}
                <ChevronDown className="ml-auto h-3.5 w-3.5 text-muted-foreground transition-transform group-open/links:rotate-180" />
              </summary>
              
              {/* Compact link list (collapsed by default) */}
              {slicesWithLinks.length > 0 && (
                <div className="space-y-1 pt-2 mt-2 border-t">
                  {slicesWithLinks.map((slice, i) => {
                    const isExternal = slice.link && brandDomain && !slice.link.includes(brandDomain);
                    return (
                      <div 
                        key={i} 
                        className={cn(
                          "text-[11px] truncate flex items-center gap-1.5",
                          isExternal ? "text-foreground" : "text-muted-foreground"
                        )}
                      >
                        {isExternal && <AlertTriangle className="h-3 w-3 flex-shrink-0" />}
                        <span className="truncate">{slice.link}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              </details>
            </div>

            {/* Spelling / grammar QA — live on the selected subject & preview,
                plus any spelling caught in the design image itself. */}
            <div className="bg-card rounded-lg border px-3 py-2.5 space-y-2">
              {(() => {
                const errorCount = copyErrors.length + designSpelling.length;
                return (
                  <div className="flex items-center gap-2">
                    {errorCount > 0 ? (
                      <>
                        <AlertTriangle className="h-4 w-4 text-orange-500" />
                        <span className="text-sm font-medium text-foreground">
                          {errorCount} {errorCount > 1 ? 'errors' : 'error'} — must fix before building
                        </span>
                      </>
                    ) : copySuggestions.length > 0 ? (
                      <>
                        <Check className="h-4 w-4 text-success" />
                        <span className="text-sm font-medium text-foreground">
                          No errors · {copySuggestions.length} optional suggestion
                          {copySuggestions.length > 1 ? 's' : ''}
                        </span>
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4 text-success" />
                        <span className="text-sm font-medium text-foreground">No spelling or grammar issues</span>
                      </>
                    )}
                  </div>
                );
              })()}

              {(copyIssues.length > 0 || designSpelling.length > 0) && (
                <div className="space-y-1.5 pt-2 border-t">
                  {designSpelling.slice(0, 8).map((e, i) => (
                    <div key={`d${i}`} className="flex items-center gap-2 text-[11.5px]">
                      <span className="inline-flex h-[16px] shrink-0 items-center rounded-full bg-orange-500/15 px-1.5 text-[9.5px] font-semibold leading-none text-orange-600">
                        In design
                      </span>
                      <span className="font-medium text-foreground">{e.word}</span>
                      {e.suggestion && (
                        <>
                          <span className="text-muted-foreground">→</span>
                          <span className="text-foreground">{e.suggestion}</span>
                        </>
                      )}
                    </div>
                  ))}
                  {copyIssues.map((issue, i) => (
                    <div key={`c${i}`} className="flex items-center gap-2 text-[11.5px]">
                      <span
                        className={cn(
                          'inline-flex h-[16px] shrink-0 items-center rounded-full px-1.5 text-[9.5px] font-medium leading-none',
                          issue.severity === 'suggestion'
                            ? 'bg-amber-500/10 text-amber-700'
                            : 'bg-destructive/[0.08] text-destructive',
                        )}
                      >
                        {issue.severity === 'suggestion' ? 'Suggestion' : issue.kind === 'spelling' ? 'Spelling' : 'Grammar'}
                      </span>
                      <span className="font-medium text-foreground">{issue.word}</span>
                      {issue.suggestions && issue.suggestions.length > 0 && (
                        <>
                          <span className="text-muted-foreground">→</span>
                          <span className="text-foreground">{issue.suggestions[0]}</span>
                        </>
                      )}
                    </div>
                  ))}
                  <p className="pt-0.5 text-[10.5px] text-muted-foreground">
                    Design typos must be fixed in Figma and re-uploaded. Hover an underlined subject/preview word to fix it here.
                  </p>
                </div>
              )}
            </div>


            {/* Klaviyo Campaign URL */}
            <div className="bg-card rounded-lg border px-3 py-2.5 space-y-2">
              <div className="flex items-center gap-2">
                <ExternalLink className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Klaviyo Campaign</span>
              </div>
              {(item.status === 'sent_to_klaviyo' || item.status === 'closed') && (item.klaviyo_campaign_url || item.klaviyo_campaign_id) ? (
                <div className="group flex items-center gap-2">
                  <a
                    href={item.klaviyo_campaign_url || `https://www.klaviyo.com/email-template-editor/campaign/${item.klaviyo_campaign_id}/content/edit`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-muted-foreground hover:text-muted-foreground underline truncate max-w-56"
                    title={item.klaviyo_campaign_url || `https://www.klaviyo.com/email-template-editor/campaign/${item.klaviyo_campaign_id}/content/edit`}
                  >
                    {item.klaviyo_campaign_url || `klaviyo.com/email-template-editor/campaign/${item.klaviyo_campaign_id}/content/edit`}
                  </a>
                  <button
                    onClick={() => {
                      const url = item.klaviyo_campaign_url || `https://www.klaviyo.com/email-template-editor/campaign/${item.klaviyo_campaign_id}/content/edit`;
                      navigator.clipboard.writeText(url);
                      toast.success('URL copied to clipboard');
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-muted rounded"
                    title="Copy URL"
                  >
                    <Copy className="h-3 w-3 text-muted-foreground" />
                  </button>
                </div>
              ) : (
                <span className="text-[11px] text-muted-foreground italic">
                  {item.status === 'processing' ? 'Processing...' : 'Not yet sent to Klaviyo'}
                </span>
              )}
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
              <Tooltip delayDuration={150}>
                <TooltipTrigger asChild>
                  {/* span wrapper so the tooltip still fires on the disabled button */}
                  <span className="block w-full">
                    <Button
                      className="w-full"
                      disabled={isSending || item.status === 'processing' || !selectedSubject || !selectedPreview || includedSegments.length === 0 || isBlockedByCopyQa}
                      onClick={handleSendToKlaviyo}
                    >
                      {isSending ? (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          Building...
                        </>
                      ) : (
                        <>
                          <Send className="h-4 w-4 mr-2" />
                          Build in Klaviyo
                        </>
                      )}
                    </Button>
                  </span>
                </TooltipTrigger>
                {isBlockedByCopyQa && (
                  <TooltipContent side="top" className="max-w-[300px]">
                    <p className="mb-1 text-xs font-medium">Fix these before building:</p>
                    <ul className="space-y-0.5">
                      {buildBlockers.slice(0, 6).map((b, i) => (
                        <li key={i} className="text-[11px] leading-snug">{b}</li>
                      ))}
                      {buildBlockers.length > 6 && (
                        <li className="text-[11px] leading-snug opacity-70">+{buildBlockers.length - 6} more</li>
                      )}
                    </ul>
                  </TooltipContent>
                )}
              </Tooltip>
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

      {/* Footer studio flyout — type-to-edit / drag / themes / agent */}
      {item.brand_id && (
        <FooterStudioFlyout
          open={footerStudioOpen}
          onOpenChange={setFooterStudioOpen}
          brandId={item.brand_id}
          queueId={item.id}
          fallbackFooterHtml={footerHtml}
          overrideState={item.footer_override_state}
          onApplied={(html) => {
            setFooterHtml(html);
            onUpdate();
          }}
        />
      )}

      {/* Flag a mistake dialog - feeds the brand knowledge layer */}
      {item.brand_id && (
        <FlagMistakeDialog
          brandId={item.brand_id}
          queueId={item.id}
          defaultContext={flagContext}
          open={flagDialogOpen}
          onOpenChange={setFlagDialogOpen}
        />
      )}
    </div>
  );
}
