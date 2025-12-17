import { useState } from 'react';
import { Plus, Trash2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getSocialIconUrl, getSupportedPlatforms, PLATFORM_COLORS } from '@/lib/socialIcons';
import type { SocialLink } from '@/types/brand-assets';

interface SocialLinksEditorProps {
  socialLinks: SocialLink[];
  onChange: (links: SocialLink[]) => void;
  iconColor?: string; // Hex color for icons (default: white)
}

export function SocialLinksEditor({ socialLinks, onChange, iconColor = 'ffffff' }: SocialLinksEditorProps) {
  const [newPlatform, setNewPlatform] = useState<string>('');
  const [newUrl, setNewUrl] = useState('');

  const supportedPlatforms = getSupportedPlatforms();
  const usedPlatforms = socialLinks.map(l => l.platform);
  const availablePlatforms = supportedPlatforms.filter(p => !usedPlatforms.includes(p as any));

  const handleAdd = () => {
    if (!newPlatform || !newUrl) return;
    
    const newLink: SocialLink = {
      platform: newPlatform as SocialLink['platform'],
      url: newUrl.startsWith('http') ? newUrl : `https://${newUrl}`,
    };
    
    onChange([...socialLinks, newLink]);
    setNewPlatform('');
    setNewUrl('');
  };

  const handleRemove = (index: number) => {
    const updated = socialLinks.filter((_, i) => i !== index);
    onChange(updated);
  };

  const handleUrlChange = (index: number, url: string) => {
    const updated = socialLinks.map((link, i) => 
      i === index ? { ...link, url: url.startsWith('http') ? url : `https://${url}` } : link
    );
    onChange(updated);
  };

  return (
    <div className="space-y-4">
      {/* Existing links */}
      {socialLinks.length > 0 && (
        <div className="space-y-3">
          {socialLinks.map((link, index) => (
            <div key={index} className="flex items-center gap-3 group">
              {/* Icon preview */}
              <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                <img 
                  src={getSocialIconUrl(link.platform, iconColor)} 
                  alt={link.platform}
                  className="w-5 h-5"
                  style={{ filter: iconColor === 'ffffff' ? 'none' : undefined }}
                />
              </div>
              
              {/* Platform label */}
              <span className="text-sm font-medium capitalize w-20 flex-shrink-0">
                {link.platform}
              </span>
              
              {/* URL input */}
              <Input
                value={link.url}
                onChange={(e) => handleUrlChange(index, e.target.value)}
                placeholder={`https://${link.platform}.com/...`}
                className="flex-1 text-sm"
              />
              
              {/* Actions */}
              <a 
                href={link.url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
              
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleRemove(index)}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Add new link */}
      {availablePlatforms.length > 0 && (
        <div className="flex items-end gap-3 pt-2 border-t border-border/50">
          <div className="space-y-1.5 flex-shrink-0">
            <Label className="text-xs text-muted-foreground">Platform</Label>
            <Select value={newPlatform} onValueChange={setNewPlatform}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                {availablePlatforms.map(platform => (
                  <SelectItem key={platform} value={platform}>
                    <div className="flex items-center gap-2">
                      <img 
                        src={getSocialIconUrl(platform, PLATFORM_COLORS[platform] || '666666')} 
                        alt={platform}
                        className="w-4 h-4"
                      />
                      <span className="capitalize">{platform}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-1.5 flex-1">
            <Label className="text-xs text-muted-foreground">URL</Label>
            <Input
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="https://..."
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            />
          </div>
          
          <Button 
            variant="secondary" 
            size="sm"
            onClick={handleAdd}
            disabled={!newPlatform || !newUrl}
          >
            <Plus className="w-4 h-4 mr-1" />
            Add
          </Button>
        </div>
      )}

      {/* Icon color info */}
      <p className="text-[10px] text-muted-foreground/60">
        Icons powered by Simple Icons • Color: #{iconColor}
      </p>
    </div>
  );
}
