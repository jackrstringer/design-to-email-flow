import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface ProcessingTimerProps {
  createdAt: string;
  updatedAt: string;
  status: string;
  isVisible: boolean;
  onToggle: () => void;
}

export function ProcessingTimer({ createdAt, updatedAt, status, isVisible, onToggle }: ProcessingTimerProps) {
  const [elapsed, setElapsed] = useState(0);
  
  useEffect(() => {
    const startTime = new Date(createdAt).getTime();
    
    // If still processing, update every second
    if (status === 'processing') {
      // Set initial value immediately
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
      
      const interval = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
      return () => clearInterval(interval);
    }
    
    // If complete, show final time (frozen)
    const endTime = new Date(updatedAt).getTime();
    setElapsed(Math.floor((endTime - startTime) / 1000));
  }, [createdAt, updatedAt, status]);
  
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const display = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
  
  return (
    <div 
      className="w-14 flex-shrink-0 px-1 cursor-pointer flex items-center justify-center"
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      title={isVisible ? "Click to hide timers" : "Click to show timers"}
    >
      {isVisible ? (
        <span className={cn(
          "text-[10px] tabular-nums font-mono",
          status === 'processing' ? "text-blue-500" : "text-gray-400"
        )}>
          {display}
        </span>
      ) : (
        <span className="text-[10px] text-gray-300">•••</span>
      )}
    </div>
  );
}
