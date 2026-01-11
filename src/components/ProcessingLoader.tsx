import { Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProcessingLoaderProps {
  currentStatus: string;
}

const STAGES = [
  { id: 'upload', label: 'Upload' },
  { id: 'slice', label: 'Slice' },
  { id: 'cloud', label: 'Cloud' },
  { id: 'ai', label: 'AI' },
];

export function ProcessingLoader({ currentStatus }: ProcessingLoaderProps) {
  // Status logic
  const getStageStatus = (stageId: string): 'pending' | 'active' | 'complete' => {
    const status = currentStatus.toLowerCase();
    
    if (stageId === 'upload') {
      if (status.includes('slicing') || status.includes('uploading slice') || status.includes('preparing') || status.includes('analyzing')) return 'complete';
      if (status.includes('uploading original')) return 'active';
      return 'pending';
    }
    if (stageId === 'slice') {
      if (status.includes('uploading slice') || status.includes('preparing') || status.includes('analyzing')) return 'complete';
      if (status.includes('slicing')) return 'active';
      return 'pending';
    }
    if (stageId === 'cloud') {
      if (status.includes('preparing') || status.includes('analyzing')) return 'complete';
      if (status.includes('uploading slice')) return 'active';
      return 'pending';
    }
    if (stageId === 'ai') {
      if (status.includes('analyzing') || status.includes('preparing')) return 'active';
      return 'pending';
    }
    return 'pending';
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background/95 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-6">
        {/* Main spinner */}
        <div className="relative">
          <div className="w-16 h-16 rounded-full border-4 border-muted animate-pulse" />
          <Loader2 className="absolute inset-0 m-auto w-8 h-8 text-primary animate-spin" />
        </div>

        {/* Status text */}
        <p className="text-lg font-medium text-foreground">{currentStatus}</p>

        {/* Stage indicators */}
        <div className="flex items-center gap-3 px-4 py-2 bg-muted/50 rounded-full">
          {STAGES.map((stage, i) => {
            const status = getStageStatus(stage.id);
            return (
              <div key={stage.id} className="flex items-center gap-1">
                {status === 'complete' ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : status === 'active' ? (
                  <Loader2 className="w-4 h-4 text-primary animate-spin" />
                ) : (
                  <span className="w-4 h-4 rounded-full border border-muted-foreground/30" />
                )}
                <span className={cn(
                  "text-xs",
                  status === 'complete' && "text-muted-foreground",
                  status === 'active' && "text-foreground font-medium",
                  status === 'pending' && "text-muted-foreground/50"
                )}>
                  {stage.label}
                </span>
                {i < STAGES.length - 1 && <span className="text-muted-foreground/30 mx-1">→</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
