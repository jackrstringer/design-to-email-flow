import { useState, useEffect } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChevronLeft, Send, RefreshCw, Heart, Check, Pencil, Loader2, ExternalLink, Smile, Link as LinkIcon } from 'lucide-react';
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
  klaviyoApiKey?: string;
  klaviyoLists?: Array<{ id: string; name: string }>;
  selectedListId?: string;
}

interface CopyOption {
  id: string;
  text: string;
  isFavorite: boolean;
  isEditing: boolean;
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
  const [klaviyoApiKey, setKlaviyoApiKey] = useState<string>('');
  
  // Segment state
  const [klaviyoLists, setKlaviyoLists] = useState<Array<{ id: string; name: string }>>([]);
  const [includedSegments, setIncludedSegments] = useState<string[]>([]);
  const [excludedSegments, setExcludedSegments] = useState<string[]>([]);
  
  // SL/PT state
  const [subjectLines, setSubjectLines] = useState<CopyOption[]>([]);
  const [previewTexts, setPreviewTexts] = useState<CopyOption[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  const [selectedPreviewId, setSelectedPreviewId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRefreshingSL, setIsRefreshingSL] = useState(false);
  const [isRefreshingPT, setIsRefreshingPT] = useState(false);
  const [isSending, setIsSending] = useState(false);
  
  // Emoji picker state
  const [emojiPickerOpenFor, setEmojiPickerOpenFor] = useState<{ type: 'sl' | 'pt'; id: string } | null>(null);
  
  // Success state
  const [campaignId, setCampaignId] = useState<string | null>(null);

  useEffect(() => {
    if (state) {
      setSlices(state.slices || []);
      setFooterHtml(state.footerHtml);
      setBrandName(state.brandName || '');
      setBrandDomain(state.brandDomain || '');
      setKlaviyoApiKey(state.klaviyoApiKey || '');
      setKlaviyoLists(state.klaviyoLists || []);
      
      // Set initial included segment
      if (state.selectedListId) {
        setIncludedSegments([state.selectedListId]);
      }
      
      // Generate initial SL/PT
      generateEmailCopy(state.slices, state.brandName || '', 10, 10);
    } else {
      navigate('/');
    }
  }, []);

  // Extract URLs from slices
  const extractedUrls = slices
    .filter(s => s.link)
    .map(s => s.link as string);

  const generateEmailCopy = async (
    campaignSlices: ProcessedSlice[],
    brand: string,
    slCount: number,
    ptCount: number,
    favoriteSL?: CopyOption[],
    favoritePT?: CopyOption[]
  ) => {
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-email-copy', {
        body: {
          slices: campaignSlices.map(s => ({ altText: s.altText, link: s.link })),
          brandContext: { name: brand, domain: brandDomain },
          existingFavorites: [
            ...(favoriteSL?.map(f => ({ type: 'subject', text: f.text })) || []),
            ...(favoritePT?.map(f => ({ type: 'preview', text: f.text })) || []),
          ],
          subjectCount: slCount,
          previewCount: ptCount,
        }
      });

      if (error) throw error;

      // Merge with existing favorites
      const newSubjectLines: CopyOption[] = [
        ...(favoriteSL || []),
        ...(data.subjectLines || []).map((text: string, i: number) => ({
          id: `sl-${Date.now()}-${i}`,
          text,
          isFavorite: false,
          isEditing: false,
        })),
      ];

      const newPreviewTexts: CopyOption[] = [
        ...(favoritePT || []),
        ...(data.previewTexts || []).map((text: string, i: number) => ({
          id: `pt-${Date.now()}-${i}`,
          text,
          isFavorite: false,
          isEditing: false,
        })),
      ];

      setSubjectLines(newSubjectLines);
      setPreviewTexts(newPreviewTexts);
      
