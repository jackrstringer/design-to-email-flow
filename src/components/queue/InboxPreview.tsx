import { cn } from '@/lib/utils';

interface InboxPreviewProps {
  senderName: string;
  subjectLine: string | null;
  previewText: string | null;
  className?: string;
  avatarColor?: string;
}

export function InboxPreview({
  senderName,
  subjectLine,
  previewText,
  className,
  avatarColor,
}: InboxPreviewProps) {
  // Use provided color or fallback to gray
  const bgColor = avatarColor || '#6b7280';
  
  return (
    <div className={cn('p-3', className)}>
      <div className="flex items-center gap-2 mb-1">
        <div 
          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium text-white flex-shrink-0"
          style={{ backgroundColor: bgColor }}
        >
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
