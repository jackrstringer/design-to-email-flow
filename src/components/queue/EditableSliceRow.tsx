import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Link, Unlink, ExternalLink, CheckCircle, AlertTriangle } from 'lucide-react';
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
  const [editingLink, setEditingLink] = useState(false);

  const toggleLink = () => {
    if (slice.link !== null && slice.link !== undefined) {
      onUpdate({ link: null });
    } else {
      onUpdate({ link: '' });
      setEditingLink(true);
    }
  };

  return (
    <div className="p-3 rounded-lg border bg-muted/30 border-border">
      <div className="flex gap-3">
        {/* Thumbnail */}
        <div className="w-20 h-20 flex-shrink-0 rounded overflow-hidden border border-border bg-background">
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

        {/* Details */}
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              Slice {index + 1}
            </span>
          </div>

          {/* Alt text */}
          <Input
            value={slice.altText || ''}
            onChange={(e) => onUpdate({ altText: e.target.value })}
            placeholder="Alt text"
            className="h-8 text-sm"
          />

          {/* Link */}
          <div className="flex items-center gap-2">
            <button
              onClick={toggleLink}
              className={cn(
                'flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors',
                slice.link !== null && slice.link !== undefined
                  ? 'bg-primary/10 text-primary hover:bg-primary/20'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              {slice.link !== null && slice.link !== undefined ? (
                <><Link className="w-3 h-3" /> Linked</>
              ) : (
                <><Unlink className="w-3 h-3" /> No link</>
              )}
            </button>

            {slice.link !== null && slice.link !== undefined && (
              <Input
                value={slice.link}
                onChange={(e) => onUpdate({ link: e.target.value })}
                placeholder="https://..."
                className="h-7 text-xs flex-1"
                autoFocus={editingLink}
                onFocus={() => setEditingLink(true)}
                onBlur={() => setEditingLink(false)}
              />
            )}

            {slice.link && (
              <>
                {/* Link verification status */}
                {slice.linkVerified ? (
                  <div className="flex items-center gap-1 text-green-500" title="Verified via web search">
                    <CheckCircle className="w-3.5 h-3.5" />
                  </div>
                ) : slice.linkWarning ? (
                  <div className="flex items-center gap-1 text-amber-500" title={slice.linkWarning}>
                    <AlertTriangle className="w-3.5 h-3.5" />
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-amber-500" title="Unverified link">
                    <AlertTriangle className="w-3.5 h-3.5" />
                  </div>
                )}
                <a
                  href={slice.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1 text-muted-foreground hover:text-foreground"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </>
            )}
          </div>

          {/* Link warning message */}
          {slice.link && slice.linkWarning && (
            <div className="flex items-center gap-1 text-xs text-amber-500">
              <AlertTriangle className="w-3 h-3 flex-shrink-0" />
              <span>{slice.linkWarning}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
