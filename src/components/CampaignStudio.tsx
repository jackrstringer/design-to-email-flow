import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronLeft, Rocket, FileText, Image, Code, Loader2, Link, Unlink, ExternalLink, CheckCircle, Sparkles, ChevronRight } from 'lucide-react';
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
    <div className="flex h-screen w-full">
      {/* Left Column - Chat (collapsible) */}
      <Collapsible open={chatExpanded} onOpenChange={setChatExpanded} className="flex flex-shrink-0">
        <CollapsibleContent className="w-80 flex flex-col border-r border-border/50 bg-background">
          {/* Header */}
          <div className="h-12 px-3 flex items-center justify-between border-b border-border/50">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5" />
              AI Refinement
            </span>
            <Button variant="ghost" size="sm" onClick={onBack} disabled={isCreating} className="h-7 px-2 text-xs">
              <ChevronLeft className="w-3 h-3 mr-1" />
              Back
            </Button>
          </div>

          {/* Chat */}
          <div className="flex-1 overflow-hidden">
            <CampaignChat
              messages={chatMessages}
              onSendMessage={handleSendMessage}
              onAutoRefine={handleAutoRefine}
              isLoading={isRefining}
              isAutoRefining={isAutoRefining}
            />
          </div>
        </CollapsibleContent>

        {/* Collapse Toggle */}
        <CollapsibleTrigger asChild>
          <button className="w-6 flex-shrink-0 flex items-center justify-center border-r border-border/50 hover:bg-muted/30 transition-colors">
            <ChevronRight className={cn('w-4 h-4 text-muted-foreground transition-transform', chatExpanded && 'rotate-180')} />
          </button>
        </CollapsibleTrigger>
      </Collapsible>

      {/* Center Column - Original with inline slice details */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="h-12 px-4 flex items-center justify-between border-b border-border/50">
          <span className="text-sm text-muted-foreground">Campaign · {slices.length} slices</span>
          <div className="flex items-center gap-3">
            <Slider
              value={[zoomLevel]}
              onValueChange={([v]) => setZoomLevel(v)}
              min={25}
              max={150}
              step={5}
              className="w-24"
            />
            <span className="text-xs text-muted-foreground w-10">{zoomLevel}%</span>
          </div>
        </div>
        <div className="flex-1 overflow-auto bg-muted/5" ref={containerRef}>
          <div className="p-6">
            <div 
              className="flex gap-6"
              style={{ 
                transform: `scale(${zoomLevel / 100})`, 
                transformOrigin: 'top left',
              }}
            >
              {/* Slice details column */}
              <div className="w-[360px] flex-shrink-0">
                {slices.map((slice, index) => (
                  <div
                    key={index}
                    className="border-b border-border/30 last:border-b-0"
                    style={{ 
                      height: sliceDimensions[index]?.height || 120,
                    }}
                  >
                    <div className="py-4 pr-4 space-y-3 h-full flex flex-col">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-sm font-semibold text-foreground">Slice {index + 1}</span>
                        <button
                          onClick={() => toggleSliceType(index)}
                          disabled={convertingIndex !== null || isCreating}
                          className={cn(
                            'flex items-center gap-1.5 px-2.5 py-1.5 rounded text-sm transition-colors border',
                            slice.type === 'html'
                              ? 'text-blue-600 border-blue-200 bg-blue-50'
                              : 'text-muted-foreground border-border/50 hover:border-border'
                          )}
                        >
                          {convertingIndex === index ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : slice.type === 'html' ? (
                            <>
                              <Code className="w-4 h-4" />
                              <span>HTML</span>
                            </>
                          ) : (
                            <>
                              <Image className="w-4 h-4" />
                              <span>Image</span>
                            </>
                          )}
                        </button>
                        {sliceDimensions[index] && (
                          <span className="text-xs text-muted-foreground">
                            {BASE_WIDTH} × {Math.round(sliceDimensions[index].height)}px
                          </span>
                        )}
                      </div>

                      <div className="flex-1 flex flex-col gap-2">
                        {/* Link input - moved before alt text */}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => toggleLink(index)}
                            className={cn(
                              'p-2 rounded transition-colors flex-shrink-0',
                              slice.link !== null
                                ? 'text-primary bg-primary/10'
                                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                            )}
                          >
                            {slice.link !== null ? <Link className="w-4 h-4" /> : <Unlink className="w-4 h-4" />}
                          </button>
                          {slice.link !== null && (
                            <Input
                              value={slice.link}
                              onChange={(e) => updateSlice(index, { link: e.target.value })}
                              placeholder="https://..."
                              className="h-9 text-sm flex-1 bg-background border-border/50"
                              autoFocus={editingLinkIndex === index}
                              onBlur={() => setEditingLinkIndex(null)}
                            />
                          )}
                        </div>

                        {/* Alt text */}
                        <Textarea
                          value={slice.altText}
                          onChange={(e) => updateSlice(index, { altText: e.target.value })}
                          placeholder="Alt text description..."
                          className="text-sm bg-background border-border/50 resize-none flex-1 min-h-[60px]"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Campaign image with red slice lines */}
              <div className="relative flex-shrink-0">
                <img
                  src={originalImageUrl}
                  alt="Original"
                  style={{ width: `${BASE_WIDTH}px` }}
                  className="max-w-none"
                />
                {/* Red slice separator lines */}
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
        </div>
      </div>

      {/* Right Column - Preview + Actions */}
      <div className="flex-1 flex flex-col min-w-0 border-l border-border/50">
        <div className="h-12 px-4 flex items-center justify-between border-b border-border/50">
          <span className="text-sm text-muted-foreground">
            {hasHtmlSlices ? 'HTML Preview' : 'Preview'}
          </span>
          
          {/* Action buttons - always visible */}
          <div className="flex items-center gap-2">
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
                  Create Template
                </Button>
                <Button
                  size="sm"
                  onClick={onCreateCampaign}
                  disabled={isCreating || convertingIndex !== null}
                  className="h-8 text-xs"
                >
                  <Rocket className="w-3.5 h-3.5 mr-1.5" />
                  {isCreating ? 'Creating...' : 'Create Campaign'}
                </Button>
              </>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-auto bg-muted/5">
          <div className="p-6">
            <div 
              style={{ 
                transform: `scale(${zoomLevel / 100})`, 
                transformOrigin: 'top left',
              }}
            >
              <CampaignPreviewFrame slices={slices} width={BASE_WIDTH} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
