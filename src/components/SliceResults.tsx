import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Link, Unlink, ExternalLink, ChevronLeft, Rocket, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ProcessedSlice {
  imageUrl: string;
  altText: string;
  link: string | null;
  isClickable: boolean;
}

interface SliceResultsProps {
  slices: ProcessedSlice[];
  onSlicesChange: (slices: ProcessedSlice[]) => void;
  onBack: () => void;
  onCreateTemplate: () => void;
  onCreateCampaign: () => void;
  isCreating: boolean;
}

export function SliceResults({ 
  slices, 
  onSlicesChange, 
  onBack, 
  onCreateTemplate, 
  onCreateCampaign,
  isCreating 
}: SliceResultsProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const updateSlice = (index: number, updates: Partial<ProcessedSlice>) => {
    const updated = [...slices];
    updated[index] = { ...updated[index], ...updates };
    onSlicesChange(updated);
  };

  const toggleLink = (index: number) => {
    const slice = slices[index];
    if (slice.link) {
      updateSlice(index, { link: null, isClickable: false });
    } else {
      updateSlice(index, { link: '', isClickable: true });
      setEditingIndex(index);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Review Slices</h3>
          <p className="text-sm text-muted-foreground">
            Edit alt text and links before creating your template
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onBack} disabled={isCreating}>
          <ChevronLeft className="w-4 h-4 mr-1" />
          Back
        </Button>
      </div>

      {/* Slices list */}
      <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
        {slices.map((slice, index) => (
          <div 
            key={index}
            className="flex gap-3 p-3 rounded-lg border border-border bg-muted/30"
          >
            {/* Thumbnail */}
            <div className="w-20 h-20 flex-shrink-0 rounded overflow-hidden border border-border bg-background">
              <img 
                src={slice.imageUrl} 
                alt={slice.altText}
                className="w-full h-full object-cover object-top"
              />
            </div>

            {/* Details */}
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  Slice {index + 1}
                </span>
              </div>

              {/* Alt text */}
              <Input
                value={slice.altText}
                onChange={(e) => updateSlice(index, { altText: e.target.value })}
                placeholder="Alt text"
                className="h-8 text-sm"
              />

              {/* Link */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleLink(index)}
                  className={cn(
                    'flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors',
                    slice.link !== null
                      ? 'bg-primary/10 text-primary hover:bg-primary/20'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  )}
                >
                  {slice.link !== null ? (
                    <><Link className="w-3 h-3" /> Linked</>
                  ) : (
                    <><Unlink className="w-3 h-3" /> No link</>
                  )}
                </button>

                {slice.link !== null && (
                  <Input
                    value={slice.link}
                    onChange={(e) => updateSlice(index, { link: e.target.value })}
                    placeholder="https://..."
                    className="h-7 text-xs flex-1"
                    autoFocus={editingIndex === index}
                    onFocus={() => setEditingIndex(index)}
                    onBlur={() => setEditingIndex(null)}
                  />
                )}

                {slice.link && (
                  <a
                    href={slice.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1 text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <Button 
          variant="outline" 
          onClick={onCreateTemplate} 
          disabled={isCreating}
          className="flex-1"
        >
          <FileText className="w-4 h-4 mr-2" />
          Create Template
        </Button>
        <Button 
          onClick={onCreateCampaign} 
          disabled={isCreating}
          className="flex-1"
        >
          <Rocket className="w-4 h-4 mr-2" />
          {isCreating ? 'Creating...' : 'Create Campaign'}
        </Button>
      </div>
    </div>
  );
}
