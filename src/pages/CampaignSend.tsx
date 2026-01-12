import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ChevronLeft, Send, RefreshCw, Heart, Check, Loader2, ExternalLink, Smile, Link as LinkIcon, Plus, X, Search, Save, Trash2, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CampaignPreviewFrame } from '@/components/CampaignPreviewFrame';
import { InboxPreview } from '@/components/InboxPreview';
import type { ProcessedSlice } from '@/types/slice';
import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';

interface LocationState {
  slices: ProcessedSlice[];
  footerHtml?: string;
  brandName?: string;
  brandDomain?: string;
  brandId?: string;
  brandLogo?: string; // Brand logo for inbox preview
  klaviyoApiKey?: string;
  klaviyoLists?: Array<{ id: string; name: string }>;
  selectedListId?: string;
  earlyGenerationSessionKey?: string; // Session key for early SL/PT lookup
}

interface CopyItem {
  id: string;
  text: string;
  isFavorite: boolean;
  isEditing: boolean;
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
  const [brandLogo, setBrandLogo] = useState<string>('');
  const [klaviyoApiKey, setKlaviyoApiKey] = useState<string>('');
  
  // Segment state
  const [klaviyoLists, setKlaviyoLists] = useState<Array<{ id: string; name: string }>>([]);
  const [includedSegments, setIncludedSegments] = useState<string[]>([]);
  const [excludedSegments, setExcludedSegments] = useState<string[]>([]);
  const [includeSearch, setIncludeSearch] = useState('');
  const [excludeSearch, setExcludeSearch] = useState('');
  const [includePopoverOpen, setIncludePopoverOpen] = useState(false);
  const [excludePopoverOpen, setExcludePopoverOpen] = useState(false);
  
  // Presets
  const [presets, setPresets] = useState<SegmentPreset[]>([]);
  const [showSavePreset, setShowSavePreset] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [isSavingPreset, setIsSavingPreset] = useState(false);
  
  // SEPARATE SL and PT lists
  const [subjectLines, setSubjectLines] = useState<CopyItem[]>([]);
  const [previewTexts, setPreviewTexts] = useState<CopyItem[]>([]);
  const [selectedSLId, setSelectedSLId] = useState<string | null>(null);
  const [selectedPTId, setSelectedPTId] = useState<string | null>(null);
  
  // Spelling QA
  const [spellingErrors, setSpellingErrors] = useState<string[]>([]);
  
