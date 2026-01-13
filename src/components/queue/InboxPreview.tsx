import { cn } from '@/lib/utils';

interface InboxPreviewProps {
  senderName: string;
  subjectLine: string | null;
  previewText: string | null;
  className?: string;
}

export function InboxPreview({
  senderName,
  subjectLine,
  previewText,
  className,
}: InboxPreviewProps) {
  return (
    <div className={cn('border rounded-lg bg-background p-3', className)}>
      <div className="flex items-center gap-2 mb-1">
        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
          {senderName.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="font-medium text-sm truncate">{senderName}</span>
            <span className="text-xs text-muted-foreground flex-shrink-0 ml-2">now</span>
          </div>
        </div>
      </div>
      <div className="pl-10">
        <p className="font-medium text-sm truncate">
          {subjectLine || <span className="text-muted-foreground italic">No subject line selected</span>}
        </p>
        <p className="text-sm text-muted-foreground truncate">
          {previewText || <span className="italic">No preview text selected</span>}
        </p>
      </div>
    </div>
  );
}
