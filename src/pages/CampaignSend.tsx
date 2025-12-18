import { useState, useEffect, useMemo } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ChevronLeft, Send, RefreshCw, Heart, Check, Pencil, Loader2, ExternalLink, Smile, Link as LinkIcon, Plus, X, Search, Save, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CampaignPreviewFrame } from '@/components/CampaignPreviewFrame';
import type { ProcessedSlice } from '@/types/slice';

// Simple emoji list for quick access
const POPULAR_EMOJIS = [
  '🔥', '✨', '💫', '⭐', '🎉', '🚀', '💥', '🎯', '💪', '👀',
  '❤️', '💜', '💙', '💚', '🧡', '💛', '🖤', '🤍', '💖', '💕',
  '🛍️', '🎁', '💰', '🏷️', '📦', '✅', '🆕', '⚡', '🔔', '📣',
  '😍', '🤩', '😎', '🥳', '👏', '🙌', '💃', '🕺', '👋', '🤝',
];

interface LocationState {
  slices: ProcessedSlice[];
  footerHtml?: string;
  brandName?: string;
  brandDomain?: string;
  brandId?: string;
  klaviyoApiKey?: string;
  klaviyoLists?: Array<{ id: string; name: string }>;
  selectedListId?: string;
}

interface CopyPair {
  id: string;
  subjectLine: string;
  previewText: string;
  isFavorite: boolean;
  isEditingSL: boolean;
  isEditingPT: boolean;
}

interface SegmentPreset {
  id: string;
  name: string;
  included_segments: string[];
  excluded_segments: string[];
}

