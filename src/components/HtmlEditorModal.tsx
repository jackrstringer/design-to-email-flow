import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { HtmlPreviewFrame } from './HtmlPreviewFrame';
import { RefinementChat, ChatMessage } from './RefinementChat';
import { Code, Eye, Check, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface HtmlEditorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  html: string;
  originalImageUrl: string;
  brandUrl?: string;
  onSave: (html: string) => void;
}

export function HtmlEditorModal({
  open,
  onOpenChange,
  html: initialHtml,
  originalImageUrl,
  brandUrl,
  onSave,
}: HtmlEditorModalProps) {
  const [html, setHtml] = useState(initialHtml);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isRefining, setIsRefining] = useState(false);
  const [activeTab, setActiveTab] = useState<'preview' | 'code'>('preview');

  const handleSendMessage = async (message: string) => {
    // Add user message
    setMessages((prev) => [...prev, { role: 'user', content: message }]);
    setIsRefining(true);

    try {
      const { data, error } = await supabase.functions.invoke('refine-slice-html', {
        body: {
          currentHtml: html,
          userRequest: message,
          originalImageUrl,
          brandUrl,
        },
      });

      if (error) throw error;

      if (data?.htmlContent) {
        setHtml(data.htmlContent);
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: data.message || 'Done! I\'ve updated the HTML.' },
        ]);
      }
    } catch (err) {
      console.error('Refinement error:', err);
      toast.error('Failed to apply changes');
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Sorry, I couldn\'t apply that change. Please try again.' },
      ]);
    } finally {
      setIsRefining(false);
    }
  };

  const handleSave = () => {
    onSave(html);
    onOpenChange(false);
  };

  const handleCancel = () => {
    setHtml(initialHtml);
    setMessages([]);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl h-[85vh] flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle>HTML Refinement Studio</DialogTitle>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={handleCancel}>
                <X className="w-4 h-4 mr-1" />
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave}>
                <Check className="w-4 h-4 mr-1" />
                Save Changes
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 flex overflow-hidden">
          {/* Left: Original Image */}
          <div className="w-1/3 border-r border-border flex flex-col">
            <div className="px-4 py-2 border-b border-border bg-muted/30">
              <span className="text-sm font-medium text-muted-foreground">Original Design</span>
            </div>
            <div className="flex-1 overflow-auto p-4 bg-muted/10">
              <img
                src={originalImageUrl}
                alt="Original design"
                className="w-full rounded border border-border"
              />
            </div>
          </div>

          {/* Middle: Preview/Code */}
          <div className="w-1/3 border-r border-border flex flex-col">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'preview' | 'code')} className="flex-1 flex flex-col">
              <div className="px-4 py-2 border-b border-border bg-muted/30">
                <TabsList className="h-8">
                  <TabsTrigger value="preview" className="text-xs h-7">
                    <Eye className="w-3 h-3 mr-1" />
                    Preview
                  </TabsTrigger>
                  <TabsTrigger value="code" className="text-xs h-7">
                    <Code className="w-3 h-3 mr-1" />
                    Code
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="preview" className="flex-1 m-0 overflow-hidden">
                <div className="h-full bg-white">
                  <HtmlPreviewFrame html={html} className="w-full h-full" />
                </div>
              </TabsContent>

              <TabsContent value="code" className="flex-1 m-0 overflow-hidden p-4">
                <Textarea
                  value={html}
                  onChange={(e) => setHtml(e.target.value)}
                  className="w-full h-full font-mono text-xs resize-none"
                  placeholder="HTML content..."
                />
              </TabsContent>
            </Tabs>
          </div>

          {/* Right: Chat */}
          <div className="w-1/3 flex flex-col">
            <div className="px-4 py-2 border-b border-border bg-muted/30">
              <span className="text-sm font-medium text-muted-foreground">AI Refinement</span>
            </div>
            <RefinementChat
              messages={messages}
              onSendMessage={handleSendMessage}
              isLoading={isRefining}
              className="flex-1"
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
