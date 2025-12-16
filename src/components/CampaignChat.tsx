import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send, Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface CampaignChatProps {
  messages: ChatMessage[];
  onSendMessage: (message: string) => void;
  onAutoRefine: () => void;
  isLoading: boolean;
  isAutoRefining: boolean;
}

export function CampaignChat({ 
  messages, 
  onSendMessage, 
  onAutoRefine,
  isLoading,
  isAutoRefining,
}: CampaignChatProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || isAutoRefining) return;
    onSendMessage(input.trim());
    setInput('');
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex flex-col border-t border-border/50 max-h-80">
      {/* Auto-refine */}
      <div className="p-2 border-b border-border/50">
        <Button 
          onClick={onAutoRefine} 
          disabled={isLoading || isAutoRefining}
          variant="outline"
          size="sm"
          className="w-full h-7 text-[11px]"
        >
          {isAutoRefining ? (
            <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> Refining...</>
          ) : (
            <><Sparkles className="w-3 h-3 mr-1.5" /> Auto-refine</>
          )}
        </Button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[100px]">
        {messages.length === 0 ? (
          <p className="text-[10px] text-muted-foreground text-center py-2">
            "make button wider", "more spacing"
          </p>
        ) : (
          messages.map((message, index) => (
            <div
              key={index}
              className={cn(
                'text-[11px] px-2 py-1.5 rounded',
                message.role === 'user'
                  ? 'bg-primary text-primary-foreground ml-4'
                  : 'bg-muted/50 text-foreground mr-4'
              )}
            >
              {message.content}
            </div>
          ))
        )}
        {isLoading && !isAutoRefining && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span className="text-[10px]">Thinking...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-2 border-t border-border/50">
        <div className="flex gap-1.5">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Request a change..."
            disabled={isLoading || isAutoRefining}
            className="flex-1 h-7 text-[11px] bg-transparent border-border/50"
          />
          <Button type="submit" size="sm" className="h-7 w-7 p-0" disabled={!input.trim() || isLoading || isAutoRefining}>
            <Send className="w-3 h-3" />
          </Button>
        </div>
      </form>
    </div>
  );
}
