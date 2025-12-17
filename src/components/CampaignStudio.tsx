import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { ChevronLeft, Rocket, FileText, Link, X, ExternalLink, CheckCircle, Sparkles, PanelLeftClose, PanelLeft, Loader2, Image, Code2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { ProcessedSlice } from '@/types/slice';
import { CampaignPreviewFrame } from './CampaignPreviewFrame';
import { CampaignChat, ChatMessage } from './CampaignChat';

const BASE_WIDTH = 600;

interface CampaignStudioProps {
  slices: ProcessedSlice[];
  onSlicesChange: (slices: ProcessedSlice[]) => void;
  originalImageUrl: string;
  brandUrl: string;
  brandLinks?: string[];
  onBack: () => void;
  onCreateTemplate: () => void;
  onCreateCampaign: () => void;
  onConvertToHtml: (index: number) => Promise<void>;
  isCreating: boolean;
  templateId?: string | null;
  campaignId?: string | null;
  onReset?: () => void;
}

interface SliceDimensions {
  height: number;
  top: number;
}

export function CampaignStudio({
  slices,
  onSlicesChange,
  originalImageUrl,
  brandUrl,
  brandLinks = [],
  onBack,
  onCreateTemplate,
  onCreateCampaign,
  onConvertToHtml,
  isCreating,
  templateId,
  campaignId,
  onReset,
}: CampaignStudioProps) {
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

  const hasHtmlSlices = slices.some(s => s.type === 'html');

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
          originalCampaignImageUrl: originalImageUrl,
          conversationHistory: newMessages,
          userRequest: message,
          brandUrl,
          mode: 'chat',
        }
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      setChatMessages([...newMessages, { role: 'assistant', content: data.message || 'Changes applied!' }]);

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
          originalCampaignImageUrl: originalImageUrl,
          conversationHistory: newMessages,
          userRequest: 'Compare the HTML render to the original design image. Identify any visual differences and update the HTML to match the original design as closely as possible.',
          brandUrl,
          mode: 'auto-refine',
        }
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      setChatMessages([...newMessages, { role: 'assistant', content: data.message || 'Refinement complete!' }]);

      if (data.updatedSlices && data.updatedSlices.length > 0) {
        const updatedSlices = slices.map((slice, i) => {
          const updated = data.updatedSlices.find((u: any) => u.index === i);
          if (updated?.htmlContent && slice.type === 'html') {
            return { ...slice, htmlContent: updated.htmlContent };
          }
          return slice;
        });
        onSlicesChange(updatedSlices);
        toast.success('Campaign refined');
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
          <span className="text-xs text-muted-foreground/60">{slices.length} slices</span>
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
          
          {templateId ? (
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
                    : `https://www.klaviyo.com/email-templates/${templateId}`,
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
                onClick={onCreateTemplate}
                disabled={isCreating || convertingIndex !== null}
                className="h-7 text-xs px-2 text-muted-foreground"
              >
                <FileText className="w-3 h-3 mr-1" />
                Template
              </Button>
              <Button
                size="sm"
                onClick={onCreateCampaign}
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

        {/* Panel 2: Combined Campaign + Details */}
        <ResizablePanel defaultSize={hasHtmlSlices ? 45 : (chatExpanded ? 78 : 100)} minSize={35}>
          <div className="h-full overflow-auto bg-muted/20">
            <div className="p-6 flex justify-center">
              <div className="flex flex-col">
              {/* Stacked slices with inline details */}
              {slices.map((slice, index) => (
                <div key={index} className="flex items-stretch border-b border-border/20 last:border-b-0">
                  {/* Slice details - generous width for readability */}
                  <div className="min-w-[320px] w-96 flex-shrink-0 p-4 space-y-3">
                    {/* Row 1: Type toggle + Link + dimensions - all inline */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Compact icon toggle */}
                      <button
                        onClick={() => toggleSliceType(index)}
                        disabled={convertingIndex !== null || isCreating}
                        className={cn(
                          "h-6 w-6 rounded flex items-center justify-center transition-colors",
                          slice.type === 'html' 
                            ? "bg-primary/10 text-primary" 
                            : "bg-muted text-muted-foreground hover:bg-muted/80",
                          (convertingIndex !== null || isCreating) && "opacity-50 cursor-not-allowed"
                        )}
                        title={slice.type === 'html' ? 'HTML (click for image)' : 'Image (click for HTML)'}
                      >
                        {convertingIndex === index ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : slice.type === 'html' ? (
                          <Code2 className="w-3.5 h-3.5" />
                        ) : (
                          <Image className="w-3.5 h-3.5" />
                        )}
                      </button>

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
                            <button className="inline-flex items-center gap-1.5 px-2 py-1 bg-muted/60 rounded-md text-xs hover:bg-muted/80 transition-colors">
                              <Link className="w-3 h-3 text-muted-foreground/60 flex-shrink-0" />
                              <span className="text-foreground/80 break-all text-left">{slice.link}</span>
                            </button>
                          ) : (
                            <button className="flex items-center gap-1 text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors text-xs">
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

                    {/* Row 2: Alt text (smaller) */}
                    {editingAltIndex === index ? (
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
              </div>
            </div>
          </div>
        </ResizablePanel>

        {/* Panel 3: Preview - only show if HTML slices exist */}
        {hasHtmlSlices && (
          <>
            <ResizableHandle className="w-px bg-border/30 hover:bg-border/60 transition-colors" />
            <ResizablePanel defaultSize={33} minSize={25}>
              <div className="h-full overflow-auto bg-background">
                <div className="p-6">
                  <div 
                    style={{ 
                      transform: `scale(${zoomLevel / 100})`, 
                      transformOrigin: 'top left',
                      width: BASE_WIDTH,
                    }}
                  >
                    <CampaignPreviewFrame slices={slices} width={BASE_WIDTH} />
                  </div>
                </div>
              </div>
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
    </div>
  );
}
