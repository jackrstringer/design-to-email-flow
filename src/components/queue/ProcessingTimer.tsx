import { useState, useEffect } from 'react';

interface ProcessingTimerProps {
  createdAt: string | null;
  status: string | null;
  visible: boolean;
  onToggle: () => void;
}

export function ProcessingTimer({ createdAt, status, visible, onToggle }: ProcessingTimerProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!createdAt) return;

    const start = new Date(createdAt).getTime();
    const now = Date.now();
    setElapsed(Math.floor((now - start) / 1000));

    // Only tick if still processing
    if (status === 'processing') {
      const interval = setInterval(() => {
        setElapsed(Math.floor((Date.now() - start) / 1000));
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [createdAt, status]);

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
