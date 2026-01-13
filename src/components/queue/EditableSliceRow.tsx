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
  const [isEditingLink, setIsEditingLink] = useState(false);

  const toggleLink = () => {
    if (slice.link) {
      onUpdate({ link: null });
    } else {
      onUpdate({ link: '' });
      setIsEditingLink(true);
    }
  };

  return (
    <div className="flex gap-3 py-2 border-b border-border/50 last:border-b-0">
      {/* Slice thumbnail */}
      <div className="w-16 h-16 flex-shrink-0 rounded overflow-hidden border border-border bg-muted">
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
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground w-12">Alt:</span>
          <Input
            value={slice.altText || ''}
            onChange={(e) => onUpdate({ altText: e.target.value })}
            placeholder="Alt text..."
            className="h-7 text-xs flex-1"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground w-12">Link:</span>
          <button
            onClick={toggleLink}
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors flex-shrink-0',
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
            <>
              <Input
                value={slice.link}
                onChange={(e) => onUpdate({ link: e.target.value })}
                placeholder="https://..."
                className="h-7 text-xs flex-1"
                autoFocus={isEditingLink}
                onFocus={() => setIsEditingLink(true)}
                onBlur={() => setIsEditingLink(false)}
              />

              {slice.link && (
                <>
                  {slice.linkVerified ? (
                    <span className="flex-shrink-0" title="Verified">
                      <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                    </span>
                  ) : (
                    <span className="flex-shrink-0" title={slice.linkWarning || "Unverified"}>
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                    </span>
                  )}
                  <a
                    href={slice.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1 text-muted-foreground hover:text-foreground flex-shrink-0"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </>
              )}
            </>
          )}
        </div>

        {slice.link && slice.linkWarning && (
          <div className="flex items-center gap-1 text-xs text-amber-500 pl-14">
            <AlertTriangle className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{slice.linkWarning}</span>
          </div>
        )}
      </div>
    </div>
  );
}
