import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { ChevronLeft, Rocket, FileText, Link, X, ExternalLink, CheckCircle, Sparkles, PanelLeftClose, PanelLeft, Loader2, Image, Code2, Type, Save } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { ProcessedSlice } from '@/types/slice';
import { CampaignPreviewFrame } from './CampaignPreviewFrame';
import { CampaignChat, ChatMessage } from './CampaignChat';
import { FooterSelector, BrandFooter } from './FooterSelector';

const BASE_WIDTH = 600;

interface BrandContext {
  name?: string;
  domain?: string;
  websiteUrl?: string;
  colors?: {
    primary?: string;
    secondary?: string;
    accent?: string;
    background?: string;
    textPrimary?: string;
    link?: string;
  };
  typography?: unknown;
  lightLogoUrl?: string;
  darkLogoUrl?: string;
}

interface CampaignStudioProps {
  mode?: 'campaign' | 'footer';
  slices: ProcessedSlice[];
  onSlicesChange: (slices: ProcessedSlice[]) => void;
  originalImageUrl: string;
  brandUrl: string;
  brandContext?: BrandContext;
  brandLinks?: string[];
  // Footer props - now with versioning support
  initialFooterHtml?: string;
  initialFooterId?: string | null;
  savedFooters?: BrandFooter[];
  onSaveFooter?: (name: string, html: string) => Promise<void>;
  onBack: () => void;
  onCreateTemplate: (footerHtml?: string) => void;
  onCreateCampaign: (footerHtml?: string) => void;
  onConvertToHtml: (index: number) => Promise<void>;
  isCreating: boolean;
  templateId?: string | null;
  campaignId?: string | null;
  onReset?: () => void;
  // Footer editor mode specific
  footerName?: string;
  onFooterNameChange?: (name: string) => void;
}

interface SliceDimensions {
  height: number;
  top: number;
}

