import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronLeft, Rocket, FileText, Image, Code, Loader2, Link, Unlink, ExternalLink, CheckCircle, MessageSquare, ChevronRight, Sparkles } from 'lucide-react';
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
  const [zoomLevel, setZoomLevel] = useState(70);
  const [chatExpanded, setChatExpanded] = useState(true);
  const [sliceDimensions, setSliceDimensions] = useState<SliceDimensions[]>([]);
  const imageRef = useRef<HTMLImageElement>(null);

  // Calculate slice dimensions when image loads
  useEffect(() => {
    const img = imageRef.current;
    if (!img) return;

    const calculateDimensions = () => {
      const totalHeight = img.naturalHeight;
      const displayHeight = img.clientHeight;
      const scale = displayHeight / totalHeight;
      
      // Assuming slices divide the image evenly for now
      // In practice, this would use actual slice boundaries
      const sliceHeight = displayHeight / slices.length;
      const dims = slices.map((_, i) => ({
        height: sliceHeight,
        top: i * sliceHeight,
      }));
      setSliceDimensions(dims);
    };

    if (img.complete) {
      calculateDimensions();
    }
    img.addEventListener('load', calculateDimensions);
    window.addEventListener('resize', calculateDimensions);

    return () => {
      img.removeEventListener('load', calculateDimensions);
      window.removeEventListener('resize', calculateDimensions);
    };
  }, [slices.length, originalImageUrl]);

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
    <div className="flex h-screen">
      {/* Left Column - Chat (collapsible) */}
      <Collapsible open={chatExpanded} onOpenChange={setChatExpanded} className="flex">
        <CollapsibleContent className="w-80 flex flex-col border-r border-border/50 bg-background">
          {/* Header */}
          <div className="h-12 px-3 flex items-center justify-between border-b border-border/50">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5" />
              AI Refinement
            </span>
            <Button variant="ghost" size="sm" onClick={onBack} disabled={isCreating} className="h-7 px-2 text-[11px]">
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

          {/* Actions */}
          <div className="p-3 border-t border-border/50 space-y-2">
            {templateId ? (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-green-600 text-[11px] px-1">
                  <CheckCircle className="w-3 h-3" />
                  <span>{campaignId ? 'Campaign' : 'Template'} created</span>
                </div>
                {campaignId ? (
                  <Button
                    size="sm"
                    className="w-full h-8 text-[11px]"
                    onClick={() => window.open(`https://www.klaviyo.com/email-template-editor/campaign/${campaignId}/content/edit`, '_blank')}
                  >
                    <ExternalLink className="w-3 h-3 mr-1.5" />
                    Open Editor
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className="w-full h-8 text-[11px]"
                    onClick={() => window.open(`https://www.klaviyo.com/email-templates/${templateId}`, '_blank')}
                  >
                    <ExternalLink className="w-3 h-3 mr-1.5" />
                    View Template
                  </Button>
                )}
                {onReset && (
                  <Button variant="ghost" size="sm" className="w-full h-7 text-[11px] text-muted-foreground" onClick={onReset}>
                    Upload another
                  </Button>
                )}
              </div>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={onCreateTemplate}
                  disabled={isCreating || convertingIndex !== null}
                  className="w-full h-8 text-[11px]"
                >
                  <FileText className="w-3 h-3 mr-1.5" />
                  Create Template
                </Button>
                <Button
                  onClick={onCreateCampaign}
                  disabled={isCreating || convertingIndex !== null}
                  className="w-full h-8 text-[11px]"
                >
                  <Rocket className="w-3 h-3 mr-1.5" />
                  {isCreating ? 'Creating...' : 'Create Campaign'}
                </Button>
              </>
            )}
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
          <span className="text-[11px] text-muted-foreground">Campaign · {slices.length} slices</span>
          <div className="flex items-center gap-2">
            <Slider
              value={[zoomLevel]}
              onValueChange={([v]) => setZoomLevel(v)}
              min={25}
              max={150}
              step={5}
              className="w-20"
            />
            <span className="text-[10px] text-muted-foreground w-8">{zoomLevel}%</span>
          </div>
        </div>
        <div className="flex-1 overflow-auto bg-muted/10">
          <div className="p-4">
            <div 
              className="flex"
              style={{ 
                transform: `scale(${zoomLevel / 100})`, 
                transformOrigin: 'top left',
              }}
            >
              {/* Slice details column */}
              <div className="w-48 flex-shrink-0 pr-3">
                {slices.map((slice, index) => (
                  <div
                    key={index}
                    className="relative"
                    style={{ 
                      height: sliceDimensions[index]?.height || 'auto',
                      minHeight: 80,
                    }}
                  >
                    <div className="sticky top-0 space-y-1.5 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground font-medium">{index + 1}</span>
                        <button
                          onClick={() => toggleSliceType(index)}
                          disabled={convertingIndex !== null || isCreating}
                          className={cn(
                            'flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors border',
                            slice.type === 'html'
                              ? 'text-blue-600 border-blue-200 bg-blue-50'
                              : 'text-muted-foreground border-border/50 hover:border-border'
                          )}
                        >
                          {convertingIndex === index ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : slice.type === 'html' ? (
                            <>
                              <Code className="w-3 h-3" />
                              <span>HTML</span>
                            </>
                          ) : (
                            <>
                              <Image className="w-3 h-3" />
                              <span>Image</span>
                            </>
                          )}
                        </button>
                      </div>

                      <Input
                        value={slice.altText}
                        onChange={(e) => updateSlice(index, { altText: e.target.value })}
                        placeholder="Alt text..."
                        className="h-6 text-[10px] bg-background border-border/50"
                      />

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => toggleLink(index)}
                          className={cn(
                            'p-1 rounded transition-colors',
                            slice.link !== null
                              ? 'text-primary'
                              : 'text-muted-foreground hover:text-foreground'
                          )}
                        >
                          {slice.link !== null ? <Link className="w-3 h-3" /> : <Unlink className="w-3 h-3" />}
                        </button>
                        {slice.link !== null && (
                          <Input
                            value={slice.link}
                            onChange={(e) => updateSlice(index, { link: e.target.value })}
                            placeholder="https://..."
                            className="h-6 text-[10px] flex-1 bg-background border-border/50"
                            autoFocus={editingLinkIndex === index}
                            onBlur={() => setEditingLinkIndex(null)}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Campaign image with red slice lines */}
              <div className="relative">
                <img
                  ref={imageRef}
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

      {/* Right Column - Preview */}
      <div className="flex-1 flex flex-col min-w-0 border-l border-border/50">
        <div className="h-12 px-4 flex items-center border-b border-border/50">
          <span className="text-[11px] text-muted-foreground">
            {hasHtmlSlices ? 'HTML Preview' : 'Preview'}
          </span>
        </div>
        <div className="flex-1 overflow-auto bg-muted/10">
          <div className="p-4">
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
