import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { ChevronLeft, Rocket, FileText, Image, Code, Loader2, Link, Unlink, ExternalLink, CheckCircle, Sparkles, PanelLeftClose, PanelLeft } from 'lucide-react';
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
  const [zoomLevel, setZoomLevel] = useState(65);
  const [chatExpanded, setChatExpanded] = useState(true);
  const [sliceDimensions, setSliceDimensions] = useState<SliceDimensions[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  // Calculate slice dimensions from actual slice images
  useEffect(() => {
    const loadSliceHeights = async () => {
      const dims: SliceDimensions[] = [];
      let cumulativeTop = 0;

      for (const slice of slices) {
        const height = await new Promise<number>((resolve) => {
          const img = new window.Image();
          img.onload = () => {
            // Scale height proportionally to BASE_WIDTH
            const scale = BASE_WIDTH / img.naturalWidth;
            resolve(img.naturalHeight * scale);
          };
          img.onerror = () => resolve(100); // fallback
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

  const toggleLink = (index: number) => {
    const slice = slices[index];
    if (slice.link) {
      updateSlice(index, { link: null, isClickable: false });
    } else {
      updateSlice(index, { link: '', isClickable: true });
      setEditingLinkIndex(index);
    }
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

  const hasHtmlSlices = slices.some(s => s.type === 'html');

  return (
    <div className="h-screen w-full flex flex-col">
      {/* Header */}
      <div className="h-12 px-4 flex items-center justify-between border-b border-border/50 flex-shrink-0">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onBack} disabled={isCreating} className="h-8 px-2 text-xs">
            <ChevronLeft className="w-3 h-3 mr-1" />
            Back
          </Button>
          <button
            onClick={() => setChatExpanded(!chatExpanded)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {chatExpanded ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeft className="w-4 h-4" />}
            {chatExpanded ? 'Hide Chat' : 'Show Chat'}
          </button>
          <span className="text-sm text-muted-foreground">{slices.length} slices</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Zoom</span>
            <Slider
              value={[zoomLevel]}
              onValueChange={([v]) => setZoomLevel(v)}
              min={25}
              max={150}
              step={5}
              className="w-24"
            />
            <span className="text-xs text-muted-foreground w-8">{zoomLevel}%</span>
          </div>
          {templateId ? (
            <>
              <div className="flex items-center gap-1.5 text-green-600 text-xs">
                <CheckCircle className="w-3.5 h-3.5" />
                <span>{campaignId ? 'Campaign' : 'Template'} created</span>
              </div>
              {campaignId ? (
                <Button
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => window.open(`https://www.klaviyo.com/email-template-editor/campaign/${campaignId}/content/edit`, '_blank')}
                >
                  <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                  Open Editor
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => window.open(`https://www.klaviyo.com/email-templates/${templateId}`, '_blank')}
                >
                  <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                  View Template
                </Button>
              )}
              {onReset && (
                <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={onReset}>
                  New Upload
                </Button>
              )}
            </>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={onCreateTemplate}
                disabled={isCreating || convertingIndex !== null}
                className="h-8 text-xs"
              >
                <FileText className="w-3.5 h-3.5 mr-1.5" />
                Template
              </Button>
              <Button
                size="sm"
                onClick={onCreateCampaign}
                disabled={isCreating || convertingIndex !== null}
                className="h-8 text-xs"
              >
                <Rocket className="w-3.5 h-3.5 mr-1.5" />
                {isCreating ? 'Creating...' : 'Campaign'}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Resizable Panels */}
      <ResizablePanelGroup direction="horizontal" className="flex-1">
        {/* Panel 1: Chat */}
        {chatExpanded && (
          <>
            <ResizablePanel defaultSize={20} minSize={15} maxSize={35}>
              <div className="h-full flex flex-col border-r border-border/50">
                <div className="px-3 py-2 border-b border-border/50">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5" />
                    AI Refinement
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
            <ResizableHandle withHandle />
          </>
        )}

        {/* Panel 2: Slice Details - Notion-style minimal */}
        <ResizablePanel defaultSize={chatExpanded ? 25 : 30} minSize={15} maxSize={50}>
          <div className="h-full overflow-auto">
            {slices.map((slice, index) => (
              <div key={index} className="group">
                {/* Slice header - minimal */}
                <div className="px-4 py-3 flex items-center gap-3 border-b border-transparent hover:bg-muted/30 transition-colors">
                  <span className="text-sm text-foreground/80">{index + 1}</span>
                  <button
                    onClick={() => toggleSliceType(index)}
                    disabled={convertingIndex !== null || isCreating}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {convertingIndex === index ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : slice.type === 'html' ? (
                      <span className="flex items-center gap-1.5">
                        <Code className="w-3.5 h-3.5" />
                        html
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5">
                        <Image className="w-3.5 h-3.5" />
                        image
                      </span>
                    )}
                  </button>
                  <span className="text-[11px] text-muted-foreground/60 ml-auto">
                    {sliceDimensions[index] ? `${BASE_WIDTH}×${Math.round(sliceDimensions[index].height)}` : ''}
                  </span>
                </div>

                {/* Properties - Notion style */}
                <div className="px-4 pb-4 space-y-1">
                  {/* Link row */}
                  <div 
                    className="flex items-center gap-2 py-1.5 rounded hover:bg-muted/30 transition-colors cursor-pointer -mx-2 px-2"
                    onClick={() => !slice.link && toggleLink(index)}
                  >
                    <Link className={cn(
                      "w-4 h-4 flex-shrink-0",
                      slice.link ? "text-foreground/60" : "text-muted-foreground/40"
                    )} />
                    {slice.link !== null ? (
                      <Input
                        value={slice.link}
                        onChange={(e) => updateSlice(index, { link: e.target.value })}
                        placeholder="Add link..."
                        className="h-7 text-sm flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0 px-0"
                        onClick={(e) => e.stopPropagation()}
                        onBlur={() => setEditingLinkIndex(null)}
                      />
                    ) : (
                      <span className="text-sm text-muted-foreground/50">Add link...</span>
                    )}
                    {slice.link && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); toggleLink(index); }}
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground/40 hover:text-foreground/60 transition-opacity"
                      >
                        <Unlink className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Alt text row */}
                  <div className="py-1.5 -mx-2 px-2 rounded hover:bg-muted/30 transition-colors">
                    <Textarea
                      value={slice.altText}
                      onChange={(e) => updateSlice(index, { altText: e.target.value })}
                      placeholder="Add description..."
                      className="text-sm border-0 bg-transparent shadow-none focus-visible:ring-0 resize-none min-h-[60px] p-0"
                    />
                  </div>
                </div>

                {/* Subtle divider */}
                {index < slices.length - 1 && (
                  <div className="h-px bg-border/30 mx-4" />
                )}
              </div>
            ))}
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle />

        {/* Panel 3: Original Campaign */}
        <ResizablePanel defaultSize={chatExpanded ? 30 : 40} minSize={20}>
          <div className="h-full overflow-auto border-r border-border/50" ref={containerRef}>
            <div 
              className="p-4"
              style={{ 
                transform: `scale(${zoomLevel / 100})`, 
                transformOrigin: 'top left',
              }}
            >
              <div className="relative">
                <img
                  src={originalImageUrl}
                  alt="Original"
                  style={{ width: `${BASE_WIDTH}px` }}
                  className="max-w-none"
                />
                {sliceDimensions.slice(1).map((dim, i) => (
                  <div
                    key={i}
                    className="absolute left-0 right-0 h-0.5 bg-red-500"
                    style={{ top: dim.top }}
                  />
                ))}
              </div>
            </div>
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle />

        {/* Panel 4: Preview */}
        <ResizablePanel defaultSize={25} minSize={15}>
          <div className="h-full overflow-auto">
            <div 
              className="p-4"
              style={{ 
                transform: `scale(${zoomLevel / 100})`, 
                transformOrigin: 'top left',
              }}
            >
              <CampaignPreviewFrame slices={slices} width={BASE_WIDTH} />
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
