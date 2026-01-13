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
  const [editingAlt, setEditingAlt] = useState(false);

  const toggleLink = () => {
    if (slice.link !== null && slice.link !== undefined) {
      onUpdate({ link: null });
    } else {
      onUpdate({ link: '' });
      setEditingLink(true);
    }
  };

  const placeholderPattern = /^(Slice|Section|Email section|Email Section)\s*\d+$/i;
  const hasPlaceholderAlt = !slice.altText || placeholderPattern.test(slice.altText.trim());

  return (
    <div className="flex items-start gap-2 py-1.5 px-2 rounded hover:bg-muted/50 transition-colors group">
      {/* Small thumbnail */}
      <div className="w-10 h-10 flex-shrink-0 rounded overflow-hidden border border-border bg-background">
        {slice.imageUrl ? (
          <img
            src={slice.imageUrl}
            alt={slice.altText || `Slice ${index + 1}`}
            className="w-full h-full object-cover object-top"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground">
            {index + 1}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-0.5">
        {/* Row 1: Slice label + link toggle + link input */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-medium text-muted-foreground w-12 flex-shrink-0">
            Slice {index + 1}
          </span>

          <button
            onClick={toggleLink}
            className={cn(
              'flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors flex-shrink-0',
              slice.link !== null && slice.link !== undefined
                ? 'bg-primary/10 text-primary hover:bg-primary/20'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
          >
            {slice.link !== null && slice.link !== undefined ? (
              <><Link className="w-2.5 h-2.5" /></>
            ) : (
              <><Unlink className="w-2.5 h-2.5" /></>
            )}
          </button>

          {slice.link !== null && slice.link !== undefined && (
            <Input
              value={slice.link}
              onChange={(e) => onUpdate({ link: e.target.value })}
              placeholder="https://..."
              className="h-5 text-[10px] flex-1 min-w-0 px-1.5"
              autoFocus={editingLink}
              onFocus={() => setEditingLink(true)}
              onBlur={() => setEditingLink(false)}
            />
          )}

          {slice.link && (
            <>
              {slice.linkVerified ? (
                <span title="Verified">
                  <CheckCircle className="w-3 h-3 text-green-500 flex-shrink-0" />
                </span>
              ) : (
                <span title={slice.linkWarning || "Unverified"}>
                  <AlertTriangle className="w-3 h-3 text-amber-500 flex-shrink-0" />
                </span>
              )}
              <a
                href={slice.link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground flex-shrink-0"
              >
                <ExternalLink className="w-3 h-3" />
              </a>
            </>
          )}
        </div>

        {/* Row 2: Alt text (click to edit) */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground w-12 flex-shrink-0">Alt:</span>
          {editingAlt ? (
            <Input
              value={slice.altText || ''}
              onChange={(e) => onUpdate({ altText: e.target.value })}
              placeholder="Alt text"
              className="h-5 text-[10px] flex-1 min-w-0 px-1.5"
              autoFocus
              onBlur={() => setEditingAlt(false)}
              onKeyDown={(e) => e.key === 'Enter' && setEditingAlt(false)}
            />
          ) : (
            <button
              onClick={() => setEditingAlt(true)}
              className={cn(
                "text-[10px] text-left truncate flex-1 min-w-0 hover:underline",
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