export default function CampaignSend() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as LocationState | null;

  const [slices, setSlices] = useState<ProcessedSlice[]>([]);
  const [footerHtml, setFooterHtml] = useState<string | undefined>();
  const [brandName, setBrandName] = useState<string>('');
  const [brandDomain, setBrandDomain] = useState<string>('');
  const [brandId, setBrandId] = useState<string>('');
  const [klaviyoApiKey, setKlaviyoApiKey] = useState<string>('');
  
  // Segment state
  const [klaviyoLists, setKlaviyoLists] = useState<Array<{ id: string; name: string }>>([]);
  const [includedSegments, setIncludedSegments] = useState<string[]>([]);
  const [excludedSegments, setExcludedSegments] = useState<string[]>([]);
  const [includeSearch, setIncludeSearch] = useState('');
  const [excludeSearch, setExcludeSearch] = useState('');
  
  // Presets
  const [presets, setPresets] = useState<SegmentPreset[]>([]);
  const [showSavePreset, setShowSavePreset] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [isSavingPreset, setIsSavingPreset] = useState(false);
  
  // Paired SL/PT state
  const [copyPairs, setCopyPairs] = useState<CopyPair[]>([]);
  const [selectedPairId, setSelectedPairId] = useState<string | null>(null);
  // For mix-and-match: override individual SL or PT from other pairs
  const [overrideSubjectId, setOverrideSubjectId] = useState<string | null>(null);
  const [overridePreviewId, setOverridePreviewId] = useState<string | null>(null);
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSending, setIsSending] = useState(false);
  
  // Emoji picker state
  const [emojiPickerOpenFor, setEmojiPickerOpenFor] = useState<{ pairId: string; field: 'sl' | 'pt' } | null>(null);
  
  // Success state
  const [campaignId, setCampaignId] = useState<string | null>(null);

  // Filter lists based on search
  const filteredIncludeLists = useMemo(() => {
    if (!includeSearch) return klaviyoLists.filter(l => !excludedSegments.includes(l.id));
    return klaviyoLists.filter(l => 
      !excludedSegments.includes(l.id) && 
      l.name.toLowerCase().includes(includeSearch.toLowerCase())
    );
  }, [klaviyoLists, includeSearch, excludedSegments]);

  const filteredExcludeLists = useMemo(() => {
    if (!excludeSearch) return klaviyoLists.filter(l => !includedSegments.includes(l.id));
    return klaviyoLists.filter(l => 
      !includedSegments.includes(l.id) && 
      l.name.toLowerCase().includes(excludeSearch.toLowerCase())
    );
  }, [klaviyoLists, excludeSearch, includedSegments]);

  // Get selected subject and preview (with overrides)
  const selectedSubject = useMemo(() => {
    if (overrideSubjectId) {
      const pair = copyPairs.find(p => p.id === overrideSubjectId);
      return pair?.subjectLine || '';
    }
    const pair = copyPairs.find(p => p.id === selectedPairId);
    return pair?.subjectLine || '';
  }, [copyPairs, selectedPairId, overrideSubjectId]);

  const selectedPreview = useMemo(() => {
    if (overridePreviewId) {
      const pair = copyPairs.find(p => p.id === overridePreviewId);
      return pair?.previewText || '';
    }
    const pair = copyPairs.find(p => p.id === selectedPairId);
    return pair?.previewText || '';
  }, [copyPairs, selectedPairId, overridePreviewId]);

  useEffect(() => {
    if (state) {
      setSlices(state.slices || []);
      setFooterHtml(state.footerHtml);
      setBrandName(state.brandName || '');
      setBrandDomain(state.brandDomain || '');
      setBrandId(state.brandId || '');
      setKlaviyoApiKey(state.klaviyoApiKey || '');
      setKlaviyoLists(state.klaviyoLists || []);
      
      if (state.selectedListId) {
        setIncludedSegments([state.selectedListId]);
      }
      
      // Load presets and generate pairs
      if (state.brandId) {
        loadPresets(state.brandId);
      }
      generateCopyPairs(state.slices, state.brandName || '');
    } else {
      navigate('/');
    }
  }, []);

  const loadPresets = async (bId: string) => {
    const { data } = await supabase
      .from('segment_presets')
      .select('*')
      .eq('brand_id', bId)
      .order('created_at', { ascending: false });
    
    if (data) {
      setPresets(data.map(p => ({
        id: p.id,
        name: p.name,
        included_segments: (p.included_segments as string[]) || [],
        excluded_segments: (p.excluded_segments as string[]) || [],
      })));
    }
  };

  // Extract URLs from slices
  const extractedUrls = slices
    .filter(s => s.link)
    .map(s => s.link as string);

  const generateCopyPairs = async (
    campaignSlices: ProcessedSlice[],
    brand: string,
    favoritePairs?: CopyPair[]
  ) => {
    setIsGenerating(true);
    try {
      const favorites = favoritePairs || [];
      const countNeeded = 10 - favorites.length;

      const { data, error } = await supabase.functions.invoke('generate-email-copy', {
        body: {
          slices: campaignSlices.map(s => ({ altText: s.altText, link: s.link })),
          brandContext: { name: brand, domain: brandDomain },
          existingFavorites: favorites.map(f => ({ subjectLine: f.subjectLine, previewText: f.previewText })),
          pairCount: countNeeded,
        }
      });

      if (error) throw error;

      const newPairs: CopyPair[] = [
        ...favorites,
        ...(data.pairs || []).map((pair: { subjectLine: string; previewText: string }, i: number) => ({
          id: `pair-${Date.now()}-${i}`,
          subjectLine: pair.subjectLine,
          previewText: pair.previewText,
          isFavorite: false,
          isEditingSL: false,
          isEditingPT: false,
        })),
      ];

      setCopyPairs(newPairs);
      
      if (!selectedPairId && newPairs.length > 0) {
        setSelectedPairId(newPairs[0].id);
      }
    } catch (err) {
      console.error('Error generating pairs:', err);
      toast.error('Failed to generate subject lines');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRefreshPairs = async () => {
    setIsRefreshing(true);
    const favorites = copyPairs.filter(p => p.isFavorite);
    await generateCopyPairs(slices, brandName, favorites);
    setIsRefreshing(false);
  };

  const toggleFavorite = (pairId: string) => {
    setCopyPairs(prev => prev.map(p => 
      p.id === pairId ? { ...p, isFavorite: !p.isFavorite } : p
    ));
  };

  const startEditing = (pairId: string, field: 'sl' | 'pt') => {
    setCopyPairs(prev => prev.map(p => 
      p.id === pairId 
        ? { ...p, isEditingSL: field === 'sl' ? true : p.isEditingSL, isEditingPT: field === 'pt' ? true : p.isEditingPT }
        : p
    ));
  };

  const updateText = (pairId: string, field: 'sl' | 'pt', text: string) => {
    setCopyPairs(prev => prev.map(p => 
      p.id === pairId 
        ? { ...p, subjectLine: field === 'sl' ? text : p.subjectLine, previewText: field === 'pt' ? text : p.previewText }
        : p
    ));
  };

  const stopEditing = (pairId: string, field: 'sl' | 'pt') => {
    setCopyPairs(prev => prev.map(p => 
      p.id === pairId 
        ? { ...p, isEditingSL: field === 'sl' ? false : p.isEditingSL, isEditingPT: field === 'pt' ? false : p.isEditingPT }
        : p
    ));
  };

  const addEmoji = (pairId: string, field: 'sl' | 'pt', emoji: string) => {
    setCopyPairs(prev => prev.map(p => 
      p.id === pairId 
        ? { 
            ...p, 
            subjectLine: field === 'sl' ? p.subjectLine + emoji : p.subjectLine, 
            previewText: field === 'pt' ? p.previewText + emoji : p.previewText 
          }
        : p
    ));
    setEmojiPickerOpenFor(null);
  };

  const toggleSegment = (type: 'include' | 'exclude', segmentId: string) => {
    if (type === 'include') {
      setIncludedSegments(prev => 
        prev.includes(segmentId) 
          ? prev.filter(id => id !== segmentId)
          : [...prev, segmentId]
      );
      setExcludedSegments(prev => prev.filter(id => id !== segmentId));
    } else {
      setExcludedSegments(prev => 
        prev.includes(segmentId) 
          ? prev.filter(id => id !== segmentId)
          : [...prev, segmentId]
      );
      setIncludedSegments(prev => prev.filter(id => id !== segmentId));
    }
  };

  const removeSegment = (type: 'include' | 'exclude', segmentId: string) => {
    if (type === 'include') {
      setIncludedSegments(prev => prev.filter(id => id !== segmentId));
    } else {
      setExcludedSegments(prev => prev.filter(id => id !== segmentId));
    }
  };

  const applyPreset = (preset: SegmentPreset) => {
    setIncludedSegments(preset.included_segments);
    setExcludedSegments(preset.excluded_segments);
    toast.success(`Applied "${preset.name}" preset`);
  };

  const savePreset = async () => {
    if (!presetName.trim() || !brandId) return;
    
    setIsSavingPreset(true);
    try {
      const { data, error } = await supabase
        .from('segment_presets')
        .insert({
          brand_id: brandId,
          name: presetName.trim(),
          included_segments: includedSegments,
          excluded_segments: excludedSegments,
        })
        .select()
        .single();

      if (error) throw error;

      setPresets(prev => [{
        id: data.id,
        name: data.name,
        included_segments: (data.included_segments as string[]) || [],
        excluded_segments: (data.excluded_segments as string[]) || [],
      }, ...prev]);
      
      setShowSavePreset(false);
      setPresetName('');
      toast.success('Preset saved');
    } catch (err) {
      toast.error('Failed to save preset');
    } finally {
      setIsSavingPreset(false);
    }
  };

  const deletePreset = async (presetId: string) => {
    try {
      await supabase.from('segment_presets').delete().eq('id', presetId);
      setPresets(prev => prev.filter(p => p.id !== presetId));
      toast.success('Preset deleted');
    } catch {
      toast.error('Failed to delete preset');
    }
  };

  const handleSendCampaign = async () => {
    if (!selectedSubject || !selectedPreview) {
      toast.error('Please select a subject line and preview text');
      return;
    }

    if (includedSegments.length === 0) {
      toast.error('Please select at least one segment to include');
      return;
    }

    if (!klaviyoApiKey) {
      toast.error('No Klaviyo API key configured');
      return;
    }

    setIsSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('push-to-klaviyo', {
        body: {
          slices,
          klaviyoApiKey,
          templateName: `Campaign ${new Date().toLocaleDateString()}`,
          footerHtml,
          mode: 'campaign',
          listId: includedSegments[0],
          includedSegments,
          excludedSegments,
          subjectLine: selectedSubject,
          previewText: selectedPreview,
        }
      });

      if (error) throw error;

      if (data.campaignId) {
        setCampaignId(data.campaignId);
        toast.success('Campaign created successfully!');
      } else if (data.templateId) {
        toast.warning('Template created but campaign failed');
      }
    } catch (err) {
      console.error('Error sending campaign:', err);
      toast.error('Failed to send campaign');
    } finally {
      setIsSending(false);
    }
  };

  const selectPair = (pairId: string) => {
    setSelectedPairId(pairId);
    setOverrideSubjectId(null);
    setOverridePreviewId(null);
  };

  const selectIndividualSL = (pairId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectedPairId) {
      setOverrideSubjectId(pairId === selectedPairId ? null : pairId);
    }
  };

  const selectIndividualPT = (pairId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectedPairId) {
      setOverridePreviewId(pairId === selectedPairId ? null : pairId);
    }
  };

  if (campaignId) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
            <Check className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-2xl font-semibold">Campaign Created!</h1>
          <p className="text-muted-foreground">Your campaign is ready to review in Klaviyo</p>
          <div className="flex items-center justify-center gap-3 pt-4">
            <Button
              onClick={() => window.open(`https://www.klaviyo.com/email-template-editor/campaign/${campaignId}/content/edit`, '_blank')}
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Open in Klaviyo
            </Button>
            <Button variant="outline" onClick={() => navigate('/')}>
              Done
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full flex flex-col bg-background">
      {/* Header */}
      <div className="h-14 px-6 flex items-center justify-between border-b border-border/40 flex-shrink-0">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/campaign/${id}`, { state })} className="text-muted-foreground">
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back to Editor
          </Button>
          <span className="text-sm font-medium">Send Campaign</span>
        </div>
        <Button 
          onClick={handleSendCampaign} 
          disabled={isSending || !selectedSubject || !selectedPreview || includedSegments.length === 0}
          className="px-6"
        >
          {isSending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
          Send Campaign
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left: Preview */}
        <div className="w-[360px] border-r border-border/40 flex-shrink-0 overflow-auto bg-muted/20">
          <div className="p-4">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Preview</h3>
            <div className="bg-background rounded-lg border border-border/40 overflow-hidden">
              <div className="transform scale-[0.45] origin-top-left" style={{ width: '222%' }}>
                <CampaignPreviewFrame slices={slices} footerHtml={footerHtml} width={600} />
              </div>
            </div>
            
            {extractedUrls.length > 0 && (
              <div className="mt-4">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Links</h3>
                <div className="space-y-1">
                  {extractedUrls.map((url, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1">
                      <LinkIcon className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{url}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Settings */}
        <ScrollArea className="flex-1">
          <div className="p-6 max-w-4xl mx-auto space-y-6">
            
            {/* Audience Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Audience</h3>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setShowSavePreset(true)}
                  disabled={includedSegments.length === 0 && excludedSegments.length === 0}
                  className="h-7 text-xs"
                >
                  <Save className="w-3 h-3 mr-1" />
                  Save Preset
                </Button>
              </div>

              {/* Presets row */}
              {presets.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {presets.map(preset => (
                    <div key={preset.id} className="group flex items-center">
                      <button
                        onClick={() => applyPreset(preset)}
                        className="px-3 py-1 text-xs rounded-l-md bg-muted hover:bg-muted/80 border border-r-0 border-border/50"
                      >
                        {preset.name}
                      </button>
                      <button
                        onClick={() => deletePreset(preset.id)}
                        className="px-1.5 py-1 text-xs rounded-r-md bg-muted hover:bg-destructive/10 hover:text-destructive border border-border/50 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Include/Exclude boxes */}
              <div className="grid grid-cols-2 gap-4">
                {/* Include Box */}
                <div className="border border-border/50 rounded-lg p-3">
                  <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-2">Include</label>
                  
                  {/* Selected chips */}
                  {includedSegments.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {includedSegments.map(segId => {
                        const list = klaviyoLists.find(l => l.id === segId);
                        return list ? (
                          <span 
                            key={segId} 
                            className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-primary/10 text-primary border border-primary/20"
                          >
                            {list.name}
                            <button onClick={() => removeSegment('include', segId)} className="hover:text-primary/70">
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ) : null;
                      })}
                    </div>
                  )}
                  
                  {/* Search input */}
                  <div className="relative mb-2">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      value={includeSearch}
                      onChange={(e) => setIncludeSearch(e.target.value)}
                      placeholder="Search segments..."
                      className="h-8 pl-7 text-xs"
                    />
                  </div>
                  
                  {/* List */}
                  <div className="max-h-32 overflow-auto space-y-0.5">
                    {filteredIncludeLists.map(list => (
                      <button
                        key={list.id}
                        onClick={() => toggleSegment('include', list.id)}
                        className={cn(
                          "w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left transition-colors",
                          includedSegments.includes(list.id)
                            ? "bg-primary/10 text-primary"
                            : "hover:bg-muted/50 text-muted-foreground"
                        )}
                      >
                        <div className={cn(
                          "w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0",
                          includedSegments.includes(list.id) ? "bg-primary border-primary" : "border-border"
                        )}>
                          {includedSegments.includes(list.id) && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                        </div>
                        <span className="truncate">{list.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Exclude Box */}
                <div className="border border-border/50 rounded-lg p-3">
                  <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-2">Exclude</label>
                  
                  {excludedSegments.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {excludedSegments.map(segId => {
                        const list = klaviyoLists.find(l => l.id === segId);
                        return list ? (
                          <span 
                            key={segId} 
                            className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-destructive/10 text-destructive border border-destructive/20"
                          >
                            {list.name}
                            <button onClick={() => removeSegment('exclude', segId)} className="hover:text-destructive/70">
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ) : null;
                      })}
                    </div>
                  )}
                  
                  <div className="relative mb-2">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      value={excludeSearch}
                      onChange={(e) => setExcludeSearch(e.target.value)}
                      placeholder="Search segments..."
                      className="h-8 pl-7 text-xs"
                    />
                  </div>
                  
                  <div className="max-h-32 overflow-auto space-y-0.5">
                    {filteredExcludeLists.map(list => (
                      <button
                        key={list.id}
                        onClick={() => toggleSegment('exclude', list.id)}
                        className={cn(
                          "w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left transition-colors",
                          excludedSegments.includes(list.id)
                            ? "bg-destructive/10 text-destructive"
                            : "hover:bg-muted/50 text-muted-foreground"
                        )}
                      >
                        <div className={cn(
                          "w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0",
                          excludedSegments.includes(list.id) ? "bg-destructive border-destructive" : "border-border"
                        )}>
                          {excludedSegments.includes(list.id) && <Check className="w-2.5 h-2.5 text-destructive-foreground" />}
                        </div>
                        <span className="truncate">{list.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* SL/PT Pairs Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Subject Line & Preview Text</h3>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={handleRefreshPairs}
                  disabled={isRefreshing || isGenerating}
                  className="h-7 text-xs"
                >
                  <RefreshCw className={cn("w-3 h-3 mr-1", isRefreshing && "animate-spin")} />
                  Refresh
                </Button>
              </div>

              {/* Current selection summary */}
              {selectedSubject && (
                <div className="p-3 rounded-lg bg-muted/30 border border-border/30 text-sm">
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <span className="text-xs text-muted-foreground uppercase tracking-wider">Subject</span>
                      <p className="mt-0.5 font-medium">{selectedSubject}</p>
                    </div>
                    <div className="flex-1">
                      <span className="text-xs text-muted-foreground uppercase tracking-wider">Preview</span>
                      <p className="mt-0.5">{selectedPreview}</p>
                    </div>
                  </div>
                </div>
              )}

              {isGenerating ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-2">
                  {copyPairs.map(pair => (
                    <PairCard
                      key={pair.id}
                      pair={pair}
                      isSelected={selectedPairId === pair.id}
                      slOverride={overrideSubjectId === pair.id}
                      ptOverride={overridePreviewId === pair.id}
                      onSelect={() => selectPair(pair.id)}
                      onSelectSL={(e) => selectIndividualSL(pair.id, e)}
                      onSelectPT={(e) => selectIndividualPT(pair.id, e)}
                      onToggleFavorite={() => toggleFavorite(pair.id)}
                      onStartEdit={(field) => startEditing(pair.id, field)}
                      onUpdateText={(field, text) => updateText(pair.id, field, text)}
                      onStopEdit={(field) => stopEditing(pair.id, field)}
                      onAddEmoji={(field, emoji) => addEmoji(pair.id, field, emoji)}
                      emojiPickerOpen={emojiPickerOpenFor?.pairId === pair.id ? emojiPickerOpenFor.field : null}
                      onEmojiPickerToggle={(field) => setEmojiPickerOpenFor(
                        emojiPickerOpenFor?.pairId === pair.id && emojiPickerOpenFor.field === field
                          ? null 
                          : { pairId: pair.id, field }
                      )}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </div>

      {/* Save Preset Modal */}
      <Dialog open={showSavePreset} onOpenChange={setShowSavePreset}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save Preset</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="Preset name..."
              autoFocus
            />
            <div className="mt-3 text-xs text-muted-foreground">
              <p>Include: {includedSegments.length} segment(s)</p>
              <p>Exclude: {excludedSegments.length} segment(s)</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSavePreset(false)}>Cancel</Button>
            <Button onClick={savePreset} disabled={!presetName.trim() || isSavingPreset}>
              {isSavingPreset ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Pair Card Component
interface PairCardProps {
  pair: CopyPair;
  isSelected: boolean;
  slOverride: boolean;
  ptOverride: boolean;
  onSelect: () => void;
  onSelectSL: (e: React.MouseEvent) => void;
  onSelectPT: (e: React.MouseEvent) => void;
  onToggleFavorite: () => void;
  onStartEdit: (field: 'sl' | 'pt') => void;
  onUpdateText: (field: 'sl' | 'pt', text: string) => void;
  onStopEdit: (field: 'sl' | 'pt') => void;
  onAddEmoji: (field: 'sl' | 'pt', emoji: string) => void;
  emojiPickerOpen: 'sl' | 'pt' | null;
  onEmojiPickerToggle: (field: 'sl' | 'pt') => void;
}

function PairCard({
  pair,
  isSelected,
  slOverride,
  ptOverride,
  onSelect,
  onSelectSL,
  onSelectPT,
  onToggleFavorite,
  onStartEdit,
  onUpdateText,
  onStopEdit,
  onAddEmoji,
  emojiPickerOpen,
  onEmojiPickerToggle,
}: PairCardProps) {
  return (
    <div
      className={cn(
        "relative flex rounded-lg border transition-all cursor-pointer group",
        isSelected
          ? "border-primary bg-primary/5"
          : "border-border/40 hover:border-border"
      )}
      onClick={onSelect}
    >
      {/* Selection indicator */}
      {isSelected && (
        <div className="absolute -left-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
          <Check className="w-2.5 h-2.5 text-primary-foreground" />
        </div>
      )}

      {/* Favorite indicator */}
      {pair.isFavorite && (
        <Heart className="absolute top-2 left-2 w-3 h-3 text-red-500 fill-current" />
      )}

      {/* Subject Line (left) */}
      <div 
        className={cn(
          "flex-1 p-3 border-r border-border/30",
          slOverride && "ring-2 ring-primary ring-inset"
        )}
        onClick={onSelectSL}
      >
        {pair.isEditingSL ? (
          <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
            <Input
              value={pair.subjectLine}
              onChange={(e) => onUpdateText('sl', e.target.value)}
              onBlur={() => onStopEdit('sl')}
              onKeyDown={(e) => e.key === 'Enter' && onStopEdit('sl')}
              autoFocus
              className="text-sm h-8"
            />
            <Popover open={emojiPickerOpen === 'sl'} onOpenChange={() => onEmojiPickerToggle('sl')}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 px-2">
                  <Smile className="w-3 h-3" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-2" align="start">
                <div className="grid grid-cols-10 gap-1">
                  {POPULAR_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => onAddEmoji('sl', emoji)}
                      className="w-6 h-6 flex items-center justify-center hover:bg-muted rounded text-base"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        ) : (
          <p className="text-sm font-medium leading-snug">{pair.subjectLine}</p>
        )}
      </div>

      {/* Preview Text (right) */}
      <div 
        className={cn(
          "flex-1 p-3",
          ptOverride && "ring-2 ring-primary ring-inset"
        )}
        onClick={onSelectPT}
      >
        {pair.isEditingPT ? (
          <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
            <Input
              value={pair.previewText}
              onChange={(e) => onUpdateText('pt', e.target.value)}
              onBlur={() => onStopEdit('pt')}
              onKeyDown={(e) => e.key === 'Enter' && onStopEdit('pt')}
              autoFocus
              className="text-sm h-8"
            />
            <Popover open={emojiPickerOpen === 'pt'} onOpenChange={() => onEmojiPickerToggle('pt')}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 px-2">
                  <Smile className="w-3 h-3" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-2" align="start">
                <div className="grid grid-cols-10 gap-1">
                  {POPULAR_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => onAddEmoji('pt', emoji)}
                      className="w-6 h-6 flex items-center justify-center hover:bg-muted rounded text-base"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground leading-snug">{pair.previewText}</p>
        )}
      </div>

      {/* Actions on hover */}
      {!pair.isEditingSL && !pair.isEditingPT && (
        <div className="absolute top-1/2 -translate-y-1/2 right-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); onStartEdit('sl'); }}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
            title="Edit subject"
          >
            <Pencil className="w-3 h-3" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
            className={cn(
              "p-1 rounded transition-colors",
              pair.isFavorite 
                ? "text-red-500 hover:text-red-600" 
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            <Heart className={cn("w-3 h-3", pair.isFavorite && "fill-current")} />
          </button>
        </div>
      )}
    </div>
  );
}