      // Auto-select first if none selected
      if (!selectedSubjectId && newSubjectLines.length > 0) {
        setSelectedSubjectId(newSubjectLines[0].id);
      }
      if (!selectedPreviewId && newPreviewTexts.length > 0) {
        setSelectedPreviewId(newPreviewTexts[0].id);
      }
    } catch (err) {
      console.error('Error generating copy:', err);
      toast.error('Failed to generate subject lines');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRefreshSubjectLines = async () => {
    setIsRefreshingSL(true);
    const favorites = subjectLines.filter(sl => sl.isFavorite);
    const count = 10 - favorites.length;
    
    try {
      const { data, error } = await supabase.functions.invoke('generate-email-copy', {
        body: {
          slices: slices.map(s => ({ altText: s.altText, link: s.link })),
          brandContext: { name: brandName, domain: brandDomain },
          existingFavorites: favorites.map(f => ({ type: 'subject', text: f.text })),
          subjectCount: count,
          previewCount: 0,
        }
      });

      if (error) throw error;

      const newSubjectLines: CopyOption[] = [
        ...favorites,
        ...(data.subjectLines || []).map((text: string, i: number) => ({
          id: `sl-${Date.now()}-${i}`,
          text,
          isFavorite: false,
          isEditing: false,
        })),
      ];

      setSubjectLines(newSubjectLines);
    } catch (err) {
      toast.error('Failed to refresh subject lines');
    } finally {
      setIsRefreshingSL(false);
    }
  };

  const handleRefreshPreviewTexts = async () => {
    setIsRefreshingPT(true);
    const favorites = previewTexts.filter(pt => pt.isFavorite);
    const count = 10 - favorites.length;
    
    try {
      const { data, error } = await supabase.functions.invoke('generate-email-copy', {
        body: {
          slices: slices.map(s => ({ altText: s.altText, link: s.link })),
          brandContext: { name: brandName, domain: brandDomain },
          existingFavorites: favorites.map(f => ({ type: 'preview', text: f.text })),
          subjectCount: 0,
          previewCount: count,
        }
      });

      if (error) throw error;

      const newPreviewTexts: CopyOption[] = [
        ...favorites,
        ...(data.previewTexts || []).map((text: string, i: number) => ({
          id: `pt-${Date.now()}-${i}`,
          text,
          isFavorite: false,
          isEditing: false,
        })),
      ];

      setPreviewTexts(newPreviewTexts);
    } catch (err) {
      toast.error('Failed to refresh preview texts');
    } finally {
      setIsRefreshingPT(false);
    }
  };

  const toggleFavorite = (type: 'sl' | 'pt', id: string) => {
    if (type === 'sl') {
      setSubjectLines(prev => prev.map(sl => 
        sl.id === id ? { ...sl, isFavorite: !sl.isFavorite } : sl
      ));
    } else {
      setPreviewTexts(prev => prev.map(pt => 
        pt.id === id ? { ...pt, isFavorite: !pt.isFavorite } : pt
      ));
    }
  };

  const startEditing = (type: 'sl' | 'pt', id: string) => {
    if (type === 'sl') {
      setSubjectLines(prev => prev.map(sl => 
        sl.id === id ? { ...sl, isEditing: true } : sl
      ));
    } else {
      setPreviewTexts(prev => prev.map(pt => 
        pt.id === id ? { ...pt, isEditing: true } : pt
      ));
    }
  };

  const updateText = (type: 'sl' | 'pt', id: string, text: string) => {
    if (type === 'sl') {
      setSubjectLines(prev => prev.map(sl => 
        sl.id === id ? { ...sl, text } : sl
      ));
    } else {
      setPreviewTexts(prev => prev.map(pt => 
        pt.id === id ? { ...pt, text } : pt
      ));
    }
  };

  const stopEditing = (type: 'sl' | 'pt', id: string) => {
    if (type === 'sl') {
      setSubjectLines(prev => prev.map(sl => 
        sl.id === id ? { ...sl, isEditing: false } : sl
      ));
    } else {
      setPreviewTexts(prev => prev.map(pt => 
        pt.id === id ? { ...pt, isEditing: false } : pt
      ));
    }
  };

  const addEmoji = (type: 'sl' | 'pt', id: string, emoji: string) => {
    if (type === 'sl') {
      setSubjectLines(prev => prev.map(sl => 
        sl.id === id ? { ...sl, text: sl.text + emoji } : sl
      ));
    } else {
      setPreviewTexts(prev => prev.map(pt => 
        pt.id === id ? { ...pt, text: pt.text + emoji } : pt
      ));
    }
    setEmojiPickerOpenFor(null);
  };

  const toggleSegment = (type: 'include' | 'exclude', segmentId: string) => {
    if (type === 'include') {
      setIncludedSegments(prev => 
        prev.includes(segmentId) 
          ? prev.filter(id => id !== segmentId)
          : [...prev, segmentId]
      );
      // Remove from excluded if adding to included
      setExcludedSegments(prev => prev.filter(id => id !== segmentId));
    } else {
      setExcludedSegments(prev => 
        prev.includes(segmentId) 
          ? prev.filter(id => id !== segmentId)
          : [...prev, segmentId]
      );
      // Remove from included if adding to excluded
      setIncludedSegments(prev => prev.filter(id => id !== segmentId));
    }
  };

  const handleSendCampaign = async () => {
    const selectedSubject = subjectLines.find(sl => sl.id === selectedSubjectId);
    const selectedPreview = previewTexts.find(pt => pt.id === selectedPreviewId);

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
          listId: includedSegments[0], // Primary list
          includedSegments,
          excludedSegments,
          subjectLine: selectedSubject.text,
          previewText: selectedPreview.text,
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
          disabled={isSending || !selectedSubjectId || !selectedPreviewId || includedSegments.length === 0}
          className="px-6"
        >
          {isSending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
          Send Campaign
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left: Preview */}
        <div className="w-[400px] border-r border-border/40 flex-shrink-0 overflow-auto bg-muted/20">
          <div className="p-6">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">Campaign Preview</h3>
            <div className="bg-background rounded-lg border border-border/40 overflow-hidden">
              <div className="transform scale-[0.5] origin-top-left" style={{ width: '200%' }}>
                <CampaignPreviewFrame slices={slices} footerHtml={footerHtml} width={600} />
              </div>
            </div>
            
            {/* URLs */}
            {extractedUrls.length > 0 && (
              <div className="mt-6">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Links in Campaign</h3>
                <div className="space-y-2">
                  {extractedUrls.map((url, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1.5">
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
          <div className="p-8 max-w-3xl mx-auto space-y-8">
            {/* Segments */}
            <div>
              <h3 className="text-sm font-medium mb-4">Audience</h3>
              <div className="grid grid-cols-2 gap-6">
                {/* Include */}
                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-2">Include</label>
                  <div className="space-y-1.5 max-h-40 overflow-auto">
                    {klaviyoLists.map(list => (
                      <button
                        key={list.id}
                        onClick={() => toggleSegment('include', list.id)}
                        className={cn(
                          "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left transition-colors",
                          includedSegments.includes(list.id)
                            ? "bg-primary/10 text-primary border border-primary/30"
                            : "bg-muted/50 text-muted-foreground hover:bg-muted"
                        )}
                      >
                        {includedSegments.includes(list.id) && <Check className="w-3.5 h-3.5 flex-shrink-0" />}
                        <span className="truncate">{list.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
                {/* Exclude */}
                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-2">Exclude</label>
                  <div className="space-y-1.5 max-h-40 overflow-auto">
                    {klaviyoLists.map(list => (
                      <button
                        key={list.id}
                        onClick={() => toggleSegment('exclude', list.id)}
                        className={cn(
                          "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left transition-colors",
                          excludedSegments.includes(list.id)
                            ? "bg-destructive/10 text-destructive border border-destructive/30"
                            : "bg-muted/50 text-muted-foreground hover:bg-muted"
                        )}
                      >
                        {excludedSegments.includes(list.id) && <Check className="w-3.5 h-3.5 flex-shrink-0" />}
                        <span className="truncate">{list.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Subject Lines */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium">Subject Line</h3>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={handleRefreshSubjectLines}
                  disabled={isRefreshingSL || isGenerating}
                  className="h-7 text-xs"
                >
                  <RefreshCw className={cn("w-3 h-3 mr-1", isRefreshingSL && "animate-spin")} />
                  Refresh
                </Button>
              </div>
              {isGenerating ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {subjectLines.map(sl => (
                    <CopyOptionCard
                      key={sl.id}
                      option={sl}
                      isSelected={selectedSubjectId === sl.id}
                      onSelect={() => setSelectedSubjectId(sl.id)}
                      onToggleFavorite={() => toggleFavorite('sl', sl.id)}
                      onStartEdit={() => startEditing('sl', sl.id)}
                      onUpdateText={(text) => updateText('sl', sl.id, text)}
                      onStopEdit={() => stopEditing('sl', sl.id)}
                      onAddEmoji={(emoji) => addEmoji('sl', sl.id, emoji)}
                      emojiPickerOpen={emojiPickerOpenFor?.type === 'sl' && emojiPickerOpenFor.id === sl.id}
                      onEmojiPickerToggle={() => setEmojiPickerOpenFor(
                        emojiPickerOpenFor?.type === 'sl' && emojiPickerOpenFor.id === sl.id 
                          ? null 
                          : { type: 'sl', id: sl.id }
                      )}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Preview Texts */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium">Preview Text</h3>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={handleRefreshPreviewTexts}
                  disabled={isRefreshingPT || isGenerating}
                  className="h-7 text-xs"
                >
                  <RefreshCw className={cn("w-3 h-3 mr-1", isRefreshingPT && "animate-spin")} />
                  Refresh
                </Button>
              </div>
              {isGenerating ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {previewTexts.map(pt => (
                    <CopyOptionCard
                      key={pt.id}
                      option={pt}
                      isSelected={selectedPreviewId === pt.id}
                      onSelect={() => setSelectedPreviewId(pt.id)}
                      onToggleFavorite={() => toggleFavorite('pt', pt.id)}
                      onStartEdit={() => startEditing('pt', pt.id)}
                      onUpdateText={(text) => updateText('pt', pt.id, text)}
                      onStopEdit={() => stopEditing('pt', pt.id)}
                      onAddEmoji={(emoji) => addEmoji('pt', pt.id, emoji)}
                      emojiPickerOpen={emojiPickerOpenFor?.type === 'pt' && emojiPickerOpenFor.id === pt.id}
                      onEmojiPickerToggle={() => setEmojiPickerOpenFor(
                        emojiPickerOpenFor?.type === 'pt' && emojiPickerOpenFor.id === pt.id 
                          ? null 
                          : { type: 'pt', id: pt.id }
                      )}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

// Copy Option Card Component
interface CopyOptionCardProps {
  option: CopyOption;
  isSelected: boolean;
  onSelect: () => void;
  onToggleFavorite: () => void;
  onStartEdit: () => void;
  onUpdateText: (text: string) => void;
  onStopEdit: () => void;
  onAddEmoji: (emoji: string) => void;
  emojiPickerOpen: boolean;
  onEmojiPickerToggle: () => void;
}

function CopyOptionCard({
  option,
  isSelected,
  onSelect,
  onToggleFavorite,
  onStartEdit,
  onUpdateText,
  onStopEdit,
  onAddEmoji,
  emojiPickerOpen,
  onEmojiPickerToggle,
}: CopyOptionCardProps) {
  return (
    <div
      className={cn(
        "relative p-3 rounded-lg border-2 transition-all cursor-pointer group",
        isSelected
          ? "border-primary bg-primary/5"
          : "border-border/50 hover:border-border bg-background"
      )}
      onClick={() => !option.isEditing && onSelect()}
    >
      {/* Selection indicator */}
      {isSelected && (
        <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
          <Check className="w-3 h-3 text-primary-foreground" />
        </div>
      )}

      {/* Content */}
      {option.isEditing ? (
        <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
          <Input
            value={option.text}
            onChange={(e) => onUpdateText(e.target.value)}
            onBlur={onStopEdit}
            onKeyDown={(e) => e.key === 'Enter' && onStopEdit()}
            autoFocus
            className="text-sm"
          />
          <div className="flex items-center gap-2">
            <Popover open={emojiPickerOpen} onOpenChange={onEmojiPickerToggle}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 px-2">
                  <Smile className="w-4 h-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-2" align="start">
                <div className="grid grid-cols-10 gap-1">
                  {POPULAR_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => onAddEmoji(emoji)}
                      className="w-6 h-6 flex items-center justify-center hover:bg-muted rounded text-base"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      ) : (
        <p className="text-sm pr-8 min-h-[2.5rem]">{option.text}</p>
      )}

      {/* Actions */}
      {!option.isEditing && (
        <div className="absolute bottom-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); onStartEdit(); }}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
          >
            <Pencil className="w-3 h-3" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
            className={cn(
              "p-1 rounded transition-colors",
              option.isFavorite 
                ? "text-red-500 hover:text-red-600" 
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            <Heart className={cn("w-3 h-3", option.isFavorite && "fill-current")} />
          </button>
        </div>
      )}

      {/* Favorite indicator */}
      {option.isFavorite && !option.isEditing && (
        <Heart className="absolute top-2 left-2 w-3 h-3 text-red-500 fill-current" />
      )}
    </div>
  );
}
