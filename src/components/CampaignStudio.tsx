import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronLeft, Rocket, FileText, Image, Code, Loader2, Link, Unlink, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { ProcessedSlice } from '@/types/slice';
import { CampaignPreviewFrame } from './CampaignPreviewFrame';
import { CampaignChat, ChatMessage } from './CampaignChat';

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
}: CampaignStudioProps) {
  const [convertingIndex, setConvertingIndex] = useState<number | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isRefining, setIsRefining] = useState(false);
  const [isAutoRefining, setIsAutoRefining] = useState(false);
  const [editingLinkIndex, setEditingLinkIndex] = useState<number | null>(null);

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
    // Add user message to chat
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

      // Add assistant response
      setChatMessages([...newMessages, { role: 'assistant', content: data.message || 'Changes applied!' }]);

      // Update slices if we got updated HTML
      if (data.updatedSlices) {
        const updatedSlices = slices.map((slice, i) => {
          const updated = data.updatedSlices[i];
          if (updated?.htmlContent && slice.type === 'html') {
            return { ...slice, htmlContent: updated.htmlContent };
          }
          return slice;
        });
        onSlicesChange(updatedSlices);
        toast.success('HTML updated');
      }
    } catch (err) {
      console.error('Chat error:', err);
      setChatMessages([...newMessages, { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' }]);
      toast.error('Failed to process request');
    } finally {
      setIsRefining(false);
    }
  };

  const handleAutoRefine = async () => {
    setIsAutoRefining(true);
    const newMessages: ChatMessage[] = [...chatMessages, { role: 'user', content: '[Auto-refine: Compare to original and fix styling]' }];
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
          userRequest: 'Compare the HTML render to the original design image. Identify any visual differences (colors, spacing, typography, button styles, alignment) and update the HTML to match the original design as closely as possible.',
          brandUrl,
          mode: 'auto-refine',
        }
      });

      if (error) throw new Error(error.message);

      setChatMessages([...newMessages, { role: 'assistant', content: data.message || 'Auto-refinement complete!' }]);

      if (data.updatedSlices) {
        const updatedSlices = slices.map((slice, i) => {
          const updated = data.updatedSlices[i];
          if (updated?.htmlContent && slice.type === 'html') {
            return { ...slice, htmlContent: updated.htmlContent };
          }
          return slice;
        });
        onSlicesChange(updatedSlices);
        toast.success('Campaign refined');
      }
    } catch (err) {
      console.error('Auto-refine error:', err);
      setChatMessages([...newMessages, { role: 'assistant', content: 'Auto-refinement failed. Please try again.' }]);
      toast.error('Auto-refine failed');
    } finally {
      setIsAutoRefining(false);
    }
  };

  const hasHtmlSlices = slices.some(s => s.type === 'html');

  return (
    <div className="flex h-[calc(100vh-12rem)] gap-4">
      {/* Left Panel - Slices */}
      <div className="w-[380px] flex-shrink-0 flex flex-col border border-border rounded-lg bg-card">
        <div className="p-3 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-foreground">Slices</h3>
            <p className="text-xs text-muted-foreground">{slices.length} sections</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onBack} disabled={isCreating}>
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {slices.map((slice, index) => (
            <div
              key={index}
              className={cn(
                'p-2 rounded-lg border bg-muted/30',
                slice.type === 'html' ? 'border-blue-500/50' : 'border-border'
              )}
            >
              <div className="flex gap-2">
                {/* Thumbnail */}
                <div className="w-16 h-16 flex-shrink-0 rounded overflow-hidden border border-border bg-background">
                  <img
                    src={slice.imageUrl}
                    alt={slice.altText}
                    className="w-full h-full object-cover object-top"
                  />
                </div>

                {/* Controls */}
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      Slice {index + 1}
                    </span>

                    {/* Type toggle */}
                    <button
                      onClick={() => toggleSliceType(index)}
                      disabled={convertingIndex !== null || isCreating}
                      className={cn(
                        'flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium transition-colors',
                        slice.type === 'html'
                          ? 'bg-blue-500/20 text-blue-600 hover:bg-blue-500/30'
                          : 'bg-muted text-muted-foreground hover:bg-muted/80'
                      )}
                    >
                      {convertingIndex === index ? (
                        <><Loader2 className="w-3 h-3 animate-spin" /> Converting...</>
                      ) : slice.type === 'html' ? (
                        <><Code className="w-3 h-3" /> HTML</>
                      ) : (
                        <><Image className="w-3 h-3" /> Image</>
                      )}
                    </button>
                  </div>

                  {slice.type === 'image' && (
                    <>
                      <Input
                        value={slice.altText}
                        onChange={(e) => updateSlice(index, { altText: e.target.value })}
                        placeholder="Alt text"
                        className="h-6 text-xs"
                      />
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => toggleLink(index)}
                          className={cn(
                            'flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium transition-colors',
                            slice.link !== null
                              ? 'bg-primary/10 text-primary hover:bg-primary/20'
                              : 'bg-muted text-muted-foreground hover:bg-muted/80'
                          )}
                        >
                          {slice.link !== null ? <Link className="w-3 h-3" /> : <Unlink className="w-3 h-3" />}
                        </button>
                        {slice.link !== null && (
                          <Input
                            value={slice.link}
                            onChange={(e) => updateSlice(index, { link: e.target.value })}
                            placeholder="https://..."
                            className="h-6 text-xs flex-1"
                            autoFocus={editingLinkIndex === index}
                            onBlur={() => setEditingLinkIndex(null)}
                          />
                        )}
                      </div>
                    </>
                  )}

                  {slice.type === 'html' && (
                    <p className="text-xs text-blue-600">Ready for refinement</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="p-3 border-t border-border space-y-2">
          <Button
            variant="outline"
            onClick={onCreateTemplate}
            disabled={isCreating || convertingIndex !== null}
            className="w-full"
            size="sm"
          >
            <FileText className="w-4 h-4 mr-2" />
            Create Template
          </Button>
          <Button
            onClick={onCreateCampaign}
            disabled={isCreating || convertingIndex !== null}
            className="w-full"
            size="sm"
          >
            <Rocket className="w-4 h-4 mr-2" />
            {isCreating ? 'Creating...' : 'Create Campaign'}
          </Button>
        </div>
      </div>

      {/* Right Panel - Preview + Chat */}
      <div className="flex-1 flex flex-col border border-border rounded-lg bg-card overflow-hidden">
        {/* Preview Header */}
        <div className="p-3 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-foreground">Live Preview</h3>
            <p className="text-xs text-muted-foreground">
              {hasHtmlSlices ? 'HTML + Images combined' : 'All image slices'}
            </p>
          </div>
        </div>

        {/* Split Preview - Original vs Rendered */}
        <div className="flex-1 flex overflow-hidden">
          {/* Original Image */}
          <div className="w-1/2 border-r border-border overflow-auto bg-muted/20">
            <div className="p-2 text-xs text-muted-foreground text-center border-b border-border bg-muted/50">
              Original Design
            </div>
            <div className="p-2">
              <img
                src={originalImageUrl}
                alt="Original campaign"
                className="w-full h-auto"
              />
            </div>
          </div>

          {/* Live Preview */}
          <div className="w-1/2 flex flex-col overflow-hidden">
            <div className="p-2 text-xs text-muted-foreground text-center border-b border-border bg-muted/50">
              HTML Render
            </div>
            <div className="flex-1 overflow-auto">
              <CampaignPreviewFrame slices={slices} className="w-full h-full min-h-[400px]" />
            </div>
          </div>
        </div>

        {/* Chat Panel */}
        <CampaignChat
          messages={chatMessages}
          onSendMessage={handleSendMessage}
          onAutoRefine={handleAutoRefine}
          isLoading={isRefining}
          isAutoRefining={isAutoRefining}
          className="h-[280px]"
        />
      </div>
    </div>
  );
}