  // Chat refinement
  const [refinementPrompt, setRefinementPrompt] = useState('');
  const [lastRefinement, setLastRefinement] = useState<string | null>(null);
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSending, setIsSending] = useState(false);
  
  // Emoji picker state - track which item and which type
  const [emojiPickerOpenFor, setEmojiPickerOpenFor] = useState<{ itemId: string; type: 'sl' | 'pt' } | null>(null);
  
  // Success state
  const [campaignId, setCampaignId] = useState<string | null>(null);

  // Filter lists based on search
  const filteredIncludeLists = useMemo(() => {
    const available = klaviyoLists.filter(l => !includedSegments.includes(l.id) && !excludedSegments.includes(l.id));
    if (!includeSearch) return available;
    return available.filter(l => l.name.toLowerCase().includes(includeSearch.toLowerCase()));
  }, [klaviyoLists, includeSearch, includedSegments, excludedSegments]);

  const filteredExcludeLists = useMemo(() => {
    const available = klaviyoLists.filter(l => !includedSegments.includes(l.id) && !excludedSegments.includes(l.id));
    if (!excludeSearch) return available;
    return available.filter(l => l.name.toLowerCase().includes(excludeSearch.toLowerCase()));
  }, [klaviyoLists, excludeSearch, includedSegments, excludedSegments]);

  // Get selected texts
  const selectedSubject = useMemo(() => {
    const item = subjectLines.find(s => s.id === selectedSLId);
    return item?.text || '';
  }, [subjectLines, selectedSLId]);

  const selectedPreview = useMemo(() => {
    const item = previewTexts.find(p => p.id === selectedPTId);
    return item?.text || '';
  }, [previewTexts, selectedPTId]);

  // Check for pre-generated copy from background task (campaigns table)
  const checkPreGeneratedCopy = async (campaignId: string): Promise<{ subjectLines: string[]; previewTexts: string[] } | null> => {
    const { data } = await supabase
      .from('campaigns')
      .select('generated_copy')
      .eq('id', campaignId)
      .single();
    
    const copy = data?.generated_copy as { subjectLines: string[]; previewTexts: string[]; generatedAt: string } | null;
    if (copy?.subjectLines?.length > 0) {
      return { subjectLines: copy.subjectLines, previewTexts: copy.previewTexts };
    }
    return null;
  };

  // Check for EARLY generated copy (from immediate upload trigger)
  const checkEarlyGeneratedCopy = async (sessionKey: string): Promise<{ subjectLines: string[]; previewTexts: string[]; spellingErrors: string[] } | null> => {
    console.log('[EARLY] Checking for early generated copy, session:', sessionKey);
    const { data, error } = await supabase
      .from('early_generated_copy')
      .select('subject_lines, preview_texts, spelling_errors')
      .eq('session_key', sessionKey)
      .single();
    
    if (error) {
      console.log('[EARLY] No early copy found:', error.message);
      return null;
    }
    
    const subjectLines = data?.subject_lines as string[] | null;
    const previewTexts = data?.preview_texts as string[] | null;
    const spellingErrorsData = data?.spelling_errors as string[] | null;
    
    if (subjectLines?.length > 0) {
      console.log(`[EARLY] Found early copy: ${subjectLines.length} SLs, ${previewTexts?.length || 0} PTs, ${spellingErrorsData?.length || 0} spelling errors`);
      return { subjectLines, previewTexts: previewTexts || [], spellingErrors: spellingErrorsData || [] };
    }
    return null;
  };

  // Poll for early copy with retries (it may still be generating)
  const pollForEarlyCopy = async (sessionKey: string, maxAttempts = 8): Promise<{ subjectLines: string[]; previewTexts: string[]; spellingErrors: string[] } | null> => {
    for (let i = 0; i < maxAttempts; i++) {
      const earlyCopy = await checkEarlyGeneratedCopy(sessionKey);
      if (earlyCopy?.subjectLines?.length > 0) {
        return earlyCopy;
      }
      // Wait 2s between polls
      await new Promise(r => setTimeout(r, 2000));
    }
    return null; // Give up after ~16 seconds
  };

  // Poll for pre-generated copy with retries
  const pollForCopy = async (campaignId: string, maxAttempts = 10): Promise<{ subjectLines: string[]; previewTexts: string[] } | null> => {
    for (let i = 0; i < maxAttempts; i++) {
      const preCopy = await checkPreGeneratedCopy(campaignId);
      if (preCopy?.subjectLines?.length > 0) {
        return preCopy;
      }
      // Wait 1.5s between polls
      await new Promise(r => setTimeout(r, 1500));
    }
    return null; // Give up after ~15 seconds
  };

  useEffect(() => {
    if (state) {
      setSlices(state.slices || []);
      setFooterHtml(state.footerHtml);
      setBrandName(state.brandName || '');
      setBrandDomain(state.brandDomain || '');
      setBrandId(state.brandId || '');
      setBrandLogo(state.brandLogo || '');
      setKlaviyoApiKey(state.klaviyoApiKey || '');
      setKlaviyoLists(state.klaviyoLists || []);
      
      if (state.selectedListId) {
        setIncludedSegments([state.selectedListId]);
      }
      
      if (state.brandId) {
        loadPresets(state.brandId);
      }
      
      // PRIORITY 1: Check for EARLY generated copy (started on image drop)
      const loadCopy = async () => {
        const earlySessionKey = state.earlyGenerationSessionKey;
        
        // First priority: Check early generation (started immediately on image drop)
        if (earlySessionKey) {
          console.log('[EARLY] Checking early copy first, session:', earlySessionKey);
          
          // Immediate check
          const earlyCopy = await checkEarlyGeneratedCopy(earlySessionKey);
          if (earlyCopy && earlyCopy.subjectLines.length > 0) {
            console.log('[EARLY] Using early-generated copy (immediate)');
            applyPreGeneratedCopy(earlyCopy);
            return;
          }
          
          // Poll for a bit - it may still be generating
          setIsGenerating(true);
          console.log('[EARLY] Polling for early-generated copy...');
          const polledEarlyCopy = await pollForEarlyCopy(earlySessionKey);
          
          if (polledEarlyCopy && polledEarlyCopy.subjectLines.length > 0) {
            console.log('[EARLY] Using early-generated copy (polled)');
            applyPreGeneratedCopy(polledEarlyCopy);
            setIsGenerating(false);
            return;
          }
          
          console.log('[EARLY] No early copy found, falling back to campaign copy...');
        }
        
        // Second priority: Check campaign's generated_copy (from background task)
        if (id) {
          const immediateCopy = await checkPreGeneratedCopy(id);
          if (immediateCopy && immediateCopy.subjectLines.length > 0) {
            console.log('Using pre-generated subject lines (immediate)');
            applyPreGeneratedCopy(immediateCopy);
            setIsGenerating(false);
            return;
          }
          
          // Not ready yet - show loading and poll
          if (!isGenerating) setIsGenerating(true);
          console.log('Polling for background-generated copy...');
          const polledCopy = await pollForCopy(id);
          
          if (polledCopy && polledCopy.subjectLines.length > 0) {
            console.log('Using pre-generated subject lines (polled)');
            applyPreGeneratedCopy(polledCopy);
            setIsGenerating(false);
            return;
          }
          
          // Fall back to generating on-demand
          console.log('No pre-generated copy after polling, generating on-demand');
          const examples = state.brandId ? await fetchCopyExamples(state.brandId) : undefined;
          await generateCopy(state.slices, state.brandName || '', undefined, state.brandDomain, examples);
        } else {
          // No campaign ID, generate on-demand
          const examples = state.brandId ? await fetchCopyExamples(state.brandId) : undefined;
          await generateCopy(state.slices, state.brandName || '', undefined, state.brandDomain, examples);
        }
      };

      const applyPreGeneratedCopy = (preCopy: { subjectLines: string[]; previewTexts: string[]; spellingErrors?: string[] }) => {
        const newSLs = preCopy.subjectLines.map((text, i) => ({
          id: `sl-pre-${i}`,
          text,
          isFavorite: false,
          isEditing: false,
        }));
        const newPTs = preCopy.previewTexts.map((text, i) => ({
          id: `pt-pre-${i}`,
          text,
          isFavorite: false,
          isEditing: false,
        }));
        setSubjectLines(newSLs);
        setPreviewTexts(newPTs);
        setSelectedSLId(newSLs[0]?.id || null);
        setSelectedPTId(newPTs[0]?.id || null);
        setSpellingErrors(preCopy.spellingErrors || []);
      };

      loadCopy();
    } else {
      navigate('/');
    }
  }, []);

  const fetchCopyExamples = async (bId: string) => {
    const { data } = await supabase
      .from('brands')
      .select('copy_examples')
      .eq('id', bId)
      .single();
    
    if (data?.copy_examples) {
      return data.copy_examples as { subjectLines: string[]; previewTexts: string[] };
    }
    return undefined;
  };

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

  const extractedUrls = slices
    .filter(s => s.link)
    .map(s => s.link as string);

  // Helper to extract domain from URLs
  const extractDomainFromSlices = (slicesData: ProcessedSlice[]): string => {
    for (const slice of slicesData) {
      if (slice.link) {
        try {
          const url = new URL(slice.link);
          return url.hostname.replace(/^www\./, '');
        } catch { /* ignore */ }
      }
    }
    return '';
  };

  const generateCopy = async (
    campaignSlices: ProcessedSlice[],
    brand: string,
    prompt?: string,
    domain?: string,
    copyExamples?: { subjectLines: string[]; previewTexts: string[] }
  ) => {
    setIsGenerating(true);
    try {
      // Keep favorited items
      const favoriteSLs = subjectLines.filter(s => s.isFavorite);
      const favoritePTs = previewTexts.filter(p => p.isFavorite);
      const countNeeded = 10 - Math.max(favoriteSLs.length, favoritePTs.length);

      // Ensure we have a domain - use passed domain, state, or extract from slice URLs
      const effectiveDomain = domain || brandDomain || extractDomainFromSlices(campaignSlices);

      const { data, error } = await supabase.functions.invoke('generate-email-copy', {
        body: {
          slices: campaignSlices.map(s => ({ 
            altText: s.altText, 
            link: s.link,
            imageUrl: s.imageUrl // Pass image URL for vision analysis
          })),
          brandContext: { name: brand, domain: effectiveDomain },
          existingFavorites: {
            subjectLines: favoriteSLs.map(s => s.text),
            previewTexts: favoritePTs.map(p => p.text),
          },
          pairCount: countNeeded,
          refinementPrompt: prompt,
          copyExamples: copyExamples,
        }
      });

      if (error) {
        if (error.message?.includes('429') || error.message?.includes('Rate limit')) {
          toast.error('Rate limit reached. Please wait a moment and try again.');
        } else {
          throw error;
        }
        return;
      }

      // Build new SL list
      const newSLs: CopyItem[] = [
        ...favoriteSLs,
        ...(data.subjectLines || []).map((text: string, i: number) => ({
          id: `sl-${Date.now()}-${i}`,
          text,
          isFavorite: false,
          isEditing: false,
        })),
      ];

      // Build new PT list
      const newPTs: CopyItem[] = [
        ...favoritePTs,
        ...(data.previewTexts || []).map((text: string, i: number) => ({
          id: `pt-${Date.now()}-${i}`,
          text,
          isFavorite: false,
          isEditing: false,
        })),
      ];

      setSubjectLines(newSLs);
      setPreviewTexts(newPTs);
      
      // Set spelling errors from response
      if (data.spellingErrors) {
        setSpellingErrors(data.spellingErrors);
      }
      
      // Auto-select first if nothing selected
      if (!selectedSLId && newSLs.length > 0) {
        setSelectedSLId(newSLs[0].id);
      }
      if (!selectedPTId && newPTs.length > 0) {
        setSelectedPTId(newPTs[0].id);
      }

      if (prompt) {
        setLastRefinement(prompt);
        setRefinementPrompt('');
      }
    } catch (err) {
      console.error('Error generating copy:', err);
      toast.error('Failed to generate subject lines. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    const examples = brandId ? await fetchCopyExamples(brandId) : undefined;
    await generateCopy(slices, brandName, refinementPrompt || undefined, brandDomain, examples);
    setIsRefreshing(false);
  };

  const toggleFavorite = (type: 'sl' | 'pt', itemId: string) => {
    if (type === 'sl') {
      setSubjectLines(prev => prev.map(s => 
        s.id === itemId ? { ...s, isFavorite: !s.isFavorite } : s
      ));
    } else {
      setPreviewTexts(prev => prev.map(p => 
        p.id === itemId ? { ...p, isFavorite: !p.isFavorite } : p
      ));
    }
  };

  const startEditing = (type: 'sl' | 'pt', itemId: string) => {
    if (type === 'sl') {
      setSubjectLines(prev => prev.map(s => 
        s.id === itemId ? { ...s, isEditing: true } : s
      ));
    } else {
      setPreviewTexts(prev => prev.map(p => 
        p.id === itemId ? { ...p, isEditing: true } : p
      ));
    }
  };

  const updateText = (type: 'sl' | 'pt', itemId: string, text: string) => {
    if (type === 'sl') {
      setSubjectLines(prev => prev.map(s => 
        s.id === itemId ? { ...s, text } : s
      ));
    } else {
      setPreviewTexts(prev => prev.map(p => 
        p.id === itemId ? { ...p, text } : p
      ));
    }
  };

  const stopEditing = (type: 'sl' | 'pt', itemId: string) => {
    if (type === 'sl') {
      setSubjectLines(prev => prev.map(s => 
        s.id === itemId ? { ...s, isEditing: false } : s
      ));
    } else {
      setPreviewTexts(prev => prev.map(p => 
        p.id === itemId ? { ...p, isEditing: false } : p
      ));
    }
    setEmojiPickerOpenFor(null);
  };

  const addEmoji = (type: 'sl' | 'pt', itemId: string, emoji: string) => {
    if (type === 'sl') {
      setSubjectLines(prev => prev.map(s => 
        s.id === itemId ? { ...s, text: s.text + emoji } : s
      ));
    } else {
      setPreviewTexts(prev => prev.map(p => 
        p.id === itemId ? { ...p, text: p.text + emoji } : p
      ));
    }
    setEmojiPickerOpenFor(null);
  };

  const selectItem = (type: 'sl' | 'pt', itemId: string) => {
    if (type === 'sl') {
      setSelectedSLId(prev => prev === itemId ? null : itemId);
    } else {
      setSelectedPTId(prev => prev === itemId ? null : itemId);
    }
  };

  const addSegment = (type: 'include' | 'exclude', segmentId: string) => {
    if (type === 'include') {
      setIncludedSegments(prev => [...prev, segmentId]);
    } else {
      setExcludedSegments(prev => [...prev, segmentId]);
    }
    setIncludeSearch('');
    setExcludeSearch('');
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
            <div 
              className="bg-background rounded-lg border border-border/40"
              style={{ width: '270px' }}
            >
              <div 
                className="origin-top-left" 
                style={{ transform: 'scale(0.45)', width: '600px' }}
              >
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
                <div className="border border-border/50 rounded-lg p-3 min-h-[80px]">
                  <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-2">Include</label>
                  
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
                  
                  <Popover open={includePopoverOpen} onOpenChange={setIncludePopoverOpen}>
                    <PopoverTrigger asChild>
                      <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                        <Plus className="w-3.5 h-3.5" />
                        Add segment
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 p-2" align="start">
                      <div className="relative mb-2">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                        <Input
                          value={includeSearch}
                          onChange={(e) => setIncludeSearch(e.target.value)}
                          placeholder="Search segments..."
                          className="h-8 pl-7 text-xs"
                          autoFocus
                        />
                      </div>
                      <ScrollArea className="h-72">
                        <div className="space-y-0.5 pr-3">
                          {filteredIncludeLists.length === 0 ? (
                            <p className="text-xs text-muted-foreground py-2 text-center">No segments available</p>
                          ) : (
                            filteredIncludeLists.map(list => (
                              <button
                                key={list.id}
                                onClick={() => {
                                  addSegment('include', list.id);
                                  setIncludePopoverOpen(false);
                                }}
                                className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left hover:bg-muted/80 text-foreground transition-colors"
                              >
                                {list.name}
                              </button>
                            ))
                          )}
                        </div>
                      </ScrollArea>
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Exclude Box */}
                <div className="border border-border/50 rounded-lg p-3 min-h-[80px]">
                  <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-2">Exclude</label>
                  
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
                  
                  <Popover open={excludePopoverOpen} onOpenChange={setExcludePopoverOpen}>
                    <PopoverTrigger asChild>
                      <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                        <Plus className="w-3.5 h-3.5" />
                        Add segment
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 p-2" align="start">
                      <div className="relative mb-2">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                        <Input
                          value={excludeSearch}
                          onChange={(e) => setExcludeSearch(e.target.value)}
                          placeholder="Search segments..."
                          className="h-8 pl-7 text-xs"
                          autoFocus
                        />
                      </div>
                      <ScrollArea className="h-72">
                        <div className="space-y-0.5 pr-3">
                          {filteredExcludeLists.length === 0 ? (
                            <p className="text-xs text-muted-foreground py-2 text-center">No segments available</p>
                          ) : (
                            filteredExcludeLists.map(list => (
                              <button
                                key={list.id}
                                onClick={() => {
                                  addSegment('exclude', list.id);
                                  setExcludePopoverOpen(false);
                                }}
                                className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left hover:bg-muted/80 text-foreground transition-colors"
                              >
                                {list.name}
                              </button>
                            ))
                          )}
                        </div>
                      </ScrollArea>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </div>

            {/* SL/PT Section - Two Columns */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium">Subject Line & Preview Text</h3>

              {/* Gmail-style Inbox Preview */}
              <InboxPreview
                brandName={brandName}
                brandLogo={brandLogo}
                subjectLine={selectedSubject}
                previewText={selectedPreview}
                onSubjectLineChange={(text) => {
                  // Update the selected subject line's text
                  if (selectedSLId) {
                    setSubjectLines(prev => prev.map(s => 
                      s.id === selectedSLId ? { ...s, text } : s
                    ));
                  }
                }}
                onPreviewTextChange={(text) => {
                  // Update the selected preview text's text
                  if (selectedPTId) {
                    setPreviewTexts(prev => prev.map(p => 
                      p.id === selectedPTId ? { ...p, text } : p
                    ));
                  }
                }}
              />

              {/* QA Section */}
              <div className="border border-border/50 rounded-lg p-3">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">QA Check</h4>
                
                {spellingErrors.length === 0 ? (
                  <div className="flex items-center gap-2 text-sm text-green-600">
                    <Check className="w-4 h-4" />
                    <span>No spelling errors detected</span>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {spellingErrors.map((error, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm text-amber-600">
                        <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <span>{error}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Chat refinement input */}
              <div className="flex gap-2">
                <Input
                  value={refinementPrompt}
                  onChange={(e) => setRefinementPrompt(e.target.value)}
                  placeholder="e.g., 'Make them more playful' or 'Focus on the discount'"
                  className="flex-1 text-sm"
                  onKeyDown={(e) => e.key === 'Enter' && !isRefreshing && handleRefresh()}
                />
                <Button 
                  onClick={handleRefresh}
                  disabled={isRefreshing || isGenerating}
                  size="sm"
                  className="px-4"
                >
                  <RefreshCw className={cn("w-4 h-4 mr-1.5", isRefreshing && "animate-spin")} />
                  {isRefreshing ? 'Generating...' : 'Refresh'}
                </Button>
              </div>

              {lastRefinement && (
                <p className="text-xs text-muted-foreground">
                  Last request: "{lastRefinement}"
                </p>
              )}

              {isGenerating ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  {/* Subject Lines Column */}
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground uppercase tracking-wider block">Subject Lines</label>
                    {subjectLines.map(item => (
                      <CopyItemCard
                        key={item.id}
                        item={item}
                        type="sl"
                        isSelected={selectedSLId === item.id}
                        onSelect={() => selectItem('sl', item.id)}
                        onToggleFavorite={() => toggleFavorite('sl', item.id)}
                        onStartEdit={() => startEditing('sl', item.id)}
                        onUpdateText={(text) => updateText('sl', item.id, text)}
                        onStopEdit={() => stopEditing('sl', item.id)}
                        onAddEmoji={(emoji) => addEmoji('sl', item.id, emoji)}
                        emojiPickerOpen={emojiPickerOpenFor?.itemId === item.id && emojiPickerOpenFor.type === 'sl'}
                        onEmojiPickerToggle={(open) => setEmojiPickerOpenFor(open ? { itemId: item.id, type: 'sl' } : null)}
                      />
                    ))}
                  </div>

                  {/* Preview Texts Column */}
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground uppercase tracking-wider block">Preview Texts</label>
                    {previewTexts.map(item => (
                      <CopyItemCard
                        key={item.id}
                        item={item}
                        type="pt"
                        isSelected={selectedPTId === item.id}
                        onSelect={() => selectItem('pt', item.id)}
                        onToggleFavorite={() => toggleFavorite('pt', item.id)}
                        onStartEdit={() => startEditing('pt', item.id)}
                        onUpdateText={(text) => updateText('pt', item.id, text)}
                        onStopEdit={() => stopEditing('pt', item.id)}
                        onAddEmoji={(emoji) => addEmoji('pt', item.id, emoji)}
                        emojiPickerOpen={emojiPickerOpenFor?.itemId === item.id && emojiPickerOpenFor.type === 'pt'}
                        onEmojiPickerToggle={(open) => setEmojiPickerOpenFor(open ? { itemId: item.id, type: 'pt' } : null)}
                      />
                    ))}
                  </div>
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

// Individual Copy Item Card Component
interface CopyItemCardProps {
  item: CopyItem;
  type: 'sl' | 'pt';
  isSelected: boolean;
  onSelect: () => void;
  onToggleFavorite: () => void;
  onStartEdit: () => void;
  onUpdateText: (text: string) => void;
  onStopEdit: () => void;
  onAddEmoji: (emoji: string) => void;
  emojiPickerOpen: boolean;
  onEmojiPickerToggle: (open: boolean) => void;
}

function CopyItemCard({
  item,
  type,
  isSelected,
  onSelect,
  onToggleFavorite,
  onStartEdit,
  onUpdateText,
  onStopEdit,
  onAddEmoji,
  emojiPickerOpen,
  onEmojiPickerToggle,
}: CopyItemCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const emojiOpenRef = useRef(emojiPickerOpen);

  useEffect(() => {
    emojiOpenRef.current = emojiPickerOpen;
  }, [emojiPickerOpen]);

  return (
    <div
      className={cn(
        "relative flex items-center gap-2 p-2 rounded-md border transition-all cursor-pointer group",
        isSelected
          ? "border-primary bg-primary/5"
          : "border-border/30 hover:border-border/60"
      )}
      onClick={() => {
        if (!item.isEditing) onSelect();
      }}
    >
      {/* Selection indicator */}
      {isSelected && (
        <div className="absolute -left-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
          <Check className="w-2.5 h-2.5 text-primary-foreground" />
        </div>
      )}

      {/* Favorite button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite();
        }}
        className={cn(
          "flex-shrink-0 p-0.5 rounded transition-colors",
          item.isFavorite
            ? "text-red-500"
            : "text-muted-foreground/30 hover:text-red-400 opacity-0 group-hover:opacity-100"
        )}
        title={item.isFavorite ? "Remove from favorites" : "Add to favorites"}
      >
        <Heart className={cn("w-3 h-3", item.isFavorite && "fill-current")} />
      </button>

      {/* Text content - click to edit */}
      <div
        className="flex-1 min-w-0"
        onClick={(e) => {
          e.stopPropagation();
          if (!item.isEditing) onStartEdit();
        }}
      >
        {item.isEditing ? (
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <Input
              ref={inputRef}
              value={item.text}
              onChange={(e) => onUpdateText(e.target.value)}
              onBlur={() => {
                // Delay close so clicking the emoji trigger doesn't immediately end editing
                window.setTimeout(() => {
                  if (emojiOpenRef.current) return;
                  onStopEdit();
                }, 75);
              }}
              onKeyDown={(e) => e.key === 'Enter' && onStopEdit()}
              autoFocus
              className="text-sm h-8 pr-8"
            />
            <Popover open={emojiPickerOpen} onOpenChange={onEmojiPickerToggle}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                  data-emoji-trigger
                  onMouseDown={(e) => e.preventDefault()}
                  aria-label="Add emoji"
                >
                  <Smile className="w-3.5 h-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                className="w-[352px] p-0 z-50"
                align="end"
                side="bottom"
                sideOffset={8}
                onClick={(e) => e.stopPropagation()}
              >
                <Picker
                  data={data}
                  onEmojiSelect={(emoji: { native: string }) => {
                    onAddEmoji(emoji.native);
                    requestAnimationFrame(() => inputRef.current?.focus());
                  }}
                  theme="light"
                  previewPosition="none"
                  skinTonePosition="search"
                  maxFrequentRows={2}
                  perLine={9}
                />
              </PopoverContent>
            </Popover>
          </div>
        ) : (
          <p
            className={cn(
              "text-xs leading-snug truncate",
              type === 'sl' ? "font-medium text-foreground" : "text-muted-foreground"
            )}
            title={item.text}
          >
            {item.text}
          </p>
        )}
      </div>
    </div>
  );
}
