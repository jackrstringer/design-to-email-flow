import { useState, useEffect } from 'react';
import { ExternalLink, Check, AlertCircle, Link as LinkIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import type { ImageFooterSlice } from '@/types/footer';

interface SliceEditorGridProps {
  slices: ImageFooterSlice[];
  brandId: string;
  onSliceUpdate: (index: number, updates: Partial<ImageFooterSlice>) => void;
}

interface LinkSuggestion {
  url: string;
  title: string | null;
  link_type: string;
}

export function SliceEditorGrid({ slices, brandId, onSliceUpdate }: SliceEditorGridProps) {
  const [linkSuggestions, setLinkSuggestions] = useState<Record<number, LinkSuggestion[]>>({});
  const [focusedSlice, setFocusedSlice] = useState<number | null>(null);

  // Fetch link suggestions from brand_link_index
  useEffect(() => {
    const fetchSuggestions = async () => {
      const { data } = await supabase
        .from('brand_link_index')
        .select('url, title, link_type')
        .eq('brand_id', brandId)
        .eq('is_healthy', true)
        .order('use_count', { ascending: false })
        .limit(20);

      if (data) {
        // Pre-populate suggestions for each slice
        const suggestions: Record<number, LinkSuggestion[]> = {};
        slices.forEach((_, idx) => {
          suggestions[idx] = data;
        });
        setLinkSuggestions(suggestions);
      }
    };

    fetchSuggestions();
  }, [brandId, slices.length]);

  const getLinkSourceBadge = (slice: ImageFooterSlice) => {
    const source = slice.linkSource;
    if (!source) return null;

    const variants: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
      'index': { label: 'Matched', variant: 'default' },
      'default': { label: 'Default', variant: 'secondary' },
      'rule': { label: 'Rule', variant: 'outline' },
      'manual': { label: 'Manual', variant: 'outline' },
      'needs_search': { label: 'Needs URL', variant: 'destructive' },
      'not_clickable': { label: 'Non-clickable', variant: 'secondary' },
    };

    const config = variants[source] || { label: source, variant: 'outline' };
    return <Badge variant={config.variant} className="text-[10px]">{config.label}</Badge>;
  };

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {slices.map((slice, index) => (
        <div
          key={index}
          className="border rounded-lg p-3 bg-card hover:border-primary/50 transition-colors"
        >
          {/* Slice preview */}
          <div className="mb-3 flex items-start gap-3">
            <div className="w-16 h-16 rounded border bg-muted overflow-hidden flex-shrink-0">
              {slice.imageUrl ? (
                <img
                  src={slice.imageUrl}
                  alt={slice.altText || `Slice ${index + 1}`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                  <AlertCircle className="w-5 h-5" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {slice.name || `Slice ${index + 1}`}
              </p>
              <div className="flex items-center gap-1 mt-1">
                {getLinkSourceBadge(slice)}
                {slice.linkVerified && (
                  <Check className="w-3 h-3 text-green-600" />
                )}
              </div>
              {slice.hasCTA && slice.ctaText && (
                <p className="text-xs text-muted-foreground mt-1 truncate">
                  CTA: {slice.ctaText}
                </p>
              )}
            </div>
          </div>

          {/* Alt text input */}
          <div className="space-y-1.5 mb-3">
            <Label className="text-xs">Alt Text</Label>
            <Input
              value={slice.altText || ''}
              onChange={(e) => onSliceUpdate(index, { altText: e.target.value })}
              placeholder="Describe this image..."
              className="h-8 text-sm"
            />
          </div>

          {/* Link input */}
          {slice.isClickable && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs flex items-center gap-1">
                  <LinkIcon className="w-3 h-3" />
                  Link URL
                </Label>
                {slice.link && (
                  <a
                    href={slice.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-primary"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              <div className="relative">
                <Input
                  value={slice.link || ''}
                  onChange={(e) => onSliceUpdate(index, { 
                    link: e.target.value,
                    linkSource: 'manual',
                  })}
                  onFocus={() => setFocusedSlice(index)}
                  onBlur={() => setTimeout(() => setFocusedSlice(null), 200)}
                  placeholder="https://..."
                  className="h-8 text-sm"
                />
                
                {/* Autocomplete dropdown */}
                {focusedSlice === index && linkSuggestions[index]?.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg z-50 max-h-48 overflow-auto">
                    {linkSuggestions[index]
                      .filter(s => !slice.link || s.url.toLowerCase().includes(slice.link.toLowerCase()))
                      .slice(0, 6)
                      .map((suggestion, sIdx) => (
                        <button
                          key={sIdx}
                          type="button"
                          className="w-full text-left px-3 py-2 hover:bg-muted text-sm"
                          onMouseDown={() => {
                            onSliceUpdate(index, { 
                              link: suggestion.url,
                              linkSource: 'index',
                              linkVerified: true,
                            });
                          }}
                        >
                          <p className="font-medium truncate">{suggestion.title || suggestion.url}</p>
                          <p className="text-xs text-muted-foreground truncate">{suggestion.url}</p>
                        </button>
                      ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Non-clickable indicator */}
          {!slice.isClickable && (
            <p className="text-xs text-muted-foreground italic">
              Non-clickable element
            </p>
          )}
        </div>
      ))}

      {slices.length === 0 && (
        <div className="col-span-full text-center py-8 text-muted-foreground">
          No slices detected
        </div>
      )}
    </div>
  );
}