export function CampaignStudio({
  mode = 'campaign',
  slices,
  onSlicesChange,
  originalImageUrl,
  brandUrl,
  brandContext,
  brandLinks = [],
  initialFooterHtml,
  initialFooterId = null,
  savedFooters = [],
  onSaveFooter,
  onBack,
  onCreateTemplate,
  onCreateCampaign,
  onConvertToHtml,
  isCreating,
  templateId,
  campaignId,
  onReset,
  footerName: propFooterName,
  onFooterNameChange,
}: CampaignStudioProps) {
  const isFooterMode = mode === 'footer';
  // Local footer state - this is the source of truth for the current footer
  const [localFooterHtml, setLocalFooterHtml] = useState<string | undefined>(initialFooterHtml);
  const [selectedFooterId, setSelectedFooterId] = useState<string | null>(initialFooterId);
  const [originalFooterHtml, setOriginalFooterHtml] = useState<string | undefined>(initialFooterHtml);
  
  const [convertingIndex, setConvertingIndex] = useState<number | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isRefining, setIsRefining] = useState(false);
  const [isAutoRefining, setIsAutoRefining] = useState(false);
  const [editingLinkIndex, setEditingLinkIndex] = useState<number | null>(null);
  const [editingAltIndex, setEditingAltIndex] = useState<number | null>(null);
  const [linkSearchValue, setLinkSearchValue] = useState('');
  const [zoomLevel, setZoomLevel] = useState(65);
  const [chatExpanded, setChatExpanded] = useState(true);
  const [sliceDimensions, setSliceDimensions] = useState<SliceDimensions[]>([]);
  const [showAltText, setShowAltText] = useState(false);
  const [includeFooter, setIncludeFooter] = useState(true);

  // Sync footer from props when they change (initial load or external updates)
  useEffect(() => {
    setLocalFooterHtml(initialFooterHtml);
    setOriginalFooterHtml(initialFooterHtml);
  }, [initialFooterHtml]);

  useEffect(() => {
    setSelectedFooterId(initialFooterId);
  }, [initialFooterId]);

  // Check if footer has been modified from original
  const isFooterModified = localFooterHtml !== originalFooterHtml;

  const hasHtmlSlices = slices.some(s => s.type === 'html');

  // Handle footer selection from dropdown
  const handleSelectFooter = (footer: BrandFooter) => {
    setLocalFooterHtml(footer.html);
    setSelectedFooterId(footer.id);
    setOriginalFooterHtml(footer.html);
    toast.success(`Switched to "${footer.name}"`);
  };

  // Handle saving current footer as new version
  const handleSaveFooter = async (name: string, html: string) => {
    if (onSaveFooter) {
      await onSaveFooter(name, html);
      toast.success(`Footer "${name}" saved`);
    }
  };

  useEffect(() => {
    const loadSliceHeights = async () => {
      const dims: SliceDimensions[] = [];
      let cumulativeTop = 0;

      for (const slice of slices) {
        const height = await new Promise<number>((resolve) => {
          const img = new window.Image();
          img.onload = () => {
            const scale = BASE_WIDTH / img.naturalWidth;
            resolve(img.naturalHeight * scale);
          };
          img.onerror = () => resolve(100);
          img.src = slice.imageUrl;
        });

        dims.push({ height, top: cumulativeTop });
        cumulativeTop += height;
      }

      setSliceDimensions(dims);
    };

    if (slices.length > 0) {
      loadSliceHeights();
    }
  }, [slices]);

  const updateSlice = (index: number, updates: Partial<ProcessedSlice>) => {
    const updated = [...slices];
    updated[index] = { ...updated[index], ...updates };
    onSlicesChange(updated);
  };

  const toggleSliceType = async (index: number) => {
    const slice = slices[index];
    if (slice.type === 'image') {
      setConvertingIndex(index);
      try {
        await onConvertToHtml(index);
      } finally {
        setConvertingIndex(null);
      }
    } else {
      updateSlice(index, { type: 'image', htmlContent: undefined });
    }
  };

  const setSliceLink = (index: number, link: string) => {
    updateSlice(index, { link, isClickable: true });
    setEditingLinkIndex(null);
    setLinkSearchValue('');
  };

  const removeLink = (index: number) => {
    updateSlice(index, { link: null, isClickable: false });
  };

  const handleSendMessage = async (message: string) => {
    const newMessages: ChatMessage[] = [...chatMessages, { role: 'user', content: message }];
    setChatMessages(newMessages);
    setIsRefining(true);

    try {
      const { data, error } = await supabase.functions.invoke('refine-campaign', {
        body: {
          allSlices: slices.map(s => ({
            type: s.type,
            imageUrl: s.imageUrl,
            htmlContent: s.htmlContent,
            altText: s.altText,
            link: s.link,
          })),
          footerHtml: localFooterHtml, // Use local state
          originalCampaignImageUrl: originalImageUrl,
          conversationHistory: newMessages,
          userRequest: message,
          brandUrl,
          brandContext,
          mode: 'chat',
          isFooterMode, // Tell backend this is footer-only mode
          lightLogoUrl: brandContext?.lightLogoUrl,
          darkLogoUrl: brandContext?.darkLogoUrl,
        }
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      setChatMessages([...newMessages, { role: 'assistant', content: data.message || 'Changes applied!' }]);

      // Handle footer updates - update LOCAL state directly
      if (data.updatedFooterHtml) {
        setLocalFooterHtml(data.updatedFooterHtml);
        toast.success('Footer updated');
      }

      if (data.updatedSlices && data.updatedSlices.length > 0) {
        const updatedSlices = slices.map((slice, i) => {
          const updated = data.updatedSlices.find((u: any) => u.index === i);
          if (updated?.htmlContent && slice.type === 'html') {
            return { ...slice, htmlContent: updated.htmlContent };
          }
          return slice;
        });
        onSlicesChange(updatedSlices);
        toast.success('HTML updated');
      }
    } catch (err) {
      setChatMessages([...newMessages, { 
        role: 'assistant', 
        content: `Error: ${err instanceof Error ? err.message : 'Failed to process request'}` 
      }]);
      toast.error('Failed to process request');
    } finally {
      setIsRefining(false);
    }
  };

  const handleAutoRefine = async () => {
    setIsAutoRefining(true);
    
    // Build a more comprehensive auto-refine prompt for multi-slice campaigns
    const htmlSliceCount = slices.filter(s => s.type === 'html').length;
    const imageSliceCount = slices.filter(s => s.type === 'image').length;
    
    let autoRefinePrompt: string;
    if (isFooterMode) {
      autoRefinePrompt = 'Compare the footer HTML render to the original reference image. Identify any visual differences and update the footer HTML to match the original design as closely as possible.';
    } else if (htmlSliceCount > 1) {
      // Multi-slice HTML campaign - comprehensive prompt
      autoRefinePrompt = `Analyze the ENTIRE campaign as rendered (${htmlSliceCount} HTML sections + ${imageSliceCount} image sections stacked vertically).

Compare the complete composed email to the original design image. For EACH HTML section:
1. Identify any visual differences from the corresponding portion of the original design
2. Check for style INCONSISTENCIES between HTML sections (different fonts, button styles, colors, spacing)
3. Ensure all HTML sections use IDENTICAL styling for equivalent elements

Provide updated HTML for ALL sections that need changes to:
- Match the original design pixel-perfectly
- Use consistent styling across ALL HTML sections
- Maintain email-safe HTML (tables, inline CSS, no flex/grid)

Return ALL HTML sections that need updates, not just one.`;
    } else {
      autoRefinePrompt = 'Compare the HTML render to the original design image. Identify any visual differences and update the HTML to match the original design as closely as possible.';
    }
    
    const newMessages: ChatMessage[] = [...chatMessages, { role: 'user', content: '[Auto-refine]' }];
    setChatMessages(newMessages);

    try {
      const { data, error } = await supabase.functions.invoke('refine-campaign', {
        body: {
          allSlices: slices.map(s => ({
            type: s.type,
            imageUrl: s.imageUrl,
            htmlContent: s.htmlContent,
            altText: s.altText,
            link: s.link,
          })),
          footerHtml: localFooterHtml,
          originalCampaignImageUrl: originalImageUrl,
          conversationHistory: newMessages,
          userRequest: autoRefinePrompt,
          brandUrl,
          brandContext,
          mode: 'auto-refine',
          isFooterMode,
          lightLogoUrl: brandContext?.lightLogoUrl,
          darkLogoUrl: brandContext?.darkLogoUrl,
        }
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      const responseMessage = data.styleConsistencyNotes 
        ? `${data.message || 'Refinement complete!'}\n\nStyle notes: ${data.styleConsistencyNotes}`
        : data.message || 'Refinement complete!';
      
      setChatMessages([...newMessages, { role: 'assistant', content: responseMessage }]);

      // Handle footer updates in auto-refine
      if (data.updatedFooterHtml) {
        setLocalFooterHtml(data.updatedFooterHtml);
        toast.success('Footer refined');
      }

      if (data.updatedSlices && data.updatedSlices.length > 0) {
        const updatedSlices = slices.map((slice, i) => {
          const updated = data.updatedSlices.find((u: any) => u.index === i);
          if (updated?.htmlContent && slice.type === 'html') {
            return { ...slice, htmlContent: updated.htmlContent };
          }
          return slice;
        });
        onSlicesChange(updatedSlices);
        toast.success(`${data.updatedSlices.length} slice(s) refined`);
      }
    } catch (err) {
      setChatMessages([...newMessages, { 
        role: 'assistant', 
        content: `Failed: ${err instanceof Error ? err.message : 'Unknown error'}` 
      }]);
      toast.error('Auto-refine failed');
    } finally {
      setIsAutoRefining(false);
    }
  };

  const scaledWidth = BASE_WIDTH * (zoomLevel / 100);

  // Filter brand links based on search
  const filteredLinks = brandLinks.filter(link => 
    link.toLowerCase().includes(linkSearchValue.toLowerCase())
  );

  // Footer mode specific state
  const [localFooterName, setLocalFooterName] = useState(propFooterName || 'New Footer');
  const [footerSaved, setFooterSaved] = useState(false);

  const handleSaveFooterClick = async () => {
    if (onSaveFooter && localFooterHtml) {
      await onSaveFooter(localFooterName, localFooterHtml);
      setFooterSaved(true);
    }
  };

  return (
    <div className="h-screen w-full flex flex-col bg-background">
      {/* Minimal Header */}
      <div className="h-11 px-4 flex items-center justify-between border-b border-border/40 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack} disabled={isCreating} className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground">
            <ChevronLeft className="w-3.5 h-3.5" />
          </Button>
          <button
            onClick={() => setChatExpanded(!chatExpanded)}
            className="h-7 px-2 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground rounded-md hover:bg-muted/50 transition-colors"
          >
            {chatExpanded ? <PanelLeftClose className="w-3.5 h-3.5" /> : <PanelLeft className="w-3.5 h-3.5" />}
          </button>
          
          {/* Show different info based on mode */}
          {isFooterMode ? (
            <span className="text-xs text-muted-foreground/60">Footer Editor</span>
          ) : (
            <>
              <span className="text-xs text-muted-foreground/60">{slices.length} slices</span>
              <button
                onClick={() => setShowAltText(!showAltText)}
                className={cn(
                  "h-7 px-2 flex items-center gap-1.5 text-xs rounded-md transition-colors",
                  showAltText 
                    ? "text-foreground bg-muted/60" 
                    : "text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/30"
                )}
                title="Toggle alt text"
              >
                <Type className="w-3.5 h-3.5" />
                <span>Alt</span>
              </button>
              <button
                onClick={() => setIncludeFooter(!includeFooter)}
                className={cn(
                  "h-7 px-2 flex items-center gap-1.5 text-xs rounded-md transition-colors",
                  includeFooter 
                    ? "text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/30" 
                    : "text-foreground bg-muted/60"
                )}
                title={includeFooter ? "Footer included - click to exclude" : "Footer excluded - click to include"}
              >
                {includeFooter ? <CheckCircle className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                <span>Footer</span>
              </button>
              
              {/* Footer version selector - only show when footer is included */}
              {includeFooter && savedFooters.length > 0 && (
                <FooterSelector
                  savedFooters={savedFooters}
                  currentFooterHtml={localFooterHtml}
                  selectedFooterId={selectedFooterId}
                  onSelectFooter={handleSelectFooter}
                  onSaveFooter={handleSaveFooter}
                  isModified={isFooterModified}
                  disabled={isCreating}
                />
              )}
            </>
          )}
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Slider
              value={[zoomLevel]}
              onValueChange={([v]) => setZoomLevel(v)}
              min={25}
              max={150}
              step={5}
              className="w-20"
            />
            <span className="text-[10px] text-muted-foreground/50 w-7">{zoomLevel}%</span>
          </div>
          
          {/* Footer mode: Save Footer button */}
          {isFooterMode ? (
            footerSaved ? (
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1 text-xs text-green-600">
                  <CheckCircle className="w-3 h-3" />
                  Saved
                </span>
                <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={onBack}>
                  Done
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={localFooterName}
                  onChange={(e) => {
                    setLocalFooterName(e.target.value);
                    onFooterNameChange?.(e.target.value);
                  }}
                  placeholder="Footer name..."
                  className="h-7 px-2 text-xs border border-border/50 rounded bg-background w-32"
                />
                <Button
                  size="sm"
                  onClick={handleSaveFooterClick}
                  disabled={isCreating || !localFooterHtml}
                  className="h-7 text-xs px-3"
                >
                  <Save className="w-3 h-3 mr-1" />
                  Save Footer
                </Button>
              </div>
            )
          ) : templateId ? (
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 text-xs text-green-600">
                <CheckCircle className="w-3 h-3" />
                Created
              </span>
              <Button
                size="sm"
                className="h-7 text-xs px-3"
                onClick={() => window.open(
                  campaignId 
                    ? `https://www.klaviyo.com/email-template-editor/campaign/${campaignId}/content/edit`
                    : `https://www.klaviyo.com/email-templates`,
                  '_blank'
                )}
              >
                <ExternalLink className="w-3 h-3 mr-1" />
                Open
              </Button>
              {onReset && (
                <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={onReset}>
                  New
                </Button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onCreateTemplate(includeFooter ? localFooterHtml : undefined)}
                disabled={isCreating || convertingIndex !== null}
                className="h-7 text-xs px-2 text-muted-foreground"
              >
                <FileText className="w-3 h-3 mr-1" />
                Template
              </Button>
              <Button
                size="sm"
                onClick={() => onCreateCampaign(includeFooter ? localFooterHtml : undefined)}
                disabled={isCreating || convertingIndex !== null}
                className="h-7 text-xs px-3"
              >
                <Rocket className="w-3 h-3 mr-1" />
                {isCreating ? '...' : 'Campaign'}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Panel Layout - Chat narrower, content gets more space */}
      <ResizablePanelGroup direction="horizontal" className="flex-1">
        {/* Panel 1: Chat */}
        {chatExpanded && (
          <>
            <ResizablePanel defaultSize={22} minSize={15} maxSize={35}>
              <div className="h-full flex flex-col">
                <div className="px-3 py-2 border-b border-border/30">
                  <span className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3" />
                    Refine
                  </span>
                </div>
                <div className="flex-1 overflow-hidden">
                  <CampaignChat
                    messages={chatMessages}
                    onSendMessage={handleSendMessage}
                    onAutoRefine={handleAutoRefine}
                    isLoading={isRefining}
                    isAutoRefining={isAutoRefining}
                  />
                </div>
              </div>
            </ResizablePanel>
            <ResizableHandle className="w-px bg-border/30 hover:bg-border/60 transition-colors" />
          </>
        )}

        {/* Panel 2: Content - Footer mode or Campaign mode */}
        <ResizablePanel defaultSize={isFooterMode ? 39 : (hasHtmlSlices ? 45 : (chatExpanded ? 78 : 100))} minSize={35}>
          <div className="h-full overflow-auto bg-muted/20">
            <div className="p-6 flex justify-center">
              {isFooterMode ? (
                /* Footer Mode: Reference image */
                <div className="flex flex-col items-center gap-4">
                  <span className="text-xs text-muted-foreground/60 uppercase tracking-wider">Reference Image</span>
                  <img 
                    src={originalImageUrl} 
                    alt="Footer reference"
                    style={{ width: scaledWidth }}
                    className="rounded border border-border/30"
                  />
                </div>
              ) : (
                <div className="flex flex-col">
                {/* Stacked slices with inline details */}
                {slices.map((slice, index) => (
                <div key={index} className="relative flex items-center">
                  {/* Slice separator line - extends from left edge to image */}
                  {index > 0 && (
                    <div className="absolute top-0 left-0 right-0 flex items-center" style={{ transform: 'translateY(-50%)' }}>
                      <div className="h-px bg-destructive/60 flex-1" />
                      <span className="px-2 text-[9px] text-destructive/60 font-medium">SLICE {index + 1}</span>
                    </div>
                  )}
                  {/* Slice details - generous width for readability */}
                  <div className="min-w-[320px] w-96 flex-shrink-0 p-4 space-y-3 pt-6">
                    {/* Row 1: Type toggle + Link + dimensions - all inline */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Pill toggle - Figma style */}
                      <div className="flex items-center bg-muted/50 border border-border/40 rounded-full p-0.5">
                        <button
                          onClick={() => slice.type === 'html' && toggleSliceType(index)}
                          disabled={convertingIndex !== null || isCreating}
                          className={cn(
                            "h-6 w-6 rounded-full flex items-center justify-center transition-colors",
                            slice.type === 'image' 
                              ? "bg-primary/15 text-primary border border-primary/30" 
                              : "text-muted-foreground/50 hover:text-muted-foreground",
                            (convertingIndex !== null || isCreating) && "opacity-50 cursor-not-allowed"
                          )}
                          title="Image mode"
                        >
                          <Image className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => slice.type === 'image' && toggleSliceType(index)}
                          disabled={convertingIndex !== null || isCreating}
                          className={cn(
                            "h-6 w-6 rounded-full flex items-center justify-center transition-colors",
                            slice.type === 'html' 
                              ? "bg-primary/15 text-primary border border-primary/30" 
                              : "text-muted-foreground/50 hover:text-muted-foreground",
                            (convertingIndex !== null || isCreating) && "opacity-50 cursor-not-allowed"
                          )}
                          title="HTML mode"
                        >
                          {convertingIndex === index ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Code2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>

                      {/* Link - clickable to edit, or add button */}
                      <Popover open={editingLinkIndex === index} onOpenChange={(open) => {
                        if (open) {
                          setEditingLinkIndex(index);
                          setLinkSearchValue('');
                        } else {
                          setEditingLinkIndex(null);
                        }
                      }}>
                        <PopoverTrigger asChild>
                          {slice.link !== null && slice.link !== '' ? (
                            <button className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-primary/10 border border-primary/20 rounded-md text-xs hover:bg-primary/20 transition-colors">
                              <Link className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                              <span className="text-foreground break-all text-left font-medium">{slice.link}</span>
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
                                    onClick={() => setSliceLink(index, linkSearchValue)}
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
                                      onSelect={() => setSliceLink(index, link)}
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
                      {/* Remove link button - separate from popover */}
                      {slice.link && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeLink(index);
                          }}
                          className="text-muted-foreground/40 hover:text-foreground/60"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}

                    </div>

                    {/* Row 2: Alt text (toggleable) */}
                    {showAltText && (
                      editingAltIndex === index ? (
                        <textarea
                          value={slice.altText}
                          onChange={(e) => updateSlice(index, { altText: e.target.value })}
                          placeholder="Add description..."
                          className="w-full text-[11px] text-muted-foreground/70 leading-relaxed bg-muted/40 rounded-md px-2 py-1.5 border-0 resize-none focus:outline-none focus:ring-1 focus:ring-primary/30"
                          rows={2}
                          autoFocus
                          onBlur={() => setEditingAltIndex(null)}
                        />
                      ) : (
                        <p 
                          onClick={() => setEditingAltIndex(index)}
                          className="text-[11px] text-muted-foreground/70 leading-relaxed cursor-pointer hover:text-muted-foreground transition-colors"
                        >
                          {slice.altText || 'Add description...'}
                        </p>
                      )
                    )}
                  </div>

                  {/* Slice image - fixed width, no gap */}
                  <div className="flex-shrink-0" style={{ width: scaledWidth }}>
                    <img
                      src={slice.imageUrl}
                      alt={slice.altText}
                      style={{ width: scaledWidth }}
                      className="block"
                    />
                  </div>
                </div>
              ))}
              
              {/* Footer preview */}
              {includeFooter && localFooterHtml && (
                <div className="border-t-2 border-dashed border-primary/40 mt-2">
                  <div className="flex items-stretch">
                    <div className="min-w-[320px] w-96 flex-shrink-0 p-4">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-medium text-primary/60 uppercase tracking-wider">Footer</span>
                        {isFooterModified && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-600">Modified</span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground/60 mt-1">Modify via chat: "change footer background to..."</p>
                    </div>
                    <div 
                      className="flex-shrink-0 origin-top-left" 
                      style={{ width: scaledWidth }}
                    >
                      <iframe
                        srcDoc={`<!DOCTYPE html><html><head><style>body{margin:0;padding:0;}</style></head><body><table width="${BASE_WIDTH}" style="width:${BASE_WIDTH}px;margin:0 auto;">${localFooterHtml}</table></body></html>`}
                        title="Footer Preview"
                        style={{ 
                          border: 'none', 
                          width: BASE_WIDTH, 
                          height: '600px',
                          transform: `scale(${zoomLevel / 100})`,
                          transformOrigin: 'top left'
                        }}
                        sandbox="allow-same-origin"
                      />
                    </div>
                  </div>
                </div>
              )}
              </div>
              )}
            </div>
          </div>
        </ResizablePanel>

        {/* Panel 3: Preview - show for HTML slices OR footer mode */}
        {(hasHtmlSlices || isFooterMode) && (
          <>
            <ResizableHandle className="w-px bg-border/30 hover:bg-border/60 transition-colors" />
            <ResizablePanel defaultSize={isFooterMode ? 39 : 33} minSize={25}>
              <div className="h-full overflow-auto bg-background">
                <div className="p-6 flex justify-center">
                  {isFooterMode ? (
                    /* Footer Mode: Footer preview - full height, no scroll */
                    <div className="flex flex-col items-center gap-4">
                      <span className="text-xs text-muted-foreground/60 uppercase tracking-wider">Footer Preview</span>
                      <div 
                        style={{ 
                          width: scaledWidth,
                          transform: `scale(${zoomLevel / 100})`,
                          transformOrigin: 'top left'
                        }}
                      >
                        <iframe
                          srcDoc={`<!DOCTYPE html><html><head><style>html,body{margin:0;padding:0;overflow:visible;height:auto;}</style></head><body><table width="${BASE_WIDTH}" style="width:${BASE_WIDTH}px;margin:0 auto;">${localFooterHtml || ''}</table></body></html>`}
                          title="Footer Preview"
                          style={{ 
                            border: 'none', 
                            width: BASE_WIDTH, 
                            height: '1200px',
                            display: 'block'
                          }}
                          sandbox="allow-same-origin"
                          className="rounded border border-border/30"
                        />
                      </div>
                    </div>
                  ) : (
                    <div 
                      style={{ 
                        transform: `scale(${zoomLevel / 100})`, 
                        transformOrigin: 'top left',
                        width: BASE_WIDTH,
                      }}
                    >
                      <CampaignPreviewFrame slices={slices} footerHtml={includeFooter ? localFooterHtml : undefined} width={BASE_WIDTH} />
                    </div>
                  )}
                </div>
              </div>
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
    </div>
  );
}
