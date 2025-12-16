import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send, Loader2, User, Bot, Sparkles } from 'lucide-react';
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
  className?: string;
}

export function CampaignChat({ 
  messages, 
  onSendMessage, 
  onAutoRefine,
  isLoading,
  isAutoRefining,
  className 
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
    <div className={cn('flex flex-col border-t border-border', className)}>
      {/* Auto-refine button */}
      <div className="p-3 border-b border-border bg-muted/30">
        <Button 
          onClick={onAutoRefine} 
          disabled={isLoading || isAutoRefining}
          variant="outline"
          className="w-full"
        >
          {isAutoRefining ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Refining Campaign...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 mr-2" />
              Refine Campaign
            </>
          )}
        </Button>
        <p className="text-xs text-muted-foreground text-center mt-2">
          AI will compare to original and fix styling differences
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-[120px] max-h-[200px]">
        {messages.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm py-4">
            Chat with AI about specific changes: "make the button wider", "increase spacing"
          </div>
        ) : (
          messages.map((message, index) => (
            <div
              key={index}
              className={cn(
                'flex gap-2 items-start',
                message.role === 'user' ? 'justify-end' : 'justify-start'
              )}
            >
              {message.role === 'assistant' && (
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-3.5 h-3.5 text-primary" />
                </div>
              )}
              <div
                className={cn(
                  'px-3 py-2 rounded-lg text-sm max-w-[80%]',
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-foreground'
                )}
              >
                {message.content}
              </div>
              {message.role === 'user' && (
                <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                  <User className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
              )}
            </div>
          ))
        )}
        {isLoading && !isAutoRefining && (
          <div className="flex gap-2 items-start">
            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Bot className="w-3.5 h-3.5 text-primary" />
            </div>
            <div className="px-3 py-2 rounded-lg bg-muted">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-3 border-t border-border">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Request a specific change..."
            disabled={isLoading || isAutoRefining}
            className="flex-1"
          />
          <Button type="submit" size="icon" disabled={!input.trim() || isLoading || isAutoRefining}>
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </form>
    </div>
  );
}
