import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send, Sparkles, Loader2 } from 'lucide-react';
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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      onSendMessage(input.trim());
      setInput('');
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Auto-refine button - orange */}
      <div className="p-3 border-b border-border/50">
        <Button
          onClick={onAutoRefine}
          disabled={isLoading || isAutoRefining}
          className="w-full h-9 text-[11px] bg-orange-500 hover:bg-orange-600 text-white"
        >
          {isAutoRefining ? (
            <>
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              Refining...
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5 mr-1.5" />
              Refine with AI
            </>
          )}
        </Button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <p className="text-[11px] text-muted-foreground text-center py-4">
            Ask AI to refine the HTML, or use auto-refine to match the original design.
          </p>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={cn(
              'text-[11px] p-2 rounded-md',
              msg.role === 'user'
                ? 'bg-primary/10 ml-4'
                : 'bg-muted/50 mr-4'
            )}
          >
            {msg.content}
          </div>
        ))}
        {isLoading && (
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Loader2 className="w-3 h-3 animate-spin" />
            Thinking...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-3 border-t border-border/50">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Describe changes..."
            className="h-8 text-[11px] bg-background"
            disabled={isLoading}
          />
          <Button
            type="submit"
            size="sm"
            disabled={!input.trim() || isLoading}
            className="h-8 px-3"
          >
            <Send className="w-3.5 h-3.5" />
          </Button>
        </div>
      </form>
    </div>
  );
}
