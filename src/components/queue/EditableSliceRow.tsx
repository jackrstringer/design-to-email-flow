import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Link, ExternalLink, CheckCircle, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SliceData {
  imageUrl?: string;
  altText?: string;
  link?: string | null;
  linkVerified?: boolean;
  linkWarning?: string;
}

interface EditableSliceRowProps {
  slice: SliceData;
  index: number;
  onUpdate: (updates: Partial<SliceData>) => void;
}

export function EditableSliceRow({ slice, index, onUpdate }: EditableSliceRowProps) {
  const [editingAlt, setEditingAlt] = useState(false);

  const toggleLink = () => {
    if (slice.link !== null && slice.link !== undefined) {
      onUpdate({ link: null });
    } else {
      onUpdate({ link: '' });
    }
  };

  const placeholderPattern = /^(Slice|Section|Email section|Email Section)\s*\d+$/i;
  const hasPlaceholderAlt = !slice.altText || placeholderPattern.test(slice.altText.trim());
  const hasLink = slice.link !== null && slice.link !== undefined;

  return (
    <div className="flex items-start gap-3 py-2 border-b border-border/30 last:border-b-0">
      {/* Thumbnail - 48x48 */}
      <div className="w-12 h-12 flex-shrink-0 rounded overflow-hidden bg-muted border border-border">
        {slice.imageUrl ? (
          <img
            src={slice.imageUrl}
            alt={slice.altText || `Slice ${index + 1}`}
            className="w-full h-full object-cover object-top"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
            {index + 1}
          </div>
        )}
      </div>

      {/* Content - fills remaining space */}
      <div className="flex-1 min-w-0 space-y-1">
        {/* Row 1: Slice label */}
        <div className="text-xs font-medium text-foreground">Slice {index + 1}</div>
        
        {/* Row 2: Link input (full width) with icons */}
        <div className="flex items-center gap-2">
          <button 
            onClick={toggleLink}
            className={cn(
              "w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-colors",
              hasLink 
                ? "bg-primary/10 text-primary hover:bg-primary/20" 
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
            title={hasLink ? "Remove link" : "Add link"}
          >
            <Link className="w-3 h-3" />
          </button>
          
          {hasLink ? (
            <>
              <Input 
                value={slice.link || ''} 
                onChange={(e) => onUpdate({ link: e.target.value })}
                placeholder="https://..."
                className="h-6 text-xs flex-1 min-w-0"
              />
              {slice.link && (
                <>
                  {slice.linkVerified ? (
                    <span title="Verified">
                      <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                    </span>
                  ) : (
                    <span title={slice.linkWarning || "Unverified"}>
                      <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                    </span>
                  )}
                  <a
                    href={slice.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground flex-shrink-0"
                    title="Open link"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </>
              )}
            </>
          ) : (
            <span className="text-xs text-muted-foreground italic">No link</span>
          )}
        </div>
        
        {/* Row 3: Alt text (click to edit) */}
        <div className="flex items-start gap-2">
          <span className="text-xs text-muted-foreground flex-shrink-0">Alt:</span>
          {editingAlt ? (
            <Input
              value={slice.altText || ''}
              onChange={(e) => onUpdate({ altText: e.target.value })}
              placeholder="Describe this image..."
              className="h-5 text-xs flex-1 min-w-0"
              autoFocus
              onBlur={() => setEditingAlt(false)}
              onKeyDown={(e) => e.key === 'Enter' && setEditingAlt(false)}
            />
          ) : (
            <button
              onClick={() => setEditingAlt(true)}
              className={cn(
                "text-xs text-left truncate flex-1 min-w-0 hover:underline cursor-pointer",
                hasPlaceholderAlt ? "text-amber-500 italic" : "text-muted-foreground"
              )}
            >
              {slice.altText || 'Click to add alt text'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
