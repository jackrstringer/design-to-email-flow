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
}: InboxPreviewProps) {
  return (
    <div className={cn('p-3', className)}>
      <div className="mb-1 flex items-center gap-2.5">
        {/* Neutral chrome — client brand colors stay out of the app UI. */}
        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold text-foreground/70">
          {senderName.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between">
            <span className="truncate text-[13px] font-semibold">{senderName}</span>
            <span className="ml-2 flex-shrink-0 text-[11px] text-muted-foreground">now</span>
          </div>
        </div>
      </div>
      <div className="pl-[38px]">
        <p className="truncate text-[13px] font-medium">
          {subjectLine || <span className="italic text-muted-foreground">No subject line selected</span>}
        </p>
        <p className="truncate text-[12px] text-muted-foreground">
          {previewText || <span className="italic">No preview text selected</span>}
        </p>
      </div>
    </div>
  );
}
