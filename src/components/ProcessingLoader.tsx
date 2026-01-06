import { useState, useEffect } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProcessingStage {
  id: string;
  label: string;
  icon: string;
}

interface ProcessingLoaderProps {
  currentStatus: string;
}

const STAGES: ProcessingStage[] = [
  { id: 'upload', label: 'Uploading original image', icon: '📤' },
  { id: 'slice', label: 'Slicing into sections', icon: '✂️' },
  { id: 'cloud', label: 'Uploading to cloud', icon: '☁️' },
  { id: 'ai', label: 'AI analyzing your email', icon: '🤖' },
];

const FUN_FACTS = [
  "Alt text helps screen readers describe images to visually impaired users",
  "Well-structured emails can improve click-through rates by 30%",
  "Mobile devices account for 60% of email opens",
  "The average email is scanned for only 11 seconds",
  "Personalized subject lines increase open rates by 50%",
];

export function ProcessingLoader({ currentStatus }: ProcessingLoaderProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [catFrame, setCatFrame] = useState(0);
  const [factIndex, setFactIndex] = useState(0);

  // Timer
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedSeconds(s => s + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Cat animation
  useEffect(() => {
    const interval = setInterval(() => {
      setCatFrame(f => (f + 1) % 2);
    }, 400);
    return () => clearInterval(interval);
  }, []);

  // Rotate fun facts every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setFactIndex(i => (i + 1) % FUN_FACTS.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Determine completed stages based on status
  const getStageStatus = (stageId: string): 'pending' | 'active' | 'complete' => {
    const status = currentStatus.toLowerCase();
    
    if (stageId === 'upload') {
      if (status.includes('slicing') || status.includes('uploading slice') || status.includes('preparing') || status.includes('analyzing')) {
        return 'complete';
      }
      if (status.includes('uploading original')) return 'active';
      return 'pending';
    }
    
    if (stageId === 'slice') {
      if (status.includes('uploading slice') || status.includes('preparing') || status.includes('analyzing')) {
        return 'complete';
      }
      if (status.includes('slicing')) return 'active';
      return 'pending';
    }
    
    if (stageId === 'cloud') {
      if (status.includes('preparing') || status.includes('analyzing')) {
        return 'complete';
      }
      if (status.includes('uploading slice')) return 'active';
      return 'pending';
    }
    
    if (stageId === 'ai') {
      if (status.includes('analyzing') || status.includes('preparing')) return 'active';
      return 'pending';
    }
    
    return 'pending';
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const catEmojis = ['🐱', '😺'];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-6 max-w-md w-full px-8">
        {/* Dancing cat */}
        <div 
          className="text-6xl transition-transform duration-200"
          style={{ 
            transform: catFrame === 0 ? 'translateY(0) rotate(-5deg)' : 'translateY(-8px) rotate(5deg)'
          }}
        >
          {catEmojis[catFrame]}
        </div>

        {/* Timer */}
        <div className="text-2xl font-mono text-foreground font-semibold">
          {formatTime(elapsedSeconds)}
        </div>

        {/* Progress checklist */}
        <div className="w-full space-y-3 bg-card rounded-lg border border-border p-4">
          {STAGES.map((stage) => {
            const status = getStageStatus(stage.id);
            return (
              <div 
                key={stage.id} 
                className={cn(
                  "flex items-center gap-3 transition-opacity duration-300",
                  status === 'pending' && "opacity-40"
                )}
              >
                <div className="w-6 h-6 flex items-center justify-center">
                  {status === 'complete' ? (
                    <Check className="w-5 h-5 text-green-500" />
                  ) : status === 'active' ? (
                    <Loader2 className="w-5 h-5 text-primary animate-spin" />
                  ) : (
                    <span className="text-lg">{stage.icon}</span>
                  )}
                </div>
                <span className={cn(
                  "text-sm",
                  status === 'complete' && "text-muted-foreground line-through",
                  status === 'active' && "text-foreground font-medium",
                  status === 'pending' && "text-muted-foreground"
                )}>
                  {stage.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Fun fact */}
        <div className="text-center px-4">
          <p className="text-xs text-muted-foreground italic">
            💡 {FUN_FACTS[factIndex]}
          </p>
        </div>
      </div>
    </div>
  );
}
