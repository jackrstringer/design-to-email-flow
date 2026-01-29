import { useState, useEffect } from 'react';

interface ProcessingTimerProps {
  createdAt: string | null;
  completedAt: string | null;
  status: string | null;
  visible: boolean;
  onToggle: () => void;
}

export function ProcessingTimer({ createdAt, completedAt, status, visible, onToggle }: ProcessingTimerProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!createdAt) return;

    const start = new Date(createdAt).getTime();
    const isCompleted = status !== 'processing';

    if (isCompleted && completedAt) {
      // Frozen duration: completed_at - created_at
      const end = new Date(completedAt).getTime();
      setElapsed(Math.floor((end - start) / 1000));
      // No interval needed - duration is fixed
    } else {
      // Still processing: tick against current time
      const now = Date.now();
      setElapsed(Math.floor((now - start) / 1000));

      if (status === 'processing') {
        const interval = setInterval(() => {
          setElapsed(Math.floor((Date.now() - start) / 1000));
        }, 1000);
        return () => clearInterval(interval);
      }
    }
  }, [createdAt, completedAt, status]);

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const display = `${minutes}m ${seconds}s`;

  return (
    <div 
      className="w-10 flex-shrink-0 flex items-center justify-center cursor-pointer"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      {visible && (
        <span className="text-[10px] text-gray-400 whitespace-nowrap">
          {display}
        </span>
      )}
    </div>
  );
}
