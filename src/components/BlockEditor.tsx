import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Code, Image, Link, Type } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EmailBlock } from '@/types/email-blocks';

interface BlockEditorProps {
  block: EmailBlock;
  onUpdate: (blockId: string, updates: Partial<EmailBlock>) => void;
}

export const BlockEditor = ({ block, onUpdate }: BlockEditorProps) => {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border p-4 shadow-lg animate-in slide-in-from-bottom-4">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">
            Editing: {block.name}
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Block Type Toggle */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Block Type</Label>
            <div className="flex gap-2">
              <Button
                variant={block.type === 'code' ? 'default' : 'outline'}
                size="sm"
                onClick={() => onUpdate(block.id, { type: 'code' })}
                className="flex-1"
              >
                <Code className="w-4 h-4 mr-2" />
                Code
              </Button>
              <Button
                variant={block.type === 'image' ? 'default' : 'outline'}
                size="sm"
                onClick={() => onUpdate(block.id, { type: 'image' })}
                className="flex-1"
              >
                <Image className="w-4 h-4 mr-2" />
                Image
              </Button>
            </div>
          </div>

          {/* Link URL */}
          <div className="space-y-2">
            <Label htmlFor="link" className="text-xs text-muted-foreground flex items-center gap-1">
              <Link className="w-3 h-3" />
              Link URL
            </Label>
            <Input
              id="link"
              value={block.suggestedLink || ''}
              onChange={(e) => onUpdate(block.id, { suggestedLink: e.target.value })}
              placeholder="https://..."
              className="h-9"
            />
          </div>

          {/* Alt Text */}
          <div className="space-y-2">
            <Label htmlFor="alt" className="text-xs text-muted-foreground flex items-center gap-1">
              <Type className="w-3 h-3" />
              Alt Text
            </Label>
            <Input
              id="alt"
              value={block.altText || ''}
              onChange={(e) => onUpdate(block.id, { altText: e.target.value })}
              placeholder="Describe this section..."
              className="h-9"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
